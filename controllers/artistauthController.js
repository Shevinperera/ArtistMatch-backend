require("dotenv").config();
const db = require("../config/db");
const admin = require("../config/firebase");
const nodemailer = require("nodemailer");
const fetch = require("node-fetch");

// ===================== SEND OTP EMAIL =====================
const sendOTPEmail = async (email, otp) => {
  try {
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

    console.log(`OTP sent to ${email}: ${otp}`);
  } catch (err) {
    console.log("Email sending error:", err);
    // do not throw here to avoid blocking signup
  }
};

// ===================== ARTIST SIGNUP =====================
exports.artistSignup = async (req, res) => {
  const { name, email, password, role, gender, language, location, genre_id, spotify_artist_id } = req.body;

  if (!name || !email || !password || !role || !gender || !language || !location || !genre_id) {
    return res.status(400).json({ error: "All fields required" });
  }

  try {
    // Check if email already exists in Firebase
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) return res.status(409).json({ error: "Email already registered" });

    // Create Firebase user
    const userRecord = await admin.auth().createUser({ email, password, displayName: name });

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Insert artist into DB
    const { error } = await db.from("artists").insert([{
      name,
      email,
      firebase_uid: userRecord.uid,
      role,
      gender,
      language,
      location,
      spotify_artist_id: spotify_artist_id || null,
      genre_id,
      otp,
      otp_expiry: otpExpiry,
      is_verified: false,
    }]);

    if (error) return res.status(500).json({ error: error.message });

    // Send OTP asynchronously
    sendOTPEmail(email, otp);

    // Respond immediately
    return res.status(201).json({ message: "Artist created. OTP will be sent shortly." });

  } catch (err) {
    console.log("Signup error:", err);
    return res.status(500).json({ error: err.message });
  }
};

// ===================== VERIFY ARTIST OTP =====================
exports.verifyArtistOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

  const { data: artist, error } = await db
    .from("artists")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error || !artist) return res.status(404).json({ error: "Artist not found" });
  if (artist.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
  if (new Date() > new Date(artist.otp_expiry)) return res.status(400).json({ error: "OTP expired" });

  const { error: updateError } = await db
    .from("artists")
    .update({ is_verified: true, otp: null, otp_expiry: null })
    .eq("email", email);

  if (updateError) return res.status(500).json({ error: updateError.message });

  return res.json({ message: "Artist verified successfully" });
};

// ===================== RESEND ARTIST OTP =====================
exports.resendArtistOTP = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  const { error } = await db
    .from("artists")
    .update({ otp, otp_expiry: otpExpiry })
    .eq("email", email);

  if (error) return res.status(500).json({ error: error.message });

  // Send OTP asynchronously
  sendOTPEmail(email, otp);

  return res.json({ message: "OTP resent" });
};

// ===================== ARTIST LOGIN =====================
exports.artistLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      }
    );

    const data = await response.json();
    if (data.error) return res.status(401).json({ error: "Invalid credentials" });

    const firebaseUid = data.localId;

    const { data: artist, error } = await db
      .from("artists")
      .select("*")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

    if (error || !artist) return res.status(404).json({ error: "Artist not found" });
    if (!artist.is_verified) return res.status(403).json({ error: "Please verify your email first" });

    return res.json({ message: "Login successful", artist, token: data.idToken });
  } catch (err) {
    console.log("Login error:", err);
    return res.status(500).json({ error: "Login failed" });
  }
};