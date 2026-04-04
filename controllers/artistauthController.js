require("dotenv").config();
const db = require("../config/db");
const admin = require("../config/firebase");
const nodemailer = require("nodemailer");

const sendOTPEmail = async (email, otp) => {
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
  await transporter.sendMail({ from: `"artistmatch" <${process.env.EMAIL_USER}>`, to: email, subject: "Your OTP Code", html: `<h2>Your OTP is: ${otp}</h2><p>Expires in 10 minutes.</p>` });
};

exports.artistSignup = async (req, res) => {
  const { name, email, password, role, gender, language, location, genre_id, spotify_artist_id } = req.body;
  if (!name || !email || !password || !role || !gender || !language || !location || !genre_id)
    return res.status(400).json({ error: "All fields required" });

  try {
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    if (existingUser) return res.status(409).json({ error: "Email already registered" });

    const userRecord = await admin.auth().createUser({ email, password, displayName: name });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      `INSERT INTO artists (name,email,firebase_uid,role,gender,language,location,spotify_artist_id,genre_id,otp,otp_expiry,is_verified)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`,
      [name,email,userRecord.uid,role,gender,language,location,spotify_artist_id||null,genre_id,otp,otpExpiry]
    );

    await sendOTPEmail(email, otp);
    return res.status(201).json({ message: "Artist created. OTP sent." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.verifyArtistOTP = async (req,res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

  try {
    const [rows] = await db.query("SELECT * FROM artists WHERE email=?", [email]);
    const artist = rows[0];
    if (!artist) return res.status(404).json({ error: "Artist not found" });
    if (artist.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (new Date() > new Date(artist.otp_expiry)) return res.status(400).json({ error: "OTP expired" });

    await db.query("UPDATE artists SET is_verified=1, otp=NULL, otp_expiry=NULL WHERE email=?", [email]);
    return res.json({ message: "Artist verified successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

exports.resendArtistOTP = async (req,res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  try {
    await db.query("UPDATE artists SET otp=?, otp_expiry=? WHERE email=?", [otp, otpExpiry, email]);
    await sendOTPEmail(email, otp);
    return res.json({ message: "OTP resent" });
  } catch(err){
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};