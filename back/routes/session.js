const express = require("express");
const dotenv = require("dotenv");
const { createVoteSession, getCurrentConfig } = require("../db");
const { reloadConfig } = require("../config");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.post("/session/reload", authMiddleware, async (req, res) => {
  try {
    dotenv.config({ override: true });
    const nextConfig = reloadConfig();
    await createVoteSession(nextConfig);
    const currentConfig = await getCurrentConfig();
    return res.json(currentConfig);
  } catch (error) {
    console.error("Error reloading session", error);
    return res.status(500).json({ error: "Failed to reload session" });
  }
});

module.exports = router;
