const express = require("express");
const { pool } = require("../config/db");

const router = express.Router();

// Liveness: is the process alive? Never touches the DB. Always 200.
router.get("/live", (req, res) => {
  res.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Readiness: can this instance serve traffic (i.e., is the DB reachable)?
router.get("/ready", async (req, res) => {
  let db = "disconnected";
  try {
    await pool.query("SELECT 1");
    db = "connected";
  } catch (error) {
    console.error("Error checking database connection:", error);
  }

  const healthy = db === "connected";

  res.status(healthy ? 200 : 503).json({
    status: healthy ? "ok" : "degraded",
    uptime: process.uptime(),
    database: db,
    timestamp: new Date().toISOString(),
  });
});

// Optional convenience: keep `/` behaving like readiness for human use / simple monitors.
router.get("/", (req, res, next) => {
  // forward to /ready by rewriting the URL
  req.url = "/ready";
  router.handle(req, res, next);
});

module.exports = router;