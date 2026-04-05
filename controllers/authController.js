require("dotenv").config();
const db = require("../config/db");
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

// ===================== SIGNUP =====================
exports.signup = async (req, res) => {
  const { name, email, password, genres } = req.body;

  if (!name || !email || !password || !genres?.length) {
    return res.status(400).json({ error: "All fields required" });
  }

  try {
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) return res.status(409).json({ error: "Email already registered" });

    const userRecord = await admin.auth().createUser({ email, password, displayName: name });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: newUser, error } = await db
      .from("users")
      .insert([{ name, email, firebase_uid: userRecord.uid, otp, otp_expiry: otpExpiry, is_verified: false }])
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const genreValues = genres.map((gid) => ({ user_id: newUser.id, genre_id: gid }));
    const { error: genreError } = await db.from("user_genres").insert(genreValues);
    if (genreError) return res.status(500).json({ error: genreError.message });

    await sendOTPEmail(email, otp);
    return res.status(201).json({ message: "User created. OTP sent to email." });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ===================== VERIFY OTP =====================
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

  const { data: user, error } = await db
    .from("users")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error || !user) return res.status(404).json({ error: "User not found" });
  if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
  if (new Date() > new Date(user.otp_expiry)) return res.status(400).json({ error: "OTP expired" });

  const { error: updateError } = await db
    .from("users")
    .update({ is_verified: true, otp: null, otp_expiry: null })
    .eq("email", email);

  if (updateError) return res.status(500).json({ error: updateError.message });
  return res.json({ message: "Verified successfully" });
};

// ===================== RESEND OTP =====================
exports.resendOTP = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await db
    .from("users")
    .update({ otp, otp_expiry: otpExpiry })
    .eq("email", email);

  if (error) return res.status(500).json({ error: error.message });

  try {
    await sendOTPEmail(email, otp);
    return res.json({ message: "OTP resent" });
  } catch {
    return res.status(500).json({ error: "Failed to send OTP" });
  }
};

// ===================== LOGIN =====================
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password: password.trim(), returnSecureToken: true }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(401).json({ error: data.error.message || "Invalid credentials" });

    const firebaseUid = data.localId;

    // Check users table
    const { data: user } = await db
      .from("users")
      .select("id, name, email, is_verified, profile_image")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (user) {
      return res.json({ role: "user", user, token: data.idToken, firebaseUid });
    }

    // Check artists table
    const { data: artist, error: artistError } = await db
      .from("artists")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (artistError || !artist) {
      return res.status(404).json({ error: "Account not found in users or artists" });
    }

    return res.json({ role: "artist", artist, token: data.idToken, firebaseUid });
  } catch (err) {
    return res.status(500).json({ error: "Login failed" });
  }
};