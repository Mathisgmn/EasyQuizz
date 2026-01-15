const express = require("express");
const { query, getCurrentConfig } = require("../db");
const { verifyToken } = require("../utils/tokens");

const router = express.Router();

const ensureChoiceExists = async (choiceId) => {
  const result = await query(
    `
      SELECT id
      FROM choices
      WHERE id = $1
    `,
    [choiceId]
  );

  return result.rowCount > 0;
};

router.post("/vote", async (req, res) => {
  const { choiceId, userToken } = req.body || {};

  if (!choiceId || !userToken) {
    return res.status(400).json({ error: "Missing choiceId or userToken" });
  }

  try {
    const currentConfig = await getCurrentConfig();

    if (Date.now() > new Date(currentConfig.voteEndsAt).getTime()) {
      return res.status(403).json({ error: "Vote has ended" });
    }

    const payload = verifyToken(userToken);
    const username = payload.username;

    const userResult = await query(
      `
        SELECT id
        FROM users
        WHERE username = $1
      `,
      [username]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: "Invalid user token" });
    }

    const validChoice = await ensureChoiceExists(choiceId);
    if (!validChoice) {
      return res.status(404).json({ error: "Choice not found" });
    }

    await query(
      `
        INSERT INTO votes (user_id, choice_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET choice_id = EXCLUDED.choice_id, created_at = NOW()
      `,
      [userResult.rows[0].id, choiceId]
    );

    return res.json({ success: true });
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid user token" });
    }

    console.error("Error recording vote", error);
    return res.status(500).json({ error: "Failed to record vote" });
  }
});

module.exports = router;
