const env = require("../../config/env");

// services/cronJobController.js
const CRONJOB_API_BASE = "https://api.cron-job.org";

async function setJobEnabled(enabled) {
  const { apiKey, jobId } = env.cronjob;
  if (!apiKey || !jobId) {
    console.warn("[cronJob] Missing config — skipping toggle.");
    return;
  }

  const url = `${CRONJOB_API_BASE}/jobs/${jobId}`;
  const payload = { job: { enabled } };

  try {
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
      console.error(`[cronJob] Toggle failed (${response.status}): ${text}`);
    } else {
      console.log(`[cronJob] Job ${jobId} ${enabled ? "enabled" : "disabled"}.`);
    }
  } catch (err) {
    console.error(`[cronJob] Network error: ${err.message}`);
  }
}

module.exports = {
  enable: () => setJobEnabled(true),
  disable: () => setJobEnabled(false),
};