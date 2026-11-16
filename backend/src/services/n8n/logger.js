// services/n8n/logger.js
const env = require("../../config/env");
const { request } = require("./n8nClient");

class LogQueue {
  constructor(name, options = {}) {
    this.name = name;
    this.queue = [];
    this.maxSize = options.maxSize ?? 200;
    this.flushIntervalMs = options.flushIntervalMs ?? 30_000;
    this.maxAttempts = options.maxAttempts ?? 20;
    this.flushTimer = null;
    this.flushing = false;
  }

  enqueue(payload) {
    if (this.queue.length >= this.maxSize) {
      this.queue.shift(); // drop oldest
      console.warn(`[logQueue:${this.name}] full — dropped oldest entry`);
    }
    this.queue.push({ payload, attempts: 0, queuedAt: Date.now() });
  }

  async flushOnce(webhookUrl, secret) {
    if (this.flushing || this.queue.length === 0) return;
    this.flushing = true;

    try {
      const batch = this.queue.slice();
      for (const item of batch) {
        try {
          const res = await request(webhookUrl, {
            method: "POST",
            body: item.payload,
            timeoutMs: 5_000,
            headers: secret ? { "x-webhook-secret": secret } : {},
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          
          // Success — remove from queue
          this.queue = this.queue.filter((q) => q !== item);
          console.log(`[logQueue:${this.name}] flushed successfully (queue: ${this.queue.length})`);
        } catch (err) {
          item.attempts++;
          if (item.attempts >= this.maxAttempts) {
            this.queue = this.queue.filter((q) => q !== item);
            console.warn(`[logQueue:${this.name}] gave up after ${this.maxAttempts} attempts: ${err.message}`);
          }
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  start(webhookUrl, secret) {
    if (this.flushTimer || !webhookUrl) return;

    // Flush on schedule
    this.flushTimer = setInterval(() => {
      this.flushOnce(webhookUrl, secret).catch(() => {});
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();

    // Flush immediately when pinger reports n8n is up
    process.on("n8n:awake", () => {
      this.flushOnce(webhookUrl, secret).catch(() => {});
    });
  }

  stop() {
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
  }

  size() {
    return this.queue.length;
  }
}

function createLogger({ webhookUrl, secret, event }) {
  const queue = new LogQueue(event);

  function send(level, message, meta) {
    if (!env.n8n.enabled || !webhookUrl) return;

    const payload = {
      event, level, message, meta,
      service: "ai-invoice-manager-api",
      env: env.nodeEnv,
      timestamp: new Date().toISOString(),
    };

    request(webhookUrl, {
      method: "POST",
      body: payload,
      timeoutMs: 5_000,
      headers: secret ? { "x-webhook-secret": secret } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Success — done
      })
      .catch((err) => {
        queue.enqueue(payload);
        console.log(`[n8n logger:${event}] failed (${err.message}) — queued (queue: ${queue.size()})`);
      });
  }

  // Start the retry loop
  if (env.n8n.enabled && webhookUrl) {
    queue.start(webhookUrl, secret);
  }

  return {
    error: (msg, meta) => send("error", msg, meta),
    warn:  (msg, meta) => send("warn",  msg, meta),
    info:  (msg, meta) => send("info",  msg, meta),
    debug: (msg, meta) => send("debug", msg, meta),
    _queue: queue,
    _stop: () => queue.stop(),
  };
}

module.exports = { createLogger };