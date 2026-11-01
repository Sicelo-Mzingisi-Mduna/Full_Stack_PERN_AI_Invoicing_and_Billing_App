// services/n8n/loggers.js
const env = require("../../config/env");
const { createLogger } = require("./logger");

module.exports = {
  general: createLogger({
    webhookUrl: env.n8n.loggers.general.webhookUrl,
    secret:     env.n8n.loggers.general.secret,
    event:      "backend-log",
  }),

  requests: createLogger({
    webhookUrl: env.n8n.loggers.requests.webhookUrl,
    secret:     env.n8n.loggers.requests.secret,
    event:      "request-log",
  }),

  // When you're ready for error-only logging:
  // errors: createLogger({
  //   webhookUrl: env.n8n.loggers.errors.webhookUrl,
  //   secret:     env.n8n.loggers.errors.secret,
  //   event:      "error-log",
  // }),
};


// Example log payload sent to n8n (for reference):
// {
//   "event": "backend-log",
//   "level": "error",
//   "message": "User not found",
//   "meta": {
//     "userId": "abc123",
//     "path": "/api/users/abc123",
//     "method": "GET"
//   },
//   "service": "ai-invoice-manager-api",
//   "env": "development",
//   "timestamp": "2026-11-01T14:32:07.123Z"
// }