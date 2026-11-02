// middleware/trackActivity.js
const { pinger } = require("../services/n8n");

// Health endpoints and keepalive pings are noise — don't count them as
// real user activity, otherwise the pinger never stops on a deployed instance.
const IGNORED_PREFIXES = ["/api/health", "/keepalive"];

module.exports = function trackActivity(req, _res, next) {
  if (!IGNORED_PREFIXES.some((p) => req.path.startsWith(p))) {
    pinger.touch();
  }
  next();
};