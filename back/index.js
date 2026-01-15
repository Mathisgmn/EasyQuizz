const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { PORT } = require("./config");
const { initDb } = require("./db");
const authRoutes = require("./routes/auth");
const configRoutes = require("./routes/config");
const voteRoutes = require("./routes/vote");
const resultsRoutes = require("./routes/results");
const qrCodeRoutes = require("./routes/qrcodes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/auth", authRoutes);
app.use(configRoutes);
app.use(voteRoutes);
app.use(resultsRoutes);
app.use(qrCodeRoutes);

const startServer = async () => {
  try {
    await initDb();

    app.listen(PORT, () => {
      console.log(`EasyQuizz backend running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to initialize database", error);
    process.exit(1);
  }
};

startServer();
