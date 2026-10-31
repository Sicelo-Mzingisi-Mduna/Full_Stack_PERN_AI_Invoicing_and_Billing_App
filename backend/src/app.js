const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const morgan = require("morgan");
const helmet = require("helmet");

const env = require("./config/env");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const healthRoute = require("./routes/health");

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

// Routes
app.use("/api/health", healthRoute);

// Errors (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;