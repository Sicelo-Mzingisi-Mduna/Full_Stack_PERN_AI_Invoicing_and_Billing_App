// services/n8n/logger.js
const env = require("../../config/env");
const { request } = require("./n8nClient");

/**
 * Create a logger bound to one specific n8n webhook.
 * @param {Object} opts
 * @param {string} opts.webhookUrl - Full URL to the n8n webhook for this logger.
 * @param {string} [opts.secret]   - Shared secret sent as x-webhook-secret header.
 * @param {string} opts.event      - Logical event name (used for routing in n8n).
 * @returns {{ debug, info, warn, error }}
 */
function createLogger({ webhookUrl, secret, event }) {
  function send(level, message, meta) {
    if (!env.n8n.enabled || !webhookUrl) return;

    const payload = {
      event,
      level,
      message,
      meta,
      service: "ai-invoice-manager-api",
      env: env.nodeEnv,
      timestamp: new Date().toISOString(),
    };

    // Fire-and-forget: never block or crash the request path.
    request(webhookUrl, {
      method: "POST",
      body: payload,
      timeoutMs: 5_000,
      headers: secret ? { "x-webhook-secret": secret } : {},
    }).catch((err) =>
      console.error(`[n8n logger:${event}] failed: ${err.message}`)
    );
  }

  return {
    
    // 1) Urgent — e.g "The server is down, page someone now"
    //something that needs fixing
    error: (msg, meta) => send("error", msg, meta),

    // 2) High — e.g "payments are failing, fix it today"
    //something to keep an eye on
    warn:  (msg, meta) => send("warn",  msg, meta),

    // 3) Normal — e.g "user created an invoice, FYI"
    //the story of what your app is doing
    info:  (msg, meta) => send("info",  msg, meta),

    // 4) Low — e.g "here's a debug trace, ignore unless investigating"
    //noise you only want while debugging
    debug: (msg, meta) => send("debug", msg, meta),
  };
}

module.exports = { createLogger };