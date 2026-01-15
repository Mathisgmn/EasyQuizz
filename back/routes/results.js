const express = require("express");
const { query, getCurrentConfig } = require("../db");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.get("/results", authMiddleware, async (req, res) => {
  try {
    const currentConfig = await getCurrentConfig();
    const countsResult = await query(
      `
        SELECT choice_id, COUNT(*)::int AS count
        FROM votes
        GROUP BY choice_id
      `
    );

    const countsMap = new Map(
      countsResult.rows.map((row) => [row.choice_id, row.count])
    );

    const results = currentConfig.choices.map((choice) => ({
      choiceId: choice.id,
      label: choice.label,
      count: countsMap.get(choice.id) || 0
    }));

    const totalVotes = results.reduce((sum, result) => sum + result.count, 0);

    return res.json({ totalVotes, results });
  } catch (error) {
    console.error("Error fetching results", error);
    return res.status(500).json({ error: "Failed to fetch results" });
  }
});

module.exports = router;
