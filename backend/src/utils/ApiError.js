class ApiError extends Error {
  constructor(statusCode, message, options = {}) {
    // Native Error now supports `cause` in modern Node
    super(message, { cause: options.cause });

    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = options.code || defaultErrorCode(statusCode);
    this.details = options.details;
    this.isOperational = options.isOperational ?? true;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
      },
    };
  }

  // ---------- 4xx ----------
  static badRequest(message = "Bad request", details) {
    return new ApiError(400, message, { details, code: "BAD_REQUEST" });
  }
  static unauthorized(message = "Unauthorized", details) {
    return new ApiError(401, message, { details, code: "UNAUTHORIZED" });
  }
  static forbidden(message = "Forbidden", details) {
    return new ApiError(403, message, { details, code: "FORBIDDEN" });
  }
  static notFound(message = "Not found", details) {
    return new ApiError(404, message, { details, code: "NOT_FOUND" });
  }
  static methodNotAllowed(message = "Method not allowed") {
    return new ApiError(405, message, { code: "METHOD_NOT_ALLOWED" });
  }
  static conflict(message = "Conflict", details) {
    return new ApiError(409, message, { details, code: "CONFLICT" });
  }
  static payloadTooLarge(message = "Payload too large") {
    return new ApiError(413, message, { code: "PAYLOAD_TOO_LARGE" });
  }
  static unsupportedMediaType(message = "Unsupported media type") {
    return new ApiError(415, message, { code: "UNSUPPORTED_MEDIA_TYPE" });
  }
  static unprocessable(message = "Unprocessable entity", details) {
    return new ApiError(422, message, { details, code: "UNPROCESSABLE_ENTITY" });
  }
  static tooMany(message = "Too many requests") {
    return new ApiError(429, message, { code: "TOO_MANY_REQUESTS" });
  }

  // ---------- 5xx ----------
  static internal(message = "Internal server error", cause) {
    return new ApiError(500, message, {
      code: "INTERNAL_ERROR",
      isOperational: false,
      cause,
    });
  }
  static badGateway(message = "Bad gateway", cause) {
    return new ApiError(502, message, { code: "BAD_GATEWAY", cause });
  }
  static serviceUnavailable(message = "Service unavailable", cause) {
    return new ApiError(503, message, { code: "SERVICE_UNAVAILABLE", cause });
  }
  static gatewayTimeout(message = "Gateway timeout", cause) {
    return new ApiError(504, message, { code: "GATEWAY_TIMEOUT", cause });
  }
}

function defaultErrorCode(status) {
  const map = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
    504: "GATEWAY_TIMEOUT",
  };
  return map[status] || "ERROR";
}

module.exports = { ApiError };