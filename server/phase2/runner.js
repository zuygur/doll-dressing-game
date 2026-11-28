"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { loadPilotCases } = require("./cases");
const { buildPilotPrompt } = require("./prompt-builder");
const { getPilotProvider } = require("./providers");
const { PilotProviderError } = require("./providers/base");
const {
  automatedChecksFor,
  buildReport,
  evaluationFor,
  writeReport,
} = require("./report");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_OUTPUT_ROOT = path.join(PROJECT_ROOT, "phase2", "output");

class PilotRunError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PilotRunError";
    this.code = code;
  }
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function safeProviderError(error) {
  if (error instanceof PilotProviderError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    code: "PROVIDER_ERROR",
    message: "The provider call failed.",
  };
}

function readPricePerImage(env) {
  const raw = env && env.PHASE2_PRICE_PER_IMAGE_USD;
  if (raw === undefined || raw === null || String(raw).trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function relativeOutputPath(outputDirectory) {
  const rel = path.relative(PROJECT_ROOT, outputDirectory).replace(/\\/g, "/");
  return rel || ".";
}

function assertRealRunAllowed(providerId, env) {
  if (env.PHASE2_PILOT_CONFIRM_COST !== "YES") {
    throw new PilotRunError(
      "REAL_PILOT_NOT_CONFIRMED",
      "Real provider calls are blocked. Set PHASE2_PILOT_CONFIRM_COST=YES after reviewing the cost."
    );
  }
  if (providerId === "mock") {
    throw new PilotRunError(
      "REAL_MODE_REQUIRES_PROVIDER",
      "Real mode requires --provider=openai or --provider=replicate."
    );
  }
  const provider = getPilotProvider(providerId);
  if (!provider) {
    throw new PilotRunError("UNKNOWN_PROVIDER", "Unknown pilot provider.");
  }
  if (!provider.implemented) {
    throw new PilotRunError(
      "PROVIDER_NOT_IMPLEMENTED",
      "That provider adapter is reserved but not implemented."
    );
  }
  if (!provider.isConfigured(env)) {
    throw new PilotRunError(
      "PROVIDER_NOT_CONFIGURED",
      "The selected provider is missing its server-side environment configuration."
    );
  }
  return provider;
}

function selectCases(cases, requestedIds) {
  if (!requestedIds || requestedIds.length === 0) return cases;
  const wanted = new Set(requestedIds);
  const selected = cases.filter((item) => wanted.has(item.id));
  if (selected.length !== wanted.size) {
    throw new PilotRunError("UNKNOWN_CASE", "One or more requested case ids do not exist.");
  }
  return selected;
}

function buildReportCase(caseDef, context) {
  const { prompt, outcome, artifacts, latencyMs, cost, costStatus, errors, simulated } = context;
  const failed = errors.length > 0;
  return {
    caseId: caseDef.id,
    type: caseDef.type,
    sourceKind: caseDef.sourceKind,
    phase0CaseId: caseDef.phase0CaseId || null,
    garment: {
      slot: caseDef.slot,
      profileSlot: caseDef.profileSlot,
      subtype: caseDef.subtype,
      garmentKind: caseDef.garmentKind,
      coversLower: caseDef.coversLower,
      category: caseDef.category,
    },
    conceptTitle: caseDef.concept && caseDef.concept.title ? caseDef.concept.title : null,
    evaluationFocus: caseDef.evaluationFocus.slice(),
    simulated,
    status: failed ? "failed" : simulated ? "simulated" : "generated",
    provider: outcome && outcome.provider ? outcome.provider : null,
    model: outcome && outcome.model ? outcome.model : null,
    providerRequestId: outcome && outcome.providerRequestId ? outcome.providerRequestId : null,
    promptLength: prompt.length,
    promptSha256: sha256(prompt),
    latencyMs: simulated ? null : latencyMs,
    latencyStatus: simulated ? "simulated_not_measured" : "measured",
    estimatedCostUsd: simulated ? null : cost,
    costEstimateStatus: simulated ? "simulated_not_applicable" : costStatus,
    artifacts,
    automatedChecks: automatedChecksFor(simulated),
    evaluation: evaluationFor(caseDef, simulated, failed),
    errors,
    sketchFixture: caseDef.sketchFixture || null,
    fixtureOrigin: caseDef.fixtureOrigin || null,
    dollPlacement: caseDef.dollPlacement || null,
  };
}

async function runPilot(options) {
  const opts = options || {};
  const mode = opts.mode || "mock";
  if (!["mock", "real"].includes(mode)) {
    throw new PilotRunError("INVALID_MODE", "Mode must be mock or real.");
  }
  const simulated = mode === "mock";
  const providerId = opts.provider || (simulated ? "mock" : "");
  if (simulated && providerId !== "mock") {
    throw new PilotRunError(
      "MOCK_MODE_REQUIRES_MOCK_PROVIDER",
      "Mock/dry-run mode must use --provider=mock and never selects a real provider."
    );
  }
  const env = opts.env || process.env;
  const fetched = loadPilotCases(opts.casesPath);
  const selectedCases = selectCases(fetched.cases, opts.caseIds);

  const provider = simulated
    ? getPilotProvider("mock")
    : assertRealRunAllowed(providerId, env);
  if (!provider) {
    throw new PilotRunError("UNKNOWN_PROVIDER", "Unknown pilot provider.");
  }

  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const stamp = startedAt.replace(/[:.]/g, "-");
  const runId = `${mode}-${providerId}-${stamp}`;
  const outputDirectory = opts.outDir
    ? path.resolve(opts.outDir)
    : path.join(DEFAULT_OUTPUT_ROOT, runId);

  await fs.mkdir(outputDirectory, { recursive: true });

  const pricePerImage = readPricePerImage(env);
  const model = provider.getModel ? provider.getModel(env) : null;
  const results = [];

  for (const caseDef of selectedCases) {
    const prompt = buildPilotPrompt(caseDef);
    const started = Date.now();
    let outcome = null;
    let errors = [];
    let artifacts = [];

    try {
      outcome = await provider.generate({
        caseDef,
        prompt,
        env,
        fetchImpl: opts.fetchImpl || global.fetch,
      });

      if (simulated && (!outcome || outcome.simulated !== true)) {
        throw new PilotRunError(
          "MOCK_RESULT_NOT_SIMULATED",
          "Mock provider returned a non-simulated result."
        );
      }

      if (!simulated) {
        if (!outcome || !Buffer.isBuffer(outcome.imageBuffer)) {
          throw new PilotProviderError(
            "EMPTY_PROVIDER_RESULT",
            "The provider returned no image buffer."
          );
        }
        const filename = `${caseDef.id}.png`;
        const artifactPath = path.join(outputDirectory, filename);
        await fs.writeFile(artifactPath, outcome.imageBuffer);
        artifacts = [
          {
            path: path.relative(PROJECT_ROOT, artifactPath).replace(/\\/g, "/"),
            mimeType: outcome.mimeType || "image/png",
            bytes: outcome.imageBuffer.length,
            sha256: crypto.createHash("sha256").update(outcome.imageBuffer).digest("hex"),
          },
        ];
      }
    } catch (error) {
      errors = [safeProviderError(error)];
    }

    const latencyMs = simulated ? null : Date.now() - started;
    let cost = null;
    let costStatus = simulated ? "simulated_not_applicable" : "not_configured";
    if (!simulated && errors.length === 0) {
      if (outcome && Number.isFinite(outcome.estimatedCostUsd)) {
        cost = outcome.estimatedCostUsd;
        costStatus = "provider_reported";
      } else if (pricePerImage !== null) {
        cost = pricePerImage;
        costStatus = "configured_estimate";
      }
    }

    results.push({
      caseDef,
      reportCase: buildReportCase(caseDef, {
        prompt,
        outcome,
        artifacts,
        latencyMs,
        cost,
        costStatus,
        errors,
        simulated,
      }),
    });
  }

  const finishedAt = new Date().toISOString();
  const report = buildReport({
    meta: fetched.meta,
    results,
    run: {
      id: runId,
      mode,
      simulated,
      provider: provider.id,
      providerLabel: provider.label,
      model,
      outputDirectory: relativeOutputPath(outputDirectory),
    },
    startedAt,
    finishedAt,
  });

  const written = await writeReport(report, outputDirectory);
  return {
    report,
    outputDirectory,
    jsonPath: written.jsonPath,
    markdownPath: written.markdownPath,
  };
}

module.exports = {
  DEFAULT_OUTPUT_ROOT,
  PilotRunError,
  assertRealRunAllowed,
  runPilot,
};
