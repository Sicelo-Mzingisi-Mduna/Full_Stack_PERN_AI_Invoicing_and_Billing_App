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
    this._lastCronEnableAttemptAt = null;
  }

  /** Call from middleware on any real user request. */
  touch() {
  if (!env.n8n.enabled) return;
  this.lastActivityAt = Date.now();
  if (!this.running) this.start();

  // Debounce: attempt to enable at most once per 60 seconds.
  // This handles:
  //   - First request after a stop() → re-enables
  //   - Manual disable outside the pinger → re-enables on next request
  //   - Rapid-fire curls → only one enable call per minute
  const now = Date.now();
  const lastAttempt = this._lastCronEnableAttemptAt || 0;
  if (now - lastAttempt > 60_000) {
    this._lastCronEnableAttemptAt = now;
    console.log("[pinger] touch() — attempting cron enable (debounced)");
    this._enableCrons();
  } else {
    console.log(`[pinger] touch() — cron enable debounced (${Math.floor((now - lastAttempt) / 1000)}s ago)`);
  }
}

  /** Start immediately (call from server.js so n8n is warm before traffic). */
  start() {
    if (this.running || !env.n8n.enabled) return;
    this._pingerStartedAt = Date.now();
    this._lastBaseStatus = null;
    // NOTE: do NOT set lastActivityAt here — only touch() marks real user activity.
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
    this._pingerStartedAt = null;
    this._lastBaseStatus = null;

    await this._disableCrons();

    // RACE GUARD: touch() may have restarted the pinger during our await.
    if (this.running) {
      console.warn("[pinger] restart detected during cron disable — re-enabling");
      this.cronEnabled = true;
      await this._enableCrons();
    }
  }

  async _enableCrons() {
    const results = await Promise.allSettled([
      cronJob.enableBackend(),
      cronJob.enableN8n(),
    ]);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error(`[pinger] cron enable failed for ${failed.length} job(s) — will retry on next touch`);
      this.cronEnabled = false;
      return;
    }
    console.log("[pinger] both cron jobs enabled");
  }

  async _disableCrons() {
    const results = await Promise.allSettled([
      cronJob.disableBackend(),
      cronJob.disableN8n(),
    ]);
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      console.error(`[pinger] cron disable failed for ${failed.length} job(s)`);
    } else {
      console.log("[pinger] both cron jobs disabled");
    }
  }

  _tick() {
    const idle = !this.lastActivityAt || Date.now() - this.lastActivityAt > env.n8n.activeWindowMs;
    if (idle) return this.stop();
    this._ping(env.n8n.initialTimeoutMs);
  }

  async _ping(timeoutMs) {
    const startedAt = Date.now();

    try {
      const res = await request(env.n8n.baseUrl, { timeoutMs });

      console.log(`[n8n pinger] base ping → ${res.status} (${Date.now() - startedAt}ms)`);

      // 429 (Cloudflare) or 503 (Render booting) = not ready.
      // Cron #1 will handle the wake from its unblocked IPs. Skip retries.
      if (res.status === 429 || res.status === 503) {
        this._lastBaseStatus = 'down';
        this.retryCount = 0;
        console.log(`[n8n pinger] ${res.status} — cron #1 will wake n8n, skipping retries`);
        return;
      }

      if (!res.ok) {
        throw new Error(`base ping returned HTTP ${res.status}`);
      }

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
        console.log(`[n8n pinger] retry ${this.retryCount}/${env.n8n.maxRetries} in ${env.n8n.retryDelayMs / 1000}s`);
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