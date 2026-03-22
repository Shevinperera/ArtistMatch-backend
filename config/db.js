const mysql = require("mysql");
const dotenv = require("dotenv");

dotenv.config(); // loads .env from project root by default

const db = mysql.createConnection({
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

db.connect((err) => {
  if (err) {
    console.error("MySQL connection failed:", err);
  } else {
    console.log("MySQL connected...");
  }
});

module.exports = db;