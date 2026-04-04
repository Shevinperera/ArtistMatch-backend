require("dotenv").config();
const db = require("../config/db"); // mysql2/promise pool
const admin = require("../config/firebase");
const nodemailer = require("nodemailer");

// ===================== EMAIL =====================
const sendOTPEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await transporter.sendMail({
    from: `"artistmatch" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Password Reset OTP",
    html: `<h2>Your OTP is: ${otp}</h2><p>This code expires in 10 minutes.</p>`,
  });
};

// ===================== GENERATE OTP =====================
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ===================== FORGOT PASSWORD =====================
exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  try {
    const userRecord = await admin.auth().getUserByEmail(email).catch(() => null);
    if (!userRecord) return res.status(404).json({ error: "Email not registered" });

    // Check USERS table
    const [userRows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (userRows.length > 0) return handleOTP("users", email, res);

    // Check ARTISTS table
    const [artistRows] = await db.query("SELECT * FROM artists WHERE email = ?", [email]);
    if (artistRows.length === 0) return res.status(404).json({ error: "Account not found" });

    return handleOTP("artists", email, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ===================== HANDLE OTP =====================
const handleOTP = async (table, email, res) => {
  const otp = generateOTP();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  try {
    await db.query(`UPDATE ${table} SET otp = ?, otp_expiry = ? WHERE email = ?`, [otp, otpExpiry, email]);
    await sendOTPEmail(email, otp);
    return res.json({ message: "OTP sent to email" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to send OTP" });
  }
};

// ===================== VERIFY OTP =====================
exports.verifyForgotOTP = async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

  try {
    // Check USERS
    const [userRows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (userRows.length > 0) return verifyOTPLogic(userRows[0], "users", email, otp, res);

    // Check ARTISTS
    const [artistRows] = await db.query("SELECT * FROM artists WHERE email = ?", [email]);
    if (artistRows.length === 0) return res.status(404).json({ error: "User not found" });

    return verifyOTPLogic(artistRows[0], "artists", email, otp, res);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ===================== OTP LOGIC =====================
const verifyOTPLogic = async (user, table, email, otp, res) => {
  if (user.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
  if (new Date() > new Date(user.otp_expiry)) return res.status(400).json({ error: "OTP expired" });

  try {
    await db.query(`UPDATE ${table} SET is_verified = 1, otp = NULL, otp_expiry = NULL WHERE email = ?`, [email]);
    return res.json({ message: "OTP verified" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

// ===================== RESET PASSWORD =====================
exports.resetPassword = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  try {
    // Update Firebase password
    const userRecord = await admin.auth().getUserByEmail(email);
    await admin.auth().updateUser(userRecord.uid, { password });

    const now = new Date();

    // Clear OTP for USERS and ARTISTS
    await db.query("UPDATE users SET otp = NULL, otp_expiry = NULL, updated_at = ? WHERE email = ?", [now, email]);
    await db.query("UPDATE artists SET otp = NULL, otp_expiry = NULL, updated_at = ? WHERE email = ?", [now, email]);

    return res.json({ message: "Password reset successful" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};