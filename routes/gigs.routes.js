const express = require("express");
const router = express.Router();
const db = require("../db");

// POST a new gig
router.post("/", async (req, res) => {
  const { eventTitle, venue, date, time, genre, pay } = req.body;

  if (!eventTitle || !venue || !date || !time || !genre || !pay) {
    return res.status(400).json({ message: "All fields are required" });
  }

  const { data, error } = await db
    .from("gigs")
    .insert([{ event_title: eventTitle, venue, event_date: date, event_time: time, genre, pay: Number(pay) }])
    .select()
    .single();

  if (error) {
    console.error("DB error on POST /api/gigs:", error);
    return res.status(500).json({ message: "Database error" });
  }

  const acceptsJson = req.headers["content-type"]?.includes("application/json");
  if (acceptsJson) {
    return res.status(201).json({ message: "Gig posted successfully", gigId: data.id });
  }
  res.redirect("/");
});

// GET all gigs
router.get("/", async (req, res) => {
  const { data, error } = await db
    .from("gigs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ message: "Database error" });
  res.json(data);
});

// GET single gig
router.get("/:id", async (req, res) => {
  const { data, error } = await db
    .from("gigs")
    .select("*")
    .eq("id", req.params.id)
    .single();

  if (error) return res.status(500).json({ message: "Database error" });
  if (!data) return res.status(404).json({ message: "Gig not found" });
  res.json(data);
});

// POST apply for a gig
router.post("/apply", async (req, res) => {
  const { gig_id, user_id, artist_name, phone, experience, cover_note, portfolio_url, social_media, availability } = req.body;

  if (!artist_name || !user_id) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  const { data, error } = await db
    .from("gig_applications")
    .insert([{ gig_id: gig_id || null, user_id, artist_name, phone: phone || null, experience: experience || null, cover_note: cover_note || null, portfolio_url: portfolio_url || null, social_media: social_media || null, availability: availability || null }])
    .select()
    .single();

  if (error) return res.status(500).json({ message: "Database error", error: error.message });
  res.status(201).json({ message: "Application submitted", id: data.id });
});

module.exports = router;