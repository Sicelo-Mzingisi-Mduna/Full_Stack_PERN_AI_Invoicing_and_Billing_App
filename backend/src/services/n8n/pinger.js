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
    this._lastBaseStatus = null;
    this._pingerStartedAt = null;
  }

  /** Call from middleware on any real user request. */
  touch() {
  if (!env.n8n.enabled) return;
  this.lastActivityAt = Date.now();
  if (!this.running) this.start();
  console.log("[pinger] touch() — cronEnabled =", this.cronEnabled);
  if (!this.cronEnabled) {
    this.cronEnabled = true;
    cronJob.enable()
      .then(() => console.log("[pinger] cron enable SUCCESS"))
      .catch((err) => {
        this.cronEnabled = false;
        console.error("[pinger] cron enable failed", err);
      });
  } else {
    console.log("[pinger] skipping cron enable (already enabled)");
  }
}

  /** Start immediately (call from server.js so n8n is warm before traffic). */
  start() {
  if (this.running || !env.n8n.enabled) return;
  this._pingerStartedAt = Date.now();
  this._lastBaseStatus = null;
  this.lastActivityAt = Date.now();   // ← ADD: treat boot as activity
  this.running = true;
  this._ping(env.n8n.initialTimeoutMs);

  this.interval = setInterval(() => this._tick(), env.n8n.pingIntervalMs);
  this.interval.unref?.();
}

  async stop() {
    if (this.interval) clearInterval(this.interval);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.interval = null;
    this.retryTimer = null;
    this.retryCount = 0;
    this.running = false;
    this.lastActivityAt = null;
    this.cronEnabled = false;
    // Reset wake-up logging state so the next session starts clean
    this._pingerStartedAt = null;
    this._lastBaseStatus = null;

    try {
      await cronJob.disable();
      // RACE GUARD: touch() may have restarted the pinger during our await.
      // If so, cron is now OFF but should be ON. Re-enable.
      if (this.running) {
        console.warn("[pinger] restart detected during cron disable — re-enabling");
        await cronJob.enable();
        this.cronEnabled = true;
      }
    } catch (err) {
      console.error("[pinger] cron disable failed", err);
    }
  }

  _tick() {
    const idle = !this.lastActivityAt || Date.now() - this.lastActivityAt > env.n8n.activeWindowMs;
    if (idle) return this.stop();
    this._ping(env.n8n.initialTimeoutMs);
  }

  async _ping(timeoutMs) {
  const startedAt = Date.now();
  // Cache-bust: force Render's edge to check real state, not serve cached 503
  const bustUrl = `${env.n8n.baseUrl}/?t=${Date.now()}`;

  try {
    const res = await request(bustUrl, { timeoutMs });

    // LOG the status — this is the key diagnostic line
    console.log(`[n8n pinger] base ping → ${res.status} (${Date.now() - startedAt}ms)`);

    // Treat ANY non-2xx as "not ready" — throw so retries kick in
    if (!res.ok) {
      throw new Error(`base ping returned HTTP ${res.status}`);
    }

    // --- Success path (only reached on 2xx) ---
    const previous = this._lastBaseStatus;
    this._lastBaseStatus = 'up';
    if (previous === 'down' || previous === null) {
      const wakeMs = this._pingerStartedAt ? Date.now() - this._pingerStartedAt : null;
      console.log(`🟢 [n8n pinger] n8n AWAKE at ${new Date().toISOString()} (wake took ${wakeMs}ms${previous === 'down' ? ', after failures' : ', fresh session'})`);
    }

    this.retryCount = 0;
    this.lastStatus = res.status;

    if (env.n8n.webhookUrl) {
      try {
        const wh = await request(env.n8n.webhookUrl, { timeoutMs: 15_000 });
        if (!wh.ok) {
          throw new Error(`webhook returned HTTP ${wh.status}`);
        }
        this.lastStatus = await wh.text();
        console.log(`[n8n pinger] webhook OK (total ${Date.now() - startedAt}ms)`);
      } catch (err) {
        this.lastStatus = null;
        console.log(`[n8n pinger] webhook FAILED: ${err.message}`);
      }
    }
  } catch (err) {
    const previous = this._lastBaseStatus;
    this._lastBaseStatus = 'down';
    if (previous === 'up') {
      console.log(`🔴 [n8n pinger] n8n UNREACHABLE at ${new Date().toISOString()} (was up, now failing)`);
    }

    console.log(`[n8n pinger] base ping FAILED: ${err.message} (${Date.now() - startedAt}ms)`);
    if (this.retryCount < env.n8n.maxRetries) {
      this.retryCount++;
      console.log(`[n8n pinger] retry ${this.retryCount}/${env.n8n.maxRetries} in ${env.n8n.retryDelayMs/1000}s`);
      this.retryTimer = setTimeout(() => this._ping(timeoutMs), env.n8n.retryDelayMs);
      this.retryTimer.unref?.();
    } else {
      console.log(`[n8n pinger] retries exhausted, waiting for next tick`);
      this.retryCount = 0;
    }
  }
}
}

module.exports = new N8nPinger();