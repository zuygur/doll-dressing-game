"use strict";

const crypto = require("node:crypto");
const { TextDecoder } = require("node:util");
const { ApiError, ERROR_CODES, toPublicError } = require("./errors");

const UTF8 = new TextDecoder("utf-8", { fatal: true });

function getHeader(req, name) {
  const headers = req && req.headers ? req.headers : {};
  const value = headers[String(name).toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return typeof value === "string" ? value : undefined;
}

function createRequestId() {
  return `req_${crypto.randomUUID()}`;
}

function assertMethod(req) {
  if (!req || req.method !== "POST") {
    throw new ApiError(
      405,
      ERROR_CODES.METHOD_NOT_ALLOWED,
      "Use POST for this endpoint.",
      undefined,
      { Allow: "POST" }
    );
  }
}

function assertJsonContentType(req) {
  const raw = getHeader(req, "content-type") || "";
  const mime = raw.split(";")[0].trim().toLowerCase();
  if (mime !== "application/json") {
    throw new ApiError(
      415,
      ERROR_CODES.UNSUPPORTED_MEDIA_TYPE,
      "Content-Type must be application/json."
    );
  }
}

function assertDeclaredBodySize(req, maxBytes) {
  const raw = getHeader(req, "content-length");
  if (raw === undefined) return;
  if (!/^\d+$/.test(raw)) {
    throw new ApiError(
      400,
      ERROR_CODES.INVALID_CONTENT_LENGTH,
      "Content-Length must be a non-negative integer."
    );
  }
  if (Number(raw) > maxBytes) {
    throw new ApiError(
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      `Request body must not exceed ${maxBytes} bytes.`
    );
  }
}

function ensureSize(size, maxBytes) {
  if (size > maxBytes) {
    throw new ApiError(
      413,
      ERROR_CODES.PAYLOAD_TOO_LARGE,
      `Request body must not exceed ${maxBytes} bytes.`
    );
  }
}

function decodeUtf8(buffer) {
  try {
    return UTF8.decode(buffer);
  } catch (_error) {
    throw new ApiError(
      400,
      ERROR_CODES.INVALID_ENCODING,
      "Request body must be valid UTF-8."
    );
  }
}

function parseJson(raw) {
  if (!raw || !raw.trim()) {
    throw new ApiError(400, ERROR_CODES.INVALID_JSON, "Request body must be valid JSON.");
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new ApiError(400, ERROR_CODES.INVALID_JSON, "Request body must be valid JSON.");
  }
}

async function readStream(req, maxBytes) {
  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      ensureSize(size, maxBytes);
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, ERROR_CODES.INVALID_JSON, "Could not read the request body.");
  }
  return Buffer.concat(chunks, size);
}

/**
 * Reads and parses JSON while enforcing the byte cap. Supports both the raw
 * Node stream used locally and Vercel's pre-parsed `req.body` helper.
 */
async function readJsonBody(req, maxBytes) {
  let preParsed;
  try {
    preParsed = req ? req.body : undefined;
  } catch (_error) {
    throw new ApiError(400, ERROR_CODES.INVALID_JSON, "Request body must be valid JSON.");
  }

  if (preParsed !== undefined) {
    if (Buffer.isBuffer(preParsed)) {
      ensureSize(preParsed.length, maxBytes);
      return parseJson(decodeUtf8(preParsed));
    }
    if (typeof preParsed === "string") {
      ensureSize(Buffer.byteLength(preParsed, "utf8"), maxBytes);
      return parseJson(preParsed);
    }
    let serialized;
    try {
      serialized = JSON.stringify(preParsed);
    } catch (_error) {
      throw new ApiError(400, ERROR_CODES.INVALID_JSON, "Request body must be valid JSON.");
    }
    ensureSize(Buffer.byteLength(serialized || "", "utf8"), maxBytes);
    return preParsed;
  }

  const buffer = await readStream(req, maxBytes);
  return parseJson(decodeUtf8(buffer));
}

function setStandardHeaders(res, requestId) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Request-Id", requestId);
}

function sendJson(res, status, payload, requestId, extraHeaders) {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.statusCode = status;
  setStandardHeaders(res, requestId);
  if (extraHeaders && typeof extraHeaders === "object") {
    for (const [key, value] of Object.entries(extraHeaders)) {
      if (value !== undefined) res.setHeader(key, value);
    }
  }
  res.end(JSON.stringify(payload));
}

function sendError(res, error, requestId) {
  const payload = toPublicError(error, requestId);
  const headers = error instanceof ApiError ? error.headers : undefined;
  sendJson(res, error instanceof ApiError ? error.status : 500, payload, requestId, headers);
}

module.exports = {
  assertDeclaredBodySize,
  assertJsonContentType,
  assertMethod,
  createRequestId,
  getHeader,
  readJsonBody,
  sendError,
  sendJson,
};
