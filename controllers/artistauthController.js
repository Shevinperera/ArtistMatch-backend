require("dotenv").config();
const db = require("../config/db");
const admin = require("../config/firebase");
const nodemailer = require("nodemailer");

// Helper to send OTP email
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
    html: `<h2>Your OTP is: ${otp}</h2><p>This code expires in 10 minutes.</p>`,
  });
};

// ====================== ARTIST SIGNUP ======================
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

  if (!name || !email || !password || !role || !gender || !language || !location || !genre_id) {
    return res.status(400).json({ error: "All fields are required" });
  }

  try {
    // Check if user already exists in Firebase
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

    // Format otpExpiry for MySQL DATETIME
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const otpExpiryString = otpExpiry.toISOString().slice(0, 19).replace('T', ' ');

    // Insert into MySQL
    const query = `
      INSERT INTO artists
      (name, email, firebase_uid, role, gender, language, location, spotify_artist_id, genre_id, otp, otp_expiry, is_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `;
    const values = [
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
      otpExpiryString,
    ];

    db.query(query, values, async (err, result) => {
      if (err) return res.status(500).json({ error: err.message });

      // Send OTP email
      try {
        await sendOTPEmail(email, otp);
        return res.status(201).json({ message: "Artist created. OTP sent to email." });
      } catch (emailErr) {
        return res.status(500).json({ error: "Failed to send OTP email" });
      }
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};