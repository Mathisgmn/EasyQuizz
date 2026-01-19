const { verifyToken } = require("../utils/tokens");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const [, token] = authHeader.split(" ");

  if (!token) {
    console.warn("Auth middleware missing token");
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (error) {
    console.warn("Auth middleware invalid token", { message: error.message });
    return res.status(401).json({ error: "Invalid token" });
  }
};

module.exports = authMiddleware;
