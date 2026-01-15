const jwt = require("jsonwebtoken");
const { JWT_SECRET } = require("../config");

const createToken = (username) => jwt.sign({ username }, JWT_SECRET);

const verifyToken = (token) => jwt.verify(token, JWT_SECRET);

module.exports = {
  createToken,
  verifyToken
};
