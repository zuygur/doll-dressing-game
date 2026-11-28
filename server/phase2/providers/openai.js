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

async function readSketch(caseDef) {
  if (!caseDef.sketchFixture) {
    throw new PilotProviderError("MISSING_SKETCH", "Sketch case has no fixture path.");
  }
  const filePath = resolveFixture(caseDef.sketchFixture);
  try {
    const bytes = await fs.readFile(filePath);
    return {
      bytes,
      filename: path.basename(filePath),
    };
  } catch (_error) {
    throw new PilotProviderError("MISSING_SKETCH", "Sketch fixture could not be read.");
  }
}

function parseImageResponse(json) {
  const item = json && Array.isArray(json.data) ? json.data[0] : null;
  if (!item) {
    throw new PilotProviderError("EMPTY_PROVIDER_RESULT", "The provider returned no image.");
  }
  if (typeof item.b64_json === "string" && item.b64_json) {
    return {
      imageBuffer: Buffer.from(item.b64_json, "base64"),
      mimeType: "image/png",
    };
  }
  if (typeof item.url === "string" && item.url) {
    return { imageUrl: item.url, mimeType: "image/png" };
  }
  throw new PilotProviderError("EMPTY_PROVIDER_RESULT", "The provider returned no usable image.");
}

async function downloadImage(url, fetchImpl) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new PilotProviderError(
      "PROVIDER_IMAGE_DOWNLOAD_FAILED",
      `Image download failed with HTTP ${response.status}.`,
      { httpStatus: response.status }
    );
  }
  return {
    imageBuffer: Buffer.from(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "image/png",
  };
}

/**
 * OpenAI adapter, prepared but never invoked by mock mode.
 *
 * Required real-pilot environment:
 *   OPENAI_API_KEY
 *   OPENAI_IMAGE_MODEL
 * Optional:
 *   OPENAI_IMAGE_SIZE (default 1024x1024)
 *   OPENAI_IMAGE_QUALITY
 *
 * Concept cases use /v1/images/generations; sketch cases use /v1/images/edits
 * with a transparent PNG output request. Model/input details may need review
 * against the selected model's current API before the real pilot.
 */
module.exports = Object.freeze({
  id: "openai",
  label: "OpenAI Images",
  implemented: true,
  requiresConfirmation: true,
  isConfigured(env) {
    return Boolean(env && env.OPENAI_API_KEY && env.OPENAI_IMAGE_MODEL);
  },
  getModel(env) {
    return (env && env.OPENAI_IMAGE_MODEL) || null;
  },
  async generate({ caseDef, prompt, env, fetchImpl }) {
    assertFetch(fetchImpl);
    if (!env || !env.OPENAI_API_KEY) {
      throw new PilotProviderError("PROVIDER_NOT_CONFIGURED", "OPENAI_API_KEY is not set.");
    }
    if (!env.OPENAI_IMAGE_MODEL) {
      throw new PilotProviderError("PROVIDER_NOT_CONFIGURED", "OPENAI_IMAGE_MODEL is not set.");
    }

    const baseUrl = "https://api.openai.com/v1";
    const size = env.OPENAI_IMAGE_SIZE || "1024x1024";
    const quality = env.OPENAI_IMAGE_QUALITY || "";
    let response;

    if (caseDef.type === "sketch") {
      const sketch = await readSketch(caseDef);
      const form = new FormData();
      form.append("model", env.OPENAI_IMAGE_MODEL);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("background", "transparent");
      form.append("output_format", "png");
      form.append("n", "1");
      if (quality) form.append("quality", quality);
      form.append(
        "image[]",
        new Blob([sketch.bytes], { type: "image/png" }),
        sketch.filename
      );

      response = await fetchImpl(`${baseUrl}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
        body: form,
      });
    } else {
      const body = {
        model: env.OPENAI_IMAGE_MODEL,
        prompt,
        size,
        background: "transparent",
        output_format: "png",
        n: 1,
      };
      if (quality) body.quality = quality;

      response = await fetchImpl(`${baseUrl}/images/generations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }

    let json = null;
    try {
      json = await response.json();
    } catch (_error) {
      json = null;
    }

    if (!response.ok) {
      throw new PilotProviderError(
        "PROVIDER_HTTP_ERROR",
        `OpenAI returned HTTP ${response.status}.`,
        { httpStatus: response.status }
      );
    }

    const parsed = parseImageResponse(json);
    let imageBuffer = parsed.imageBuffer;
    let mimeType = parsed.mimeType;
    if (!imageBuffer && parsed.imageUrl) {
      const downloaded = await downloadImage(parsed.imageUrl, fetchImpl);
      imageBuffer = downloaded.imageBuffer;
      mimeType = downloaded.mimeType;
    }

    return {
      simulated: false,
      provider: "openai",
      model: env.OPENAI_IMAGE_MODEL,
      imageBuffer,
      mimeType,
      providerRequestId: response.headers.get("x-request-id") || null,
      latencyMs: null,
      estimatedCostUsd: null,
      costEstimateStatus: "not_configured",
      notes: [],
    };
  },
});
