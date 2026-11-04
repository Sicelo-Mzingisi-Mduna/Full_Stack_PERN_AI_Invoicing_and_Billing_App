const env = require("../../config/env");

const CRONJOB_API_BASE = "https://api.cron-job.org";

async function setJobEnabled(jobId, label, enabled) {
  const { apiKey } = env.cronjob;
  if (!apiKey || !jobId) {
    console.warn(`[cronJob] Missing config for ${label} — skipping toggle.`);
    throw new Error(`${label} config missing`);
  }

  const url = `${CRONJOB_API_BASE}/jobs/${jobId}`;
  const payload = { job: { enabled } };

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[cronJob] ${label} toggle failed (${response.status}): ${text}`);
    throw new Error(`${label} toggle failed: ${response.status}`);
  }

  console.log(`[cronJob] ${label} job ${jobId} ${enabled ? "enabled" : "disabled"}.`);
}

module.exports = {
  enableBackend:  () => setJobEnabled(env.cronjob.jobId,    "backend", true),
  disableBackend: () => setJobEnabled(env.cronjob.jobId,    "backend", false),
  enableN8n:      () => setJobEnabled(env.cronjob.n8nJobId, "n8n",     true),
  disableN8n:     () => setJobEnabled(env.cronjob.n8nJobId, "n8n",     false),
};