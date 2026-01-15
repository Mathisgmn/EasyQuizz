const express = require("express");
const { getCurrentConfig } = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.get("/config", authMiddleware, async (req, res) => {
  try {
    const currentConfig = await getCurrentConfig();
    return res.json(currentConfig);
  } catch (error) {
    console.error("Error loading config", error);
    return res.status(500).json({ error: "Failed to load config" });
  }
});

module.exports = router;
