"use strict";

const crypto = require("node:crypto");
const { ApiError, ERROR_CODES } = require("./errors");
const { getHeader } = require("./http");

const MAX_TOKEN_LENGTH = 512;
const BEARER_RE = /^Bearer\s+(.+)$/i;

function secureEqual(left, right) {
  const a = crypto.createHash("sha256").update(String(left), "utf8").digest();
  const b = crypto.createHash("sha256").update(String(right), "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}

function readPresentedToken(req) {
  const header = getHeader(req, "x-beta-access-token");
  if (typeof header === "string" && header.trim()) {
    return header.trim();
  }

  const authorization = getHeader(req, "authorization");
  if (typeof authorization === "string") {
    const match = BEARER_RE.exec(authorization.trim());
    if (match) return match[1].trim();
  }
  return "";
}

/**
 * Private-beta gate. Fail closed if enabled without a sufficiently strong
 * server-side token. Missing and wrong tokens intentionally share one response.
 * Tokens are accepted only from headers, never from the URL/query string.
 */
function checkBetaGate(req, config) {
  if (!config.betaGateEnabled) return;

  if (!config.betaToken || config.betaToken.length < config.betaTokenMinLength) {
    throw new ApiError(
      503,
      ERROR_CODES.BETA_GATE_NOT_CONFIGURED,
      "The beta gate is enabled but is not configured on the server."
    );
  }

  const presented = readPresentedToken(req);
  if (
    !presented ||
    presented.length > MAX_TOKEN_LENGTH ||
    !secureEqual(presented, config.betaToken)
  ) {
    throw new ApiError(
      401,
      ERROR_CODES.BETA_ACCESS_DENIED,
      "A valid beta access token is required.",
      undefined,
      { "WWW-Authenticate": 'Bearer realm="doll-phase1"' }
    );
  }
}

module.exports = {
  checkBetaGate,
  secureEqual,
};
