require("dotenv").config();
const db = require("../config/db");
const admin = require("../config/firebase");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

// ===================== Email sender =====================
const sendOTPEmail = async (email, otp) => {
  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"artistmatch" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Your OTP Code",
      html: `<h2>Your OTP is: ${otp}</h2><p>This code expires in 10 minutes.</p>`,
    });

    console.log(`✅ OTP sent to ${email}`);
  } catch (err) {
    console.error("❌ Failed to send OTP:", err);
    throw new Error("Failed to send OTP email");
  }
};

// ===================== SIGNUP =====================
exports.signup = async (req, res) => {
  const { name, email, password, genres } = req.body;

  if (!name || !email || !password || !genres?.length) {
    return res.status(400).json({ error: "All fields required" });
  }

  try {
    // Check if user exists in Firebase
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) {
      return res.status(409).json({ error: "Email already registered" });
    }

    // Create Firebase user
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: name,
    });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Insert user into MySQL
    db.query(
      "INSERT INTO users (name, email, firebase_uid, otp, otp_expiry, is_verified) VALUES (?, ?, ?, ?, ?, 0)",
      [name, email, userRecord.uid, otp, otpExpiry],
      async (err, result) => {
        if (err) return res.status(500).json({ error: err.message });

        const userId = result.insertId;

        // Insert user genres
        const genreValues = genres.map((gid) => [userId, gid]);
        db.query(
          "INSERT INTO user_genres (user_id, genre_id) VALUES ?",
          [genreValues],
          async (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });

            // Send OTP email
            try {
              await sendOTPEmail(email, otp);
              return res.status(201).json({ message: "User created. OTP sent to email." });
            } catch (emailErr) {
              return res.status(500).json({ error: emailErr.message });
            }
          }
        );
      }
    );
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ===================== VERIFY OTP =====================
exports.verifyOTP = (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

  db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results.length) return res.status(404).json({ error: "User not found" });

    const user = results[0];

    if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (new Date() > new Date(user.otp_expiry)) return res.status(400).json({ error: "OTP expired" });

    db.query(
      "UPDATE users SET is_verified = 1, otp = NULL, otp_expiry = NULL WHERE email = ?",
      [email],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });
        return res.json({ message: "Verified successfully" });
      }
    );
  });
};

// ===================== RESEND OTP =====================
exports.resendOTP = (req, res) => {
  const { email } = req.body;

  if (!email) return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  db.query(
    "UPDATE users SET otp = ?, otp_expiry = ? WHERE email = ?",
    [otp, otpExpiry, email],
    async (err) => {
      if (err) return res.status(500).json({ error: err.message });

      try {
        await sendOTPEmail(email, otp);
        return res.json({ message: "OTP resent" });
      } catch (emailErr) {
        return res.status(500).json({ error: emailErr.message });
      }
    }
  );
};

// ===================== LOGIN =====================
exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

    // 🔐 Step 1: Authenticate with Firebase
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(401).json({
        error: data.error.message || "Invalid email or password",
      });
    }

    const firebaseUid = data.localId;

    // 🔎 Step 2: Check USERS table
    db.query(
      "SELECT id, name, email, is_verified, profile_image FROM users WHERE firebase_uid = ?",
      [firebaseUid],
      (err, userResults) => {
        if (err) return res.status(500).json({ error: err.message });

        if (userResults.length > 0) {
          const user = userResults[0];
          return res.json({
            role: "user",
            user: user,
            token: data.idToken,
            firebaseUid: firebaseUid,
          });
        }

        // 🔎 Step 3: Check ARTISTS table
        db.query(
          "SELECT * FROM artists WHERE firebase_uid = ?",
          [firebaseUid],
          (err2, artistResults) => {
            if (err2) return res.status(500).json({ error: err2.message });

            if (artistResults.length === 0) {
              return res.status(404).json({ error: "Account not found in users or artists" });
            }

            const artist = artistResults[0];
            return res.json({
              role: "artist",
              artist: artist,
              token: data.idToken,
              firebaseUid: firebaseUid,
            });
          }
        );
      }
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
};