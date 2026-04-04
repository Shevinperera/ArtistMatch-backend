const express = require("express");
const router = express.Router();
const db = require("../db");

// SEND MESSAGE
router.post("/", async (req, res) => {
  const { sender_id, receiver_id, message, file_url } = req.body;

  if (!sender_id || !receiver_id) {
    return res.status(400).json({ message: "sender_id and receiver_id required" });
  }

  const { data, error } = await db
    .from("messages")
    .insert([{ sender_id, receiver_id, message: message || null, file_url: file_url || null }])
    .select()
    .single();

  if (error) {
    console.error(error);
    return res.status(500).json({ message: "Database error" });
  }

  const io = req.app.get("io");
  const messageData = {
    senderId: sender_id,
    receiverId: receiver_id,
    message,
    timestamp: new Date().toISOString(),
  };
  io.to(`user_${receiver_id}`).emit("receiveMessage", messageData);
  io.to(`user_${sender_id}`).emit("conversationUpdated", messageData);

  res.json({ message: "Message sent", message_id: data.id });
});

// GET ALL CONVERSATIONS FOR A USER
router.get("/conversations/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId);

  const { data, error } = await db
    .from("messages")
    .select("*, sender:users!sender_id(id, name), receiver:users!receiver_id(id, name)")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ message: "Database error" });

  const seen = new Set();
  const conversations = data
    .filter((row) => {
      const otherId = row.sender_id === userId ? row.receiver_id : row.sender_id;
      if (seen.has(otherId)) return false;
      seen.add(otherId);
      return true;
    })
    .map((row) => {
      const isMe = row.sender_id === userId;
      return {
        other_user_id: isMe ? row.receiver_id : row.sender_id,
        other_user_name: isMe ? row.receiver?.name : row.sender?.name,
        message: row.message,
        unread_count: 0,
      };
    });

  res.json(conversations);
});

// GET CHAT BETWEEN 2 USERS
router.get("/:user1/:user2", async (req, res) => {
  const { user1, user2 } = req.params;

  const { data, error } = await db
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${user1},receiver_id.eq.${user2}),and(sender_id.eq.${user2},receiver_id.eq.${user1})`)
    .order("created_at", { ascending: true });

  if (error) return res.status(500).json({ message: "Database error" });
  res.json(data);
});

// MARK MESSAGES AS READ
router.put("/read/:senderId/:receiverId", async (req, res) => {
  const { senderId, receiverId } = req.params;

  const { error } = await db
    .from("messages")
    .update({ is_read: true })
    .eq("sender_id", senderId)
    .eq("receiver_id", receiverId)
    .eq("is_read", false);

  if (error) return res.status(500).json({ message: "Database error" });
  res.json({ message: "Messages marked as read" });
});

// saveMessage for Socket.IO
const saveMessage = async (senderId, receiverId, message, fileUrl = null) => {
  const { data, error } = await db
    .from("messages")
    .insert([{ sender_id: senderId, receiver_id: receiverId, message: message || null, file_url: fileUrl }])
    .select()
    .single();

  if (error) throw error;
  return data.id;
};

module.exports = { router, saveMessage };