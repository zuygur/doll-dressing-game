"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { PilotProviderError, assertFetch } = require("./base");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..", "..");
const FIXTURE_ROOT = path.resolve(PROJECT_ROOT, "phase2", "fixtures");

function resolveFixture(relativePath) {
  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  if (!resolved.startsWith(`${FIXTURE_ROOT}${path.sep}`)) {
    throw new PilotProviderError("INVALID_FIXTURE_PATH", "Sketch fixture is outside phase2/fixtures.");
  }
  return resolved;
}

async function sketchDataUrl(caseDef) {
  if (!caseDef.sketchFixture) {
    throw new PilotProviderError("MISSING_SKETCH", "Sketch case has no fixture path.");
  }
  const filePath = resolveFixture(caseDef.sketchFixture);
  let bytes;
  try {
    bytes = await fs.readFile(filePath);
  } catch (_error) {
    throw new PilotProviderError("MISSING_SKETCH", "Sketch fixture could not be read.");
  }
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function parseExtraInput(env) {
  if (!env.REPLICATE_INPUT_JSON) return {};
  try {
    const parsed = JSON.parse(env.REPLICATE_INPUT_JSON);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch (_error) {
    throw new PilotProviderError(
      "INVALID_PROVIDER_INPUT",
      "REPLICATE_INPUT_JSON must be a JSON object."
    );
  }
}

async function buildInput(caseDef, prompt, env) {
  const input = {
    prompt,
    num_outputs: 1,
    output_format: "png",
  };
  if (caseDef.type === "sketch") {
    const key = env.REPLICATE_SKETCH_INPUT_KEY || "image";
    input[key] = await sketchDataUrl(caseDef);
  }
  const extra = parseExtraInput(env);
  return { ...input, ...extra };
}

function pickOutputUrl(output) {
  const first = Array.isArray(output) ? output[0] : output;
  if (typeof first === "string" && first) return first;
  if (first && typeof first.url === "string" && first.url) return first.url;
  throw new PilotProviderError("EMPTY_PROVIDER_RESULT", "Replicate returned no image output.");
}

async function waitForPrediction(initial, headers, fetchImpl, env) {
  let prediction = initial;
  const attempts = Number.isInteger(Number(env.REPLICATE_POLL_ATTEMPTS))
    ? Math.max(0, Math.min(60, Number(env.REPLICATE_POLL_ATTEMPTS)))
    : 30;
  const interval = Number.isInteger(Number(env.REPLICATE_POLL_INTERVAL_MS))
    ? Math.max(250, Math.min(10000, Number(env.REPLICATE_POLL_INTERVAL_MS)))
    : 1000;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (!prediction || !prediction.urls || !prediction.urls.get) return prediction;
    if (["succeeded", "failed", "canceled"].includes(prediction.status)) return prediction;
    await new Promise((resolve) => setTimeout(resolve, interval));
    const response = await fetchImpl(prediction.urls.get, { headers });
    if (!response.ok) {
      throw new PilotProviderError(
        "PROVIDER_POLL_FAILED",
        `Replicate polling failed with HTTP ${response.status}.`,
        { httpStatus: response.status }
      );
    }
    prediction = await response.json();
  }
  return prediction;
}

/**
 * Replicate adapter, prepared but never invoked by mock mode.
 *
 * Required real-pilot environment:
 *   REPLICATE_API_TOKEN
 *   REPLICATE_MODEL (owner/name) OR REPLICATE_VERSION
 * Optional input-mapping controls:
 *   REPLICATE_SKETCH_INPUT_KEY (default "image")
 *   REPLICATE_INPUT_JSON (JSON object merged into the model input)
 *
 * Replicate model inputs differ. Review the chosen model's schema before the
 * real pilot; this adapter intentionally does not hardcode a model or version.
 */
module.exports = Object.freeze({
  id: "replicate",
  label: "Replicate",
  implemented: true,
  requiresConfirmation: true,
  isConfigured(env) {
    return Boolean(
      env &&
        env.REPLICATE_API_TOKEN &&
        (env.REPLICATE_MODEL || env.REPLICATE_VERSION)
    );
  },
  getModel(env) {
    return (env && (env.REPLICATE_MODEL || env.REPLICATE_VERSION)) || null;
  },
  async generate({ caseDef, prompt, env, fetchImpl }) {
    assertFetch(fetchImpl);
    if (!env || !env.REPLICATE_API_TOKEN) {
      throw new PilotProviderError("PROVIDER_NOT_CONFIGURED", "REPLICATE_API_TOKEN is not set.");
    }
    if (!env.REPLICATE_MODEL && !env.REPLICATE_VERSION) {
      throw new PilotProviderError(
        "PROVIDER_NOT_CONFIGURED",
        "REPLICATE_MODEL or REPLICATE_VERSION is not set."
      );
    }

    const input = await buildInput(caseDef, prompt, env);
    const headers = {
      Authorization: `Token ${env.REPLICATE_API_TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    };

    let endpoint;
    let body;
    if (env.REPLICATE_MODEL) {
      endpoint = `https://api.replicate.com/v1/models/${env.REPLICATE_MODEL}/predictions`;
      body = { input };
    } else {
      endpoint = "https://api.replicate.com/v1/predictions";
      body = { version: env.REPLICATE_VERSION, input };
    }

    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    let json = null;
    try {
      json = await response.json();
    } catch (_error) {
      json = null;
    }

    if (!response.ok) {
      throw new PilotProviderError(
        "PROVIDER_HTTP_ERROR",
        `Replicate returned HTTP ${response.status}.`,
        { httpStatus: response.status }
      );
    }

    json = await waitForPrediction(json, headers, fetchImpl, env);
    if (!json || json.status !== "succeeded") {
      throw new PilotProviderError(
        "PROVIDER_FAILED",
        "Replicate prediction did not succeed.",
        { providerStatus: json && json.status ? String(json.status) : "unknown" }
      );
    }

    const outputUrl = pickOutputUrl(json.output);
    const imageResponse = await fetchImpl(outputUrl);
    if (!imageResponse.ok) {
      throw new PilotProviderError(
        "PROVIDER_IMAGE_DOWNLOAD_FAILED",
        `Image download failed with HTTP ${imageResponse.status}.`,
        { httpStatus: imageResponse.status }
      );
    }
    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    return {
      simulated: false,
      provider: "replicate",
      model: env.REPLICATE_MODEL || env.REPLICATE_VERSION,
      imageBuffer,
      mimeType: imageResponse.headers.get("content-type") || "image/png",
      providerRequestId: json.id || null,
      latencyMs: null,
      estimatedCostUsd: null,
      costEstimateStatus: "not_configured",
      notes: [
        "Verify the chosen model's input mapping and output transparency; Replicate models are not uniform.",
      ],
    };
  },
});
