const {rateLimit, ipKeyGenerator} = require('express-rate-limit');

const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 15, // Limit each IP to 15 requests per `window` (here, per minute)
  standardHeaders: "draft-7", // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip), // Use user ID if available, otherwise fallback to IP address
  message: {
    error: {message: "Too many AI requests, please try again later."},
  },
});

const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // Limit each IP to 30 requests per `window` (here, per minute)
  standardHeaders: "draft-7", // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req) => ipKeyGenerator(req.ip), // IP address
  message: {
    error: {message: "Too many auth requests, please try again later."},
  },
});

module.exports = {aiLimiter, authLimiter};