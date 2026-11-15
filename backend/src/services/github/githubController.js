// services/github/githubController.js
const env = require("../../config/env");

async function dispatchWorkflow() {
  const { token, owner, repo, workflow, ref } = env.githubActions || {};

  if (!token || !owner || !repo || !workflow) {
    throw new Error("GitHub Actions config missing (token/owner/repo/workflow)");
  }

  // The n8n URL is pulled from your existing environment config
  const targetN8nUrl = env.n8n.baseUrl;

  const url = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ 
        ref: ref || "main",
        inputs: {
          n8n_url: targetN8nUrl
        }
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API returned ${res.status}: ${text}`);
    }
    
    // 204 No Content is success
    console.log(`[GitHub] Successfully dispatched wake workflow for ${targetN8nUrl}`);
  } catch (err) {
    throw new Error(`GitHub dispatch failed: ${err.message}`);
  }
}

module.exports = { dispatchWorkflow };