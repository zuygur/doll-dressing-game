"use strict";

/**
 * Structured API error used by the Phase 1 generate endpoint.
 *
 * Only the public fields below are serialized to clients. Never put prompts,
 * provider keys, beta tokens, or raw provider responses in `message`/`details`.
 */
class ApiError extends Error {
  constructor(status, code, message, details, headers) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = Array.isArray(details) ? details.slice(0, 20) : undefined;
    this.headers = headers && typeof headers === "object" ? headers : undefined;
  }
}

const ERROR_CODES = Object.freeze({
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
  UNSUPPORTED_MEDIA_TYPE: "UNSUPPORTED_MEDIA_TYPE",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  INVALID_CONTENT_LENGTH: "INVALID_CONTENT_LENGTH",
  INVALID_ENCODING: "INVALID_ENCODING",
  INVALID_JSON: "INVALID_JSON",
  BETA_ACCESS_DENIED: "BETA_ACCESS_DENIED",
  BETA_GATE_NOT_CONFIGURED: "BETA_GATE_NOT_CONFIGURED",
  BETA_GATE_REQUIRED: "BETA_GATE_REQUIRED",
  GENERATION_DISABLED: "GENERATION_DISABLED",
  PROVIDER_NOT_CONFIGURED: "PROVIDER_NOT_CONFIGURED",
  PROVIDER_NOT_IMPLEMENTED: "PROVIDER_NOT_IMPLEMENTED",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  SERVER_MISCONFIGURED: "SERVER_MISCONFIGURED",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
});

function toPublicError(error, requestId) {
  if (error instanceof ApiError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.details ? { details: error.details } : {}),
      },
    };
  }
  return {
    ok: false,
    error: {
      code: ERROR_CODES.INTERNAL_ERROR,
      message: "An unexpected server error occurred.",
      requestId,
    },
  };
}

module.exports = {
  ApiError,
  ERROR_CODES,
  toPublicError,
};
