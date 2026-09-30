const dotenv = require("dotenv");
const path = require("path");

dotenv.config({path: path.resolve(__dirname, "../../.env")});

const required = ["DATABASE_URL", "JWT_SECRET"];

const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(`Missing environment variables: ${missing.join(", ")}`);
  process.exit(1);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: process.env.PORT || 8000,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  cookieName: process.env.COOKIE_NAME || "aibm_token",
  clientOrigins: (process.env.CLIENT_ORIGINS || "http://localhost:5173, http://localhost:5174")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  isProd: process.env.NODE_ENV === "production",
};