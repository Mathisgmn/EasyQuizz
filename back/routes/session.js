const express = require("express");
const { config, parseDurationToMs, resolveVoteEndsAt } = require("../config");
const { createVoteSession, getCurrentConfig } = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

const normalizeChoices = (choices, fallback) => {
  if (!Array.isArray(choices) || choices.length === 0) {
    return fallback;
  }

  return choices
    .map((choice, index) => ({
      id:
        typeof choice.id === "number"
          ? choice.id
          : Number(choice.id || index + 1),
      label: String(choice.label || "").trim()
    }))
    .filter((choice) => Number.isInteger(choice.id) && choice.label.length > 0);
};

router.post("/session", authMiddleware, async (req, res) => {
  try {
    const currentConfig = await getCurrentConfig();
    const payload = req.body || {};
    const fallbackChoices = currentConfig.choices?.length
      ? currentConfig.choices
      : config.choices;
    const choices = normalizeChoices(payload.choices, fallbackChoices);

    if (!choices || choices.length === 0) {
      return res.status(400).json({ error: "Missing vote choices" });
    }

    const question = String(
      payload.question || currentConfig.question || config.question
    ).trim();

    if (!question) {
      return res.status(400).json({ error: "Missing vote question" });
    }

    let voteEndsAt = payload.voteEndsAt;
    if (voteEndsAt) {
      const parsed = new Date(voteEndsAt);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ error: "Invalid voteEndsAt" });
      }
      voteEndsAt = parsed.toISOString();
    } else {
      const durationMs = parseDurationToMs(payload.voteDuration || payload.duration);
      voteEndsAt = durationMs
        ? new Date(Date.now() + durationMs).toISOString()
        : resolveVoteEndsAt();
    }

    await createVoteSession({ question, voteEndsAt, choices });
    const updatedConfig = await getCurrentConfig();
    return res.json(updatedConfig);
  } catch (error) {
    console.error("Error creating vote session", error);
    return res.status(500).json({ error: "Failed to create vote session" });
  }
});

router.get("/session/reload", authMiddleware, async (req, res) => {
  try {
    require("dotenv").config();

    const question = String(process.env.VOTE_QUESTION || "").trim();
    const choices = [
      { id: 1, label: String(process.env.QR1_LABEL || "").trim() },
      { id: 2, label: String(process.env.QR2_LABEL || "").trim() },
      { id: 3, label: String(process.env.QR3_LABEL || "").trim() }
    ];
    const voteEndsAt = resolveVoteEndsAt();

    await createVoteSession({ question, voteEndsAt, choices });
    const updatedConfig = await getCurrentConfig();
    return res.json(updatedConfig);
  } catch (error) {
    console.error("Error reloading vote session", error);
    return res.status(500).json({ error: "Failed to reload vote session" });
  }
});

module.exports = router;
