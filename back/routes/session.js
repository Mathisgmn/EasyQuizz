const express = require("express");
const path = require("path");
const dotenv = require("dotenv");
const { createVoteSession, getCurrentConfig } = require("../db");
const { reloadConfig } = require("../config");

const router = express.Router();

const reloadSession = async (req, res) => {
  try {
    const envPath = path.resolve(__dirname, "..", ".env");
    const result = dotenv.config({ path: envPath, override: true });
    if (result.error) {
      console.error("Failed to reload .env", result.error);
      return res.status(500).json({ error: "Failed to reload .env" });
    }

    const nextConfig = reloadConfig();
    await createVoteSession(nextConfig);
    const currentConfig = await getCurrentConfig();
    return res.json(currentConfig);
  } catch (error) {
    console.error("Error reloading session", error);
    return res.status(500).json({ error: "Failed to reload session" });
  }
};

router.get("/session/reload", reloadSession);
router.post("/session/reload", reloadSession);

module.exports = router;
