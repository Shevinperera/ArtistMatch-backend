// config/firebase.js
const admin = require("firebase-admin");
const path = require("path");

// Load your service account JSON directly
const serviceAccount = JSON.parse(process.env.FIREBASE_KEY) // adjust path if needed

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

console.log("Firebase initialized for project:", serviceAccount.project_id);

module.exports = admin;