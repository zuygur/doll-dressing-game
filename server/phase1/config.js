"use strict";

const PROVIDER_IDS = Object.freeze(["none", "openai", "replicate", "stability"]);
const LOG_LEVELS = Object.freeze(["silent", "error", "warn", "info", "debug"]);
const BETA_TOKEN_MIN_LENGTH = 32;

function readBoolean(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function readInteger(env, name, fallback, min, max) {
  const raw = env[name];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    return fallback;
  }
  return value;
}

function readProvider(env, configErrors) {
  const raw = String(env.PHASE1_PROVIDER || "none").trim().toLowerCase();
  if (!raw) return "none";
  if (!PROVIDER_IDS.includes(raw)) {
    configErrors.push({
      path: "PHASE1_PROVIDER",
      message: "Unsupported provider id. Use none, openai, replicate, or stability.",
    });
    return "none";
  }
  return raw;
}

function readLogLevel(env) {
  const raw = String(env.PHASE1_LOG_LEVEL || "info").trim().toLowerCase();
  return LOG_LEVELS.includes(raw) ? raw : "info";
}

/**
 * Reads environment configuration per request. Nothing here is ever returned
 * to a client. Provider keys are deliberately not read into this object; the
 * provider adapters check their own server-side environment variables.
 */
function loadConfig(env = process.env) {
  const configErrors = [];
  const provider = readProvider(env, configErrors);
  const betaGateEnabled = readBoolean(env, "PHASE1_BETA_GATE_ENABLED", false);
  const betaToken = String(env.PHASE1_BETA_TOKEN || "").trim();

  return Object.freeze({
    generationEnabled: readBoolean(env, "PHASE1_GENERATION_ENABLED", false),
    dryRun: readBoolean(env, "PHASE1_DRY_RUN", true),
    betaGateEnabled,
    betaToken,
    betaTokenMinLength: BETA_TOKEN_MIN_LENGTH,
    provider,
    maxBodyBytes: readInteger(env, "PHASE1_MAX_BODY_BYTES", 64 * 1024, 1024, 1024 * 1024),
    jobTtlSeconds: readInteger(env, "PHASE1_JOB_TTL_SECONDS", 3600, 60, 86400),
    logLevel: readLogLevel(env),
    isProduction: String(env.VERCEL_ENV || "").trim().toLowerCase() === "production",
    configErrors: Object.freeze(configErrors.map((item) => Object.freeze({ ...item }))),
  });
}

module.exports = {
  BETA_TOKEN_MIN_LENGTH,
  LOG_LEVELS,
  PROVIDER_IDS,
  loadConfig,
};
