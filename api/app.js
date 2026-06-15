const express = require("express");
const cors = require("cors");
const { HttpError } = require("./utils/httpErrors");

const mapidRouter = require("./routes/mapid");
const lulcRouter = require("./routes/lulc");
const classesRouter = require("./routes/classes");

const app = express();

const corsOptions = process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN } : undefined;
app.use(cors(corsOptions));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/mapid", mapidRouter);
app.use("/gee", lulcRouter);
app.use("/gee", classesRouter);

app.use((req, res, next) => {
  next(new HttpError(404, "Not found"));
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? "Internal server error" : err.message;

  if (statusCode >= 500) {
    console.error(`${req.method} ${req.originalUrl} failed:`, err);
  }

  res.status(statusCode).json({ error: message });
});

module.exports = app;
