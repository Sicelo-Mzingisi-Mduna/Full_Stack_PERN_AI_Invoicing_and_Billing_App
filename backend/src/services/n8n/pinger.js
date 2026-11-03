const env = require("../../config/env");
const { request } = require("./n8nClient");
const cronJob = require("../cronjob");

class N8nPinger {
  constructor() {
    this.interval = null;
    this.retryTimer = null;
    this.retryCount = 0;
    this.lastActivityAt = null;
    this.lastStatus = null;
    this.running = false;
    this.cronEnabled = false;
  }

  /** Call from middleware on any real user request. */
  touch() {
  if (!env.n8n.enabled) return;
  this.lastActivityAt = Date.now();

  if (!this.running) {
    this.start();
  }

  if (!this.cronEnabled) {                    
    this.cronEnabled = true;
    cronJob.enable().catch((err) => {
      this.cronEnabled = false;              
      console.error("[pinger] cron enable failed", err);
    });
  }
}

  /** Start immediately (call from server.js so n8n is warm before traffic). */
  start() {
    if (this.running || !env.n8n.enabled) return;
    this.running = true;
    this._ping(env.n8n.initialTimeoutMs);

    this.interval = setInterval(() => this._tick(), env.n8n.pingIntervalMs);
    this.interval.unref?.(); // don't hold the event loop open
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.interval = null;
    this.retryTimer = null;
    this.retryCount = 0;
    this.running = false;
    this.lastActivityAt = null;
    this.cronEnabled = false;                   // ← ADD
    cronJob.disable().catch((err) =>
      console.error("[pinger] cron disable failed", err)
    );
}

  _tick() {
    const idle = !this.lastActivityAt || Date.now() - this.lastActivityAt > env.n8n.activeWindowMs;
    if (idle) return this.stop();
    this._ping(env.n8n.initialTimeoutMs);
  }

  async _ping(timeoutMs) {
    try {
      const res = await request(env.n8n.baseUrl, { timeoutMs });
      this.retryCount = 0;
      this.lastStatus = res.status;

      if (env.n8n.webhookUrl) {
        try {
          const wh = await request(env.n8n.webhookUrl, { timeoutMs: 15_000 });
          this.lastStatus = await wh.text();
        } catch {
          this.lastStatus = null;
        }
      }
    } catch (err) {
      console.warn(`[n8n pinger] ping failed: ${err.message}`);
      if (this.retryCount < env.n8n.maxRetries) {
        this.retryCount++;
        this.retryTimer = setTimeout(() => this._ping(timeoutMs), env.n8n.retryDelayMs);
        this.retryTimer.unref?.();
      } else {
        this.retryCount = 0;
      }
    }
  }
}

module.exports = new N8nPinger();