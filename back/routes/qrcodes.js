const express = require("express");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");
const QRCode = require("qrcode");
const { QR_STORAGE_PATH, config } = require("../config");
const { query } = require("../db");

const router = express.Router();

const buildQrPayload = (choiceId) => {
  const choice = config.choices.find((entry) => entry.id === choiceId);
  return JSON.stringify({
    choiceId,
    label: choice?.label || `Choice ${choiceId}`
  });
};

const ensureQrCodeFile = async (choiceId) => {
  await fsPromises.mkdir(QR_STORAGE_PATH, { recursive: true });

  const filePath = path.join(QR_STORAGE_PATH, `choice-${choiceId}.png`);

  try {
    await fsPromises.access(filePath, fs.constants.R_OK);
    return filePath;
  } catch (error) {
    const payload = buildQrPayload(choiceId);
    await QRCode.toFile(filePath, payload, {
      width: 240,
      margin: 1
    });
    return filePath;
  }
};

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

    const filePath = await ensureQrCodeFile(choiceId);
    res.type("png");
    return res.sendFile(filePath);
  } catch (error) {
    console.error("Error fetching QR code", error);
    return res.status(500).json({ error: "Failed to fetch QR code" });
  }
});

module.exports = router;
