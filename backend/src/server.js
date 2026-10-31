const http = require("http");

const app = require("./app");
const env = require("./config/env");
const { connectDB, disconnectDB } = require("./config/db");

let server;
let shuttingDown = false;

async function start() {
  try {
    await connectDB();

    server = http.createServer(app);
    server.listen(env.port, "0.0.0.0", () => {
      console.log(
        `Server listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`
      );
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received — shutting down gracefully...`);

  if (!server) return process.exit(0);

  server.close(async (err) => {
    if (err) {
      console.error("Error closing HTTP server:", err);
      return process.exit(1);
    }
    try {
      if (typeof disconnectDB === "function") await disconnectDB();
      console.log("Shutdown complete.");
      process.exit(0);
    } catch (e) {
      console.error("Error during DB disconnect:", e);
      process.exit(1);
    }
  });

  // Force exit if graceful shutdown hangs (Render kills after ~30s anyway)
  setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  shutdown("uncaughtException");
});

start();