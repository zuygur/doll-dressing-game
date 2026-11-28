"use strict";

const crypto = require("node:crypto");

// Keep these aligned with phase0/fit-profiles.*.json until a runtime profile
// registry replaces the constants in a later phase. Profiles intentionally
// remain drafts in Phase 1.
const FIT_PROFILE_VERSION = "0.1.0";
const FIT_PROFILE_STATUS = "draft-needs-visual-signoff";

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function buildInputSummary(input) {
  return {
    sourceKind: input.source.kind,
    promptLength: input.source.prompt.length,
    conceptTitleLength: input.concept.title ? input.concept.title.length : 0,
    colorCount: Array.isArray(input.concept.colors) ? input.concept.colors.length : 0,
    refinementCount: input.source.refinementInstructions.length,
    hasSketch: Boolean(input.source.sketchRef),
    previewGenders: input.options.previewGenders.slice(),
  };
}

/**
 * Builds a Phase 0 `generationJob`-compatible envelope. Phase 1 never produces
 * master/preview/fitted images; the `planned` block describes the future work
 * and `dryRun` makes the absence of a provider call explicit.
 */
function buildQueuedJob(input, options) {
  const opts = options || {};
  const now = opts.now instanceof Date ? opts.now : new Date();
  const createdAt = now.toISOString();
  const ttlSeconds = Number.isInteger(opts.ttlSeconds) ? opts.ttlSeconds : 3600;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();
  const provider = ["openai", "replicate", "stability"].includes(opts.provider)
    ? opts.provider
    : "unknown";

  const job = {
    jobId: createId("job"),
    status: "queued",
    provider,
    designId: input.source.designId || createId("dsg"),
    createdAt,
    updatedAt: createdAt,
    expiresAt,
    requestId: opts.requestId,
    dryRun: Boolean(opts.dryRun),
    slot: input.garment.slot,
    profileSlot: input.garment.profileSlot,
    subtype: input.garment.subtype,
    garmentKind: input.garment.garmentKind,
    coversLower: input.garment.coversLower,
    fitProfileVersion: FIT_PROFILE_VERSION,
    fitProfileStatus: FIT_PROFILE_STATUS,
    planned: {
      master: true,
      preview: true,
      thumbnail: true,
      genderVariants: ["girl", "boy"],
      fitting: false,
      meshWarp: false,
      wardrobeRegistration: false,
    },
    inputSummary: buildInputSummary(input),
  };

  if (opts.providerJobId) {
    job.providerJobId = String(opts.providerJobId);
  }

  return job;
}

module.exports = {
  FIT_PROFILE_STATUS,
  FIT_PROFILE_VERSION,
  buildInputSummary,
  buildQueuedJob,
  createId,
};
