require("dotenv").config();
const db = require("../config/db"); // mysql2/promise pool
const admin = require("../config/firebase");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

const sendOTPEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await transporter.sendMail({
    from: `"artistmatch" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Your OTP Code",
    html: `<h2>Your OTP is: ${otp}</h2><p>Expires in 10 minutes.</p>`,
  });
};

// SIGNUP
exports.signup = async (req, res) => {
  const { name, email, password, genres } = req.body;
  if (!name || !email || !password || !genres?.length)
    return res.status(400).json({ error: "All fields required" });

  try {
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) return res.status(409).json({ error: "Email already registered" });

    const userRecord = await admin.auth().createUser({ email, password, displayName: name });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    // Insert user
    const [userResult] = await db.query(
      "INSERT INTO users (name,email,firebase_uid,otp,otp_expiry,is_verified) VALUES (?,?,?,?,?,0)",
      [name, email, userRecord.uid, otp, otpExpiry]
    );

    const userId = userResult.insertId;

    // Insert genres
    const genreValues = genres.map((gid) => [userId, gid]);
    if (genreValues.length > 0) {
      await db.query("INSERT INTO user_genres (user_id, genre_id) VALUES ?", [genreValues]);
    }

    await sendOTPEmail(email, otp);
    return res.status(201).json({ message: "User created. OTP sent to email." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// VERIFY OTP
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

  try {
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "User not found" });
    if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (new Date() > new Date(user.otp_expiry)) return res.status(400).json({ error: "OTP expired" });

    await db.query("UPDATE users SET is_verified = 1, otp = NULL, otp_expiry = NULL WHERE email = ?", [email]);
    return res.json({ message: "Verified successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Database error" });
  }
};

// RESEND OTP
exports.resendOTP = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await db.query("UPDATE users SET otp=?, otp_expiry=? WHERE email=?", [otp, otpExpiry, email]);
    await sendOTPEmail(email, otp);
    return res.json({ message: "OTP resent" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// LOGIN
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY;
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password: password.trim(), returnSecureToken: true }),
    });
    const data = await response.json();
    if (data.error) return res.status(401).json({ error: data.error.message || "Invalid credentials" });

    const firebaseUid = data.localId;

    // Check user table
    const [users] = await db.query("SELECT id,name,email,is_verified FROM users WHERE firebase_uid=?", [firebaseUid]);
    if (users.length > 0) return res.json({ role: "user", user: users[0], token: data.idToken });

    // Check artist table
    const [artists] = await db.query("SELECT * FROM artists WHERE firebase_uid=?", [firebaseUid]);
    if (!artists.length) return res.status(404).json({ error: "Account not found" });

    return res.json({ role: "artist", artist: artists[0], token: data.idToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Login failed" });
  }
};