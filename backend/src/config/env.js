const dotenv = require("dotenv");
const path = require("path");

// On Render, env vars come from the dashboard — never from a file.
// Loading dotenv in prod risks a stale local .env shadowing real config.
if (process.env.NODE_ENV !== "production") {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
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
// Dev defaults to the Vite dev servers; prod has no default on purpose.
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
  port: Number(process.env.PORT) || 8000, // Render passes PORT as a string
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cookieName: process.env.COOKIE_NAME || "aibm_token",
  corsOrigins,
  // Deprecated alias — remove once all callers use corsOrigins
  clientOrigins: corsOrigins,
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
};