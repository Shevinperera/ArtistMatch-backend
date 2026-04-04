const express = require("express");
const router = express.Router();
const db = require("../db");

// GET notifications for a user
router.get("/:userId", async (req, res) => {
  const { data, error } = await db
    .from("notifications")
    .select("*, sender:users!sender_id(name, profile_image)")
    .eq("recipient_id", req.params.userId)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });

  const result = data.map(n => ({
    ...n,
    sender_name: n.sender?.name,
    sender_avatar: n.sender?.profile_image,
  }));

  res.json(result);
});

// POST create a notification
router.post("/", async (req, res) => {
  const { recipient_id, sender_id, type, message } = req.body;

  if (!recipient_id || !sender_id || !type || !message) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const { data, error } = await db
    .from("notifications")
    .insert([{ recipient_id, sender_id, type, message }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, id: data.id });
});

// PUT mark as read
router.put("/:id/read", async (req, res) => {
  const { error } = await db
    .from("notifications")
    .update({ is_read: true })
    .eq("id", req.params.id);

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

module.exports = router;