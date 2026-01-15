const path = require("path");

const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const QR_STORAGE_PATH =
  process.env.QR_STORAGE_PATH || path.join(__dirname, "..", "qrcodes");

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

const choices = [
  {
    id: 1,
    label: process.env.QR1_LABEL || "Choice 1",
    qrCodeUrl: "/qrcodes/1"
  },
  {
    id: 2,
    label: process.env.QR2_LABEL || "Choice 2",
    qrCodeUrl: "/qrcodes/2"
  },
  {
    id: 3,
    label: process.env.QR3_LABEL || "Choice 3",
    qrCodeUrl: "/qrcodes/3"
  }
];

const config = {
  question: process.env.VOTE_QUESTION || "Choisissez votre option",
  voteEndsAt,
  choices
};

module.exports = {
  PORT,
  JWT_SECRET,
  QR_STORAGE_PATH,
  config,
  resolveVoteEndsAt
};
