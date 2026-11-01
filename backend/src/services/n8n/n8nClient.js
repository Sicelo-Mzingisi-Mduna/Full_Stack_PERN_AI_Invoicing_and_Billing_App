const env = require("../../config/env");

async function request(url, { method = "GET", body, timeoutMs = 15_000, headers = {} } = {}) {
  const fullUrl = url.startsWith("http") ? url : `${env.n8n.baseUrl}${url}`;
  return fetch(fullUrl, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
}

module.exports = { request };