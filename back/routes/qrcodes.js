const express = require("express");
const fs = require("fs");
const path = require("path");
const { QR_STORAGE_PATH } = require("../config");
const { query } = require("../db");

const router = express.Router();

router.get("/qrcodes/:choiceId", async (req, res) => {
  const choiceId = Number(req.params.choiceId);

  if (!choiceId) {
    return res.status(400).json({ error: "Invalid choice id" });
  }

  try {
    const result = await query(
      `
        SELECT id
        FROM choices
        WHERE id = $1
      `,
      [choiceId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Choice not found" });
    }

    const filePath = path.join(QR_STORAGE_PATH, `choice-${choiceId}.png`);

    fs.access(filePath, fs.constants.R_OK, (error) => {
      if (error) {
        return res.status(404).json({ error: "QRCode not found" });
      }

      res.type("png");
      return res.sendFile(filePath);
    });
  } catch (error) {
    console.error("Error fetching QR code", error);
    return res.status(500).json({ error: "Failed to fetch QR code" });
  }
});

module.exports = router;
