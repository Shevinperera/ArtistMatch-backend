require("dotenv").config();
const db = require("../config/db");
const admin = require("../config/firebase");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

// ===================== EMAIL =====================
const sendOTPEmail = async (email, otp) => {
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
    html: `
      <h2>Your OTP is: ${otp}</h2>
      <p>This code expires in 10 minutes.</p>
    `,
  });
};

// ===================== ARTIST SIGNUP =====================
exports.artistSignup = async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    gender,
    language,
    location,
    genre_id,
    spotify_artist_id,
  } = req.body;

  if (
    !name ||
    !email ||
    !password ||
    !role ||
    !gender ||
    !language ||
    !location ||
    !genre_id
  ) {
    return res.status(400).json({ error: "All fields required" });
  }

  try {
    // Check Firebase
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
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Insert into DB
    db.query(
      `INSERT INTO artists 
      (name, email, firebase_uid, role, gender, language, location, spotify_artist_id, genre_id, otp, otp_expiry, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        name,
        email,
        userRecord.uid,
        role,
        gender,
        language,
        location,
        spotify_artist_id || null,
        genre_id,
        otp,
        otpExpiry,
      ],
      async (err) => {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await sendOTPEmail(email, otp);
          return res.status(201).json({
            message: "Artist created. OTP sent to email.",
          });
        } catch (e) {
          return res.status(500).json({ error: "Email sending failed" });
        }
      }
    );
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

// ===================== VERIFY OTP =====================
exports.verifyArtistOTP = (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp)
    return res.status(400).json({ error: "Email and OTP required" });

  db.query("SELECT * FROM artists WHERE email = ?", [email], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!results.length)
      return res.status(404).json({ error: "Artist not found" });

    const artist = results[0];

    if (artist.otp !== otp)
      return res.status(400).json({ error: "Invalid OTP" });

    if (new Date() > new Date(artist.otp_expiry))
      return res.status(400).json({ error: "OTP expired" });

    db.query(
      "UPDATE artists SET is_verified = 1, otp = NULL, otp_expiry = NULL WHERE email = ?",
      [email],
      (err2) => {
        if (err2) return res.status(500).json({ error: err2.message });

        return res.json({ message: "Artist verified successfully" });
      }
    );
  });
};

// ===================== RESEND OTP =====================
exports.resendArtistOTP = (req, res) => {
  const { email } = req.body;

  if (!email)
    return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  db.query(
    "UPDATE artists SET otp = ?, otp_expiry = ? WHERE email = ?",
    [otp, otpExpiry, email],
    async (err) => {
      if (err) return res.status(500).json({ error: err.message });

      try {
        await sendOTPEmail(email, otp);
        return res.json({ message: "OTP resent" });
      } catch {
        return res.status(500).json({ error: "Email failed" });
      }
    }
  );
};

// ===================== ARTIST LOGIN =====================
exports.artistLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;

    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    const data = await response.json();

    if (data.error) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const firebaseUid = data.localId;

    db.query(
      "SELECT * FROM artists WHERE firebase_uid = ?",
      [firebaseUid],
      (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!results.length)
          return res.status(404).json({ error: "Artist not found" });

        const artist = results[0];

        if (artist.is_verified === 0) {
          return res.status(403).json({
            error: "Please verify your email first",
          });
        }

        return res.json({
          message: "Login successful",
          artist,
          token: data.idToken,
        });
      }
    );
  } catch {
    return res.status(500).json({ error: "Login failed" });
  }
};