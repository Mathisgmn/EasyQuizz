const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const QR_STORAGE_PATH =
  process.env.QR_STORAGE_PATH || path.join(__dirname, "qrcodes");

const parseDurationToMs = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)([dhm])?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] || "h").toLowerCase();
  const multipliers = {
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000
  };
  return amount * multipliers[unit];
};

const resolveVoteEndsAt = () => {
  if (process.env.VOTE_EXPIRY_DATE) {
    const parsed = new Date(process.env.VOTE_EXPIRY_DATE);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  const durationMs = parseDurationToMs(process.env.VOTE_DURATION);
  if (durationMs) {
    return new Date(Date.now() + durationMs).toISOString();
  }

  return "2026-01-10T10:30:00Z";
};

const voteEndsAt = resolveVoteEndsAt();

const config = {
  question: process.env.VOTE_QUESTION,
  voteEndsAt,
  choices: [
    {
      id: 1,
      label: process.env.QR1_LABEL,
      qrCodeUrl: "/qrcodes/1"
    },
    {
      id: 2,
      label: process.env.QR2_LABEL,
      qrCodeUrl: "/qrcodes/2"
    },
    {
      id: 3,
      label: process.env.QR3_LABEL,
      qrCodeUrl: "/qrcodes/3"
    }
  ]
};

const users = new Map();
const votes = new Map();
const userVotes = new Map();

const ensureChoiceExists = (choiceId) =>
  config.choices.some((choice) => choice.id === choiceId);

const createToken = (username) => jwt.sign({ username }, JWT_SECRET);

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const [, token] = authHeader.split(" ");

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

app.post("/auth/register", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  if (users.has(username)) {
    return res.status(409).json({ error: "User already exists" });
  }

  users.set(username, { username, password });
  const token = createToken(username);

  return res.json({ token });
});

app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const user = users.get(username);

  if (!user || user.password !== password) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = createToken(username);

  return res.json({ token });
});

app.post("/vote", (req, res) => {
  const { choiceId, userToken } = req.body || {};

  if (!choiceId || !userToken) {
    return res.status(400).json({ error: "Missing choiceId or userToken" });
  }

  if (Date.now() > new Date(config.voteEndsAt).getTime()) {
    return res.status(403).json({ error: "Vote has ended" });
  }

  if (!ensureChoiceExists(choiceId)) {
    return res.status(404).json({ error: "Choice not found" });
  }

  let payload;

  try {
    payload = jwt.verify(userToken, JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ error: "Invalid user token" });
  }

  const username = payload.username;
  const previousVote = userVotes.get(username);

  if (previousVote && previousVote !== choiceId) {
    const nextCount = Math.max(0, (votes.get(previousVote) || 1) - 1);
    votes.set(previousVote, nextCount);
  }

  votes.set(choiceId, (votes.get(choiceId) || 0) + 1);
  userVotes.set(username, choiceId);

  return res.json({ success: true });
});

app.get("/config", authMiddleware, (req, res) => {
  return res.json(config);
});

app.get("/qrcodes/:choiceId", (req, res) => {
  const choiceId = Number(req.params.choiceId);

  if (!ensureChoiceExists(choiceId)) {
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
});

app.get("/results", authMiddleware, (req, res) => {
  const results = config.choices.map((choice) => ({
    choiceId: choice.id,
    label: choice.label,
    count: votes.get(choice.id) || 0
  }));

  const totalVotes = results.reduce((sum, result) => sum + result.count, 0);

  return res.json({ totalVotes, results });
});

app.listen(PORT, () => {
  console.log(`EasyQuizz backend running on port ${PORT}`);
});
