"use strict";

/**
 * Development-only HTTP wrapper for the Vercel function.
 *
 * Usage (from the repository root):
 *   PHASE1_GENERATION_ENABLED=true PHASE1_DRY_RUN=true \
 *   PHASE1_BETA_GATE_ENABLED=true PHASE1_BETA_TOKEN="..." \
 *   node phase1/local-server.cjs
 *
 * This is not imported by the game and is not required in Vercel.
 */

const http = require("node:http");
const handler = require("../api/generate.js");

const port = Number(process.env.PORT || 3001);

function sendNotFound(res) {
  res.statusCode = 404;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(
    JSON.stringify({
      ok: false,
      error: { code: "NOT_FOUND", message: "Only POST /api/generate is available." },
    })
  );
}

const server = http.createServer((req, res) => {
  let pathname = "/";
  try {
    pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch (_error) {
    pathname = "/";
  }

  if (pathname !== "/api/generate") {
    sendNotFound(res);
    return;
  }

  Promise.resolve(handler(req, res)).catch((error) => {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.end(
      JSON.stringify({
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected server error occurred.",
        },
      })
    );
    console.error("Unhandled local server error:", error && error.name);
  });
});

server.listen(port, () => {
  console.log(`Phase 1 local API listening on http://localhost:${port}/api/generate`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
