"use strict";

const LEVELS = Object.freeze({
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
});

const SENSITIVE_KEYS = new Set([
  "authorization",
  "body",
  "cookie",
  "prompt",
  "refinementinstructions",
  "secret",
  "set-cookie",
  "sketchref",
  "token",
]);

function sanitizeValue(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 297)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (depth >= 2) return "[object]";
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeValue(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(String(key).toLowerCase())) {
        out[key] = "[redacted]";
      } else {
        out[key] = sanitizeValue(item, depth + 1);
      }
    }
    return out;
  }
  return "[unsupported]";
}

/**
 * Minimal structured logger. Callers pass only safe metadata; the denylist is
 * a second line of defence for accidental prompt/secret logging.
 */
function createLogger(config, sink = console) {
  const threshold = LEVELS[config && config.logLevel] ?? LEVELS.info;

  function write(level, event, fields) {
    if ((LEVELS[level] ?? LEVELS.info) > threshold) return;
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...sanitizeValue(fields || {}),
    };
    try {
      if (sink && typeof sink.log === "function") {
        sink.log(JSON.stringify(record));
      }
    } catch (_error) {
      // Logging must never break the API response.
    }
  }

  return {
    error: (event, fields) => write("error", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    info: (event, fields) => write("info", event, fields),
    debug: (event, fields) => write("debug", event, fields),
  };
}

module.exports = {
  createLogger,
  LEVELS,
};
