const express = require("express");
const router = express.Router();

// Controllers
const authController = require("../controllers/authController");
const artistAuthController = require("../controllers/artistauthController");
const passwordController = require("../controllers/passwordController");

// ===================== USER ROUTES =====================
router.post("/signup", authController.signup);
router.post("/verify-otp", authController.verifyOTP);
router.post("/resend-otp", authController.resendOTP);
router.post("/login", authController.login);

// 🔐 Forgot Password (USER + ARTIST handled together)
router.post("/forgot-password", passwordController.forgotPassword);
router.post("/verify-forgot-otp", passwordController.verifyForgotOTP);
router.post("/reset-password", passwordController.resetPassword);

// ===================== ARTIST ROUTES =====================
router.post("/artists/signup", artistAuthController.artistSignup);
router.post("/artists/verify-otp", artistAuthController.verifyArtistOTP);
router.post("/artists/resend-otp", artistAuthController.resendArtistOTP);
router.post("/artists/login", artistAuthController.artistLogin);

module.exports = router;