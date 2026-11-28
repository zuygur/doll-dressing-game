"use strict";

const { PilotProviderError } = require("./base");

/**
 * Reserved for a later Stability AI adapter. Keeping the id and interface in
 * the registry means the pilot runner and report do not need redesign.
 */
module.exports = Object.freeze({
  id: "stability",
  label: "Stability AI (reserved)",
  implemented: false,
  requiresConfirmation: true,
  isConfigured() {
    return false;
  },
  getModel() {
    return null;
  },
  async generate() {
    throw new PilotProviderError(
      "PROVIDER_NOT_IMPLEMENTED",
      "The Stability AI pilot adapter is reserved but not implemented."
    );
  },
});
