const dotenv = require("dotenv");
const path = require("path");
const os = require("os");
const fs = require("fs");

// On Render, env vars come from the dashboard — never from a file.
// Loading dotenv in prod risks a stale local .env shadowing real config.
if (process.env.NODE_ENV !== "production") {
  // Load order (first existing path wins):
  //   1. DOTENV_CONFIG_PATH — explicit override, useful in CI
  //   2. %USERPROFILE%\.secrets\ai-invoice-manager\.env — outside the repo,
  //      survives `git clean -fdx`, branch switches, and accidental deletion
  //   3. backend/.env — fallback for fresh clones / teammates
  const candidates = [
    process.env.DOTENV_CONFIG_PATH,
    path.join(os.homedir(), ".secrets", "ai-invoice-manager", ".env"),
    path.resolve(__dirname, "../../.env"),
  ].filter(Boolean);

  const loaded = candidates.find((p) => fs.existsSync(p));
  if (loaded) {
    const result = dotenv.config({ path: loaded });
    if (result.error) {
      console.error(`[env] failed to load ${loaded}: ${result.error.message}`);
    } else {
      console.log(`[env] loaded from ${loaded}`);
    }
  } else {
    console.warn(`[env] no .env file found. Checked:\n  ${candidates.join("\n  ")}`);
  }
}

const isProd = process.env.NODE_ENV === "production";

// --- Required vars: fail fast before the server even boots ---
const required = ["DATABASE_URL", "JWT_SECRET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

// --- CORS: prefer CORS_ORIGINS, keep CLIENT_ORIGINS as a local fallback ---
const rawOrigins = process.env.CORS_ORIGINS || process.env.CLIENT_ORIGINS;

if (isProd && !rawOrigins) {
  console.error(
    "CORS_ORIGINS must be set in production (comma-separated URLs)."
  );
  process.exit(1);
}

const corsOrigins = rawOrigins
  ? rawOrigins.split(",").map((s) => s.trim()).filter(Boolean)
  : ["http://localhost:5173", "http://localhost:5174"];

// --- Public config object ---
module.exports = {
  isProd,
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT) || 8000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cookieName: process.env.COOKIE_NAME || "aibm_token",
  corsOrigins,
  clientOrigins: corsOrigins,
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",

  // --- n8n integration (optional; toggle with N8N_ENABLED) ---
  n8n: {
    enabled: process.env.N8N_ENABLED !== "false", // on by default, opt-out
    baseUrl: process.env.N8N_URL || "https://n8n-with-python-f7bi.onrender.com",
    webhookUrl: process.env.N8N_WEBHOOK_URL || "",
    pingIntervalMs: Number(process.env.N8N_PING_INTERVAL_MS) || 2 * 60 * 1000,
    activeWindowMs: Number(process.env.N8N_ACTIVE_WINDOW_MS) || 60 * 60 * 1000,
    initialTimeoutMs: Number(process.env.N8N_INITIAL_TIMEOUT_MS) || 60_000,
    retryDelayMs: Number(process.env.N8N_RETRY_DELAY_MS) || 10_000,
    maxRetries: Number(process.env.N8N_MAX_RETRIES) || 5,
    loggers: {
      general: {
        webhookUrl: process.env.N8N_LOG_GENERAL_WEBHOOK_URL || "",
        secret:     process.env.N8N_LOG_GENERAL_WEBHOOK_SECRET || "",
      },
      //Request logger, for requests sent to my API (e.g. from n8n workflows). This is useful for debugging and auditing.
      requests: {
        webhookUrl: process.env.N8N_LOG_REQUESTS_WEBHOOK_URL || "",
        secret:     process.env.N8N_LOG_REQUESTS_WEBHOOK_SECRET || "",
      },
      // errors logger, to log errors that are picked up by my API
      // errors: {
      //   webhookUrl: process.env.N8N_LOG_ERRORS_WEBHOOK_URL || "",
      //   secret:     process.env.N8N_LOG_ERRORS_WEBHOOK_SECRET || "",
      // },
      },
  },
};

// code "$env:USERPROFILE\.secrets\ai-invoice-manager\.env"