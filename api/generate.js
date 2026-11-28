"use strict";

const { loadConfig } = require("../server/phase1/config");
const { ApiError, ERROR_CODES } = require("../server/phase1/errors");
const { createLogger } = require("../server/phase1/logger");
const {
  assertDeclaredBodySize,
  assertJsonContentType,
  assertMethod,
  createRequestId,
  readJsonBody,
  sendError,
  sendJson,
} = require("../server/phase1/http");
const { checkBetaGate } = require("../server/phase1/beta-gate");
const { validateGenerateRequest } = require("../server/phase1/validation");
const { buildQueuedJob } = require("../server/phase1/jobs");
const { getProvider } = require("../server/phase1/providers");

module.exports = async function handler(req, res) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const config = loadConfig();
  const logger = createLogger(config);

  let status = 500;
  let code = ERROR_CODES.INTERNAL_ERROR;
  let meta = {};

  try {
    assertMethod(req);
    assertJsonContentType(req);
    assertDeclaredBodySize(req, config.maxBodyBytes);
    checkBetaGate(req, config);

    if (config.configErrors.length) {
      throw new ApiError(
        503,
        ERROR_CODES.SERVER_MISCONFIGURED,
        "The API is not configured correctly on the server."
      );
    }

    if (!config.generationEnabled) {
      throw new ApiError(
        503,
        ERROR_CODES.GENERATION_DISABLED,
        "Generation is disabled on this deployment."
      );
    }

    // Phase 1 is a private beta. Refuse accidental ungated generation in
    // production even if the generation flag is turned on.
    if (config.isProduction && !config.betaGateEnabled) {
      throw new ApiError(
        503,
        ERROR_CODES.BETA_GATE_REQUIRED,
        "The private beta gate must be enabled in production before generation."
      );
    }

    const body = await readJsonBody(req, config.maxBodyBytes);
    const input = validateGenerateRequest(body);

    meta = {
      sourceKind: input.source.kind,
      slot: input.garment.slot,
      garmentKind: input.garment.garmentKind,
      promptLength: input.source.prompt.length,
      refinementCount: input.source.refinementInstructions.length,
      hasSketch: Boolean(input.source.sketchRef),
      provider: config.provider,
      dryRun: config.dryRun,
    };

    let adapter = null;
    if (config.provider !== "none") {
      adapter = getProvider(config.provider);
      if (!adapter) {
        throw new ApiError(
          503,
          ERROR_CODES.PROVIDER_NOT_CONFIGURED,
          "The configured provider is not available."
        );
      }
      if (!config.dryRun && !adapter.isConfigured()) {
        throw new ApiError(
          503,
          ERROR_CODES.PROVIDER_NOT_CONFIGURED,
          "The configured provider has no server-side credentials."
        );
      }
    }

    if (!config.dryRun && !adapter) {
      throw new ApiError(
        503,
        ERROR_CODES.PROVIDER_NOT_CONFIGURED,
        "No image provider is configured."
      );
    }

    let providerJob = null;
    if (!config.dryRun) {
      // Phase 1 adapters deliberately throw PROVIDER_NOT_IMPLEMENTED. This call
      // exists so the future provider boundary is explicit and never client-side.
      providerJob = await adapter.createGenerationJob(input, { requestId });
    }

    const job = buildQueuedJob(input, {
      requestId,
      provider: config.provider,
      dryRun: config.dryRun,
      ttlSeconds: config.jobTtlSeconds,
      providerJobId: providerJob && providerJob.providerJobId,
    });

    status = 202;
    code = config.dryRun ? "DRY_RUN_QUEUED" : "QUEUED";
    sendJson(res, 202, { ok: true, requestId, job }, requestId);
  } catch (error) {
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(
            500,
            ERROR_CODES.INTERNAL_ERROR,
            "An unexpected server error occurred."
          );

    status = apiError.status;
    code = apiError.code;

    if (apiError.code === ERROR_CODES.SERVER_MISCONFIGURED) {
      logger.error("generate.config_error", {
        requestId,
        fields: config.configErrors.map((item) => item.path),
      });
    } else if (!(error instanceof ApiError)) {
      logger.error("generate.internal_error", {
        requestId,
        errorName: error && error.name ? String(error.name) : "UnknownError",
      });
    }

    sendError(res, apiError, requestId);
  } finally {
    logger.info("generate.request", {
      requestId,
      method: req && req.method ? req.method : "unknown",
      status,
      code,
      durationMs: Date.now() - startedAt,
      ...meta,
    });
  }
};
