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