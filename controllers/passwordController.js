require("dotenv").config();
const db = require("../config/db");
const admin = require("../config/firebase");
const nodemailer = require("nodemailer");

const sendOTPEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await transporter.sendMail({
    from: `"artistmatch" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Reset OTP",
    html: `<h2>Your OTP is: ${otp}</h2><p>Expires in 10 minutes.</p>`,
  });
};

// ===================== FORGOT PASSWORD =====================
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const userRecord = await admin.auth().getUserByEmail(email).catch(() => null);
    if (!userRecord) return res.status(404).json({ error: "Email not registered" });

    // Check users first
    const { data: user } = await db.from("users").select("id").eq("email", email).single();
    if (user) return sendOTPAndRespond("users", email, res);

    // Check artists
    const { data: artist } = await db.from("artists").select("id").eq("email", email).single();
    if (artist) return sendOTPAndRespond("artists", email, res);

    return res.status(404).json({ error: "Account not found" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

const sendOTPAndRespond = async (table, email, res) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error } = await db.from(table).update({ otp, otp_expiry: otpExpiry }).eq("email", email);
  if (error) return res.status(500).json({ error: error.message });

  try {
    await sendOTPEmail(email, otp);
    return res.json({ message: "OTP sent to email" });
  } catch {
    return res.status(500).json({ error: "Failed to send OTP" });
  }
};

// ===================== VERIFY OTP =====================
exports.verifyForgotOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

  // Check users
  const { data: user } = await db.from("users").select("*").eq("email", email).single();
  if (user) return verifyOTPLogic(user, "users", email, otp, res);

  // Check artists
  const { data: artist } = await db.from("artists").select("*").eq("email", email).single();
  if (artist) return verifyOTPLogic(artist, "artists", email, otp, res);

  return res.status(404).json({ error: "User not found" });
};

const verifyOTPLogic = async (user, table, email, otp, res) => {
  if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
  if (new Date() > new Date(user.otp_expiry)) return res.status(400).json({ error: "OTP expired" });

  const { error } = await db.from(table).update({ is_verified: true }).eq("email", email);
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ message: "OTP verified" });
};

// ===================== RESET PASSWORD =====================
exports.resetPassword = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, { password });

    await db.from("users").update({ otp: null, otp_expiry: null }).eq("email", email);
    await db.from("artists").update({ otp: null, otp_expiry: null }).eq("email", email);

    return res.json({ message: "Password reset successful" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};