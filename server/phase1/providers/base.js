"use strict";

const { ApiError, ERROR_CODES } = require("../errors");

/**
 * Provider adapter contract (future phases):
 *
 * createGenerationJob(input, context) -> Promise<{
 *   providerJobId: string,
 *   status: "queued" | "generating" | "postprocessing"
 * }>
 *
 * getGenerationJob(providerJobId, context) -> Promise<{
 *   status: "queued" | "generating" | "postprocessing" | "ready" | "failed" | "cancelled",
 *   error?: string
 * }>
 *
 * getGenerationResult(providerJobId, context) -> Promise<{
 *   masterUrl, width, height, transparent, hasAlpha, model
 * }>
 *
 * Implementations must perform all provider calls server-side, read keys only
 * from process.env, never log prompts or secrets, and return normalized values.
 * None of these methods may upload, fit, or register a wardrobe asset directly.
 */
function createPlaceholderProvider(id, envKeys) {
  const keys = Object.freeze(envKeys.slice());

  function notImplemented() {
    throw new ApiError(
      501,
      ERROR_CODES.PROVIDER_NOT_IMPLEMENTED,
      "The selected provider adapter is not implemented in Phase 1."
    );
  }

  return Object.freeze({
    id,
    envKeys: keys,
    capabilities: Object.freeze({
      masterImage: true,
      transparentOutput: false,
      sketchInput: false,
      asyncJobs: true,
    }),
    isConfigured() {
      return keys.some((key) => Boolean(process.env[key]));
    },
    async createGenerationJob() {
      return notImplemented();
    },
    async getGenerationJob() {
      return notImplemented();
    },
    async getGenerationResult() {
      return notImplemented();
    },
  });
}

module.exports = {
  createPlaceholderProvider,
};
