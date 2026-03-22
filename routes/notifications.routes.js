const express = require("express");
const router = express.Router();
const db = require("../db");

// GET notifications for a user
router.get("/:userId", (req, res) => {
  const sql = `
    SELECT n.*, u.name as sender_name, u.profile_image as sender_avatar
    FROM notifications n
    JOIN users u ON n.sender_id = u.id
    WHERE n.recipient_id = ?
    ORDER BY n.created_at DESC
  `;

  db.query(sql, [req.params.userId], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// POST create a notification
router.post("/", (req, res) => {
  const { recipient_id, sender_id, type, message } = req.body;

  if (!recipient_id || !sender_id || !type || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const sql = `
    INSERT INTO notifications (recipient_id, sender_id, type, message)
    VALUES (?, ?, ?, ?)
  `;

  db.query(sql, [recipient_id, sender_id, type, message], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: result.insertId });
  });
});

// PUT mark notification as read
router.put("/:id/read", (req, res) => {
  db.query(
    "UPDATE notifications SET is_read = TRUE WHERE id = ?",
    [req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

module.exports = router;