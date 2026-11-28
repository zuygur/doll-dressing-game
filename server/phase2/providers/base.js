"use strict";

/**
 * Phase 2 pilot provider contract.
 *
 * No method in this directory may be called by the live game or by
 * POST /api/generate. Only the development CLI `phase2/pilot-runner.cjs`
 * invokes adapters, and only in explicitly confirmed real mode.
 *
 * Required future behavior for every adapter:
 * - read credentials only from server-side environment variables;
 * - never log prompts, keys, signed URLs, or raw provider response bodies;
 * - produce one garment master image only, not fitted or wardrobe assets;
 * - return a normalized result and sanitized provider errors.
 */
class PilotProviderError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "PilotProviderError";
    this.code = code;
    this.details = details && typeof details === "object" ? details : undefined;
  }
}

function assertFetch(fetchImpl) {
  if (typeof fetchImpl !== "function") {
    throw new PilotProviderError(
      "FETCH_UNAVAILABLE",
      "A fetch implementation is required for real provider calls."
    );
  }
}

module.exports = {
  PilotProviderError,
  assertFetch,
};
