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
    debug: (msg, meta) => send("debug", msg, meta),
    info:  (msg, meta) => send("info",  msg, meta),
    warn:  (msg, meta) => send("warn",  msg, meta),
    error: (msg, meta) => send("error", msg, meta),
  };
}

module.exports = { createLogger };