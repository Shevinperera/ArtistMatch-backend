require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/auth");
const gigsRoutes = require("./routes/gigs.routes");
const { router: messagesRoutes, saveMessage } = require("./routes/messages.routes");
const notificationsRoutes = require("./routes/notifications.routes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/auth", authRoutes);
app.use("/api/gigs", gigsRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/notifications", notificationsRoutes);

app.get("/", (req, res) => {
  res.send("ArtistMatch API running");
});

const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("joinRoom", (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined room user_${userId}`);
  });

  socket.on("sendMessage", async (messageData) => {
    try {
      await saveMessage(messageData.senderId, messageData.receiverId, messageData.message);

      io.to(`user_${messageData.receiverId}`).emit("receiveMessage", {
        senderId: messageData.senderId,
        receiverId: messageData.receiverId,
        message: messageData.message,
        timestamp: new Date().toISOString(),
      });

      io.to(`user_${messageData.senderId}`).emit("conversationUpdated", {
        senderId: messageData.senderId,
        receiverId: messageData.receiverId,
        message: messageData.message,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to save/emit message:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});