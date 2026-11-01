const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const helmet = require("helmet");

const env = require("./config/env");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const healthRoute = require("./routes/health");
const requestLogger = require("./middleware/requestLogger");

const app = express();

// Security & proxy
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(helmet());

// CORS — whitelist in prod, reflect in dev
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (curl, Render health checks, server-to-server)
      if (!origin) return callback(null, true);
      if (env.isProd && Array.isArray(env.corsOrigins) && !env.corsOrigins.includes(origin)) {
        return callback(new Error("Not allowed by CORS"));
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Parsers
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());

// Logging
app.use(morgan(env.isProd ? "combined" : "dev"));

// Logging middleware
app.use(requestLogger);

// Routes
app.use("/api/health", healthRoute);

app.get("/", (req, res) => {
  res.status(200).json({
    name: "AI Invoice Manager API",
    status: "ok",
    version: "0.1.0",
    health: "/api/health/live",
    docs: "/api/health",
  });
});

// Errors (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;