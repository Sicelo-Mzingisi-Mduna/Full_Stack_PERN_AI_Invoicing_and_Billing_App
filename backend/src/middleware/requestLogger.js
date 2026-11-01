// middleware/requestLogger.js
const env = require("../config/env");
const { loggers } = require("../services/n8n");
const { pool } = require("../config/db");

// Parse the exclude list once, at module load.
const EXCLUDED_PREFIXES = (process.env.N8N_LOG_REQUESTS_EXCLUDE || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Cheap, synchronous snapshot of pool health.
 * Reads pool properties only — never fires a query.
 */
function dbStatus() {
  if (!pool) return "unavailable";
  if (pool.waitingCount > 0) return "saturated"; // all clients busy, requests queued
  if (pool.totalCount > 0) return "connected";   // at least one client open
  return "idle";                                  // no clients yet (fresh boot, or all closed)
}

module.exports = function requestLogger(req, res, next) {
  // Skip excluded paths before attaching the finish listener — no work for noise.
  if (EXCLUDED_PREFIXES.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const startedAt = Date.now();

  res.on("finish", () => {
    const now = Date.now();

    loggers.requests.info("http_request", {
      userId:            req.user?.id ?? null,
      method:            req.method,
      path:              req.originalUrl || req.path,
      status:            res.statusCode,
      durationMs:        now - startedAt,
      uptime:            Math.round(process.uptime()),
      responseTimestamp: new Date().toISOString(),
      database:          dbStatus(),
    });
  });

  next();
};