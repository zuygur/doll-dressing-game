"use strict";

/**
 * Mock adapter for harness verification only. It never contacts a provider and
 * never returns an image. Every result is explicitly simulated.
 */
module.exports = Object.freeze({
  id: "mock",
  label: "Mock / dry-run",
  implemented: true,
  requiresConfirmation: false,
  isConfigured() {
    return true;
  },
  getModel() {
    return null;
  },
  async generate({ caseDef }) {
    return {
      simulated: true,
      provider: "mock",
      model: null,
      imageBuffer: null,
      mimeType: null,
      providerRequestId: null,
      latencyMs: null,
      estimatedCostUsd: null,
      costEstimateStatus: "simulated_not_applicable",
      notes: [
        `Simulated result for ${caseDef.id}: no provider was called and no image was produced.`,
      ],
    };
  },
});
