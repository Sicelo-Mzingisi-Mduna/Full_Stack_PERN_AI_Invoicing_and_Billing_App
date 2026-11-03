// middleware/trackActivity.js
const { pinger } = require("../services/n8n");

// Health endpoints and keepalive pings are noise — don't count them as
// real user activity, otherwise the pinger never stops on a deployed instance.
const IGNORED_PREFIXES = ["/api/health", "/keepalive"];
const IGNORED_USER_AGENTS = ["Render/1.0", "Go-http-client", "cron-job.org"];

module.exports = function trackActivity(req, _res, next) {
  const ua = req.headers["user-agent"] || "";
  const isBotTraffic = IGNORED_USER_AGENTS.some((botUa) => ua.includes(botUa));

  if (!isBotTraffic && !IGNORED_PREFIXES.some((p) => req.path.startsWith(p))) {
    pinger.touch();
  }
  next();
};