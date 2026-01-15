const express = require("express");
const { query } = require("../db");
const { createToken } = require("../utils/tokens");
const { hashPassword, verifyPassword } = require("../utils/passwords");

const router = express.Router();

router.post("/register", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const passwordHash = hashPassword(password);

  try {
    await query(
      `
        INSERT INTO users (username, password_hash)
        VALUES ($1, $2)
      `,
      [username, passwordHash]
    );

    const token = createToken(username);

    return res.json({ token });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ error: "User already exists" });
    }

    console.error("Error registering user", error);
    return res.status(500).json({ error: "Failed to register user" });
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  try {
    const result = await query(
      `
        SELECT id, username, password_hash
        FROM users
        WHERE username = $1
      `,
      [username]
    );

    const user = result.rows[0];

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = createToken(username);

    return res.json({ token });
  } catch (error) {
    console.error("Error logging in", error);
    return res.status(500).json({ error: "Failed to login" });
  }
});

module.exports = router;
