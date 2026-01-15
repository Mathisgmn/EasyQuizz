const express = require("express");
const { config } = require("../config");
const authMiddleware = require("../middleware/auth");

const router = express.Router();

router.get("/config", authMiddleware, (req, res) => {
  return res.json(config);
});

module.exports = router;
