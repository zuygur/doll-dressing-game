#!/usr/bin/env node
"use strict";

/**
 * Phase 2 provider pilot runner.
 *
 * Default invocation is a safe mock/dry-run:
 *   node phase2/pilot-runner.cjs
 *
 * It never calls a provider in mock mode. Real mode is gated by an explicit
 * provider, server-side keys, and PHASE2_PILOT_CONFIRM_COST=YES.
 */

const { runPilot } = require("../server/phase2/runner");

function usage() {
  console.log(`Phase 2 provider pilot runner

Usage:
  node phase2/pilot-runner.cjs [options]

Options:
  --mode=mock|real          Default: mock (no provider calls)
  --provider=mock|openai|replicate
                            Default: mock in mock mode; required in real mode
  --out=<directory>         Output directory for report.json/report.md
  --case=<case-id>          Run only the selected case; repeatable
  --help                    Show this help

Safety:
  Mock mode never calls a provider and never produces an image.
  Real mode requires PHASE2_PILOT_CONFIRM_COST=YES plus server-side keys.
`);
}

function parseArgs(argv) {
  const options = { caseIds: [] };
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
      continue;
    }
    if (arg.startsWith("--provider=")) {
      options.provider = arg.slice("--provider=".length);
      continue;
    }
    if (arg.startsWith("--out=")) {
      options.outDir = arg.slice("--out=".length);
      continue;
    }
    if (arg.startsWith("--case=")) {
      options.caseIds.push(arg.slice("--case=".length));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const mode = options.mode || "mock";
  const provider = options.provider || (mode === "mock" ? "mock" : "");
  if (!provider) {
    throw new Error("--provider is required in real mode.");
  }

  const result = await runPilot({
    mode,
    provider,
    outDir: options.outDir,
    caseIds: options.caseIds,
    env: process.env,
  });

  const report = result.report;
  console.log(
    `Pilot complete: mode=${report.run.mode} provider=${report.run.provider} ` +
      `cases=${report.summary.caseCount} simulated=${report.summary.simulated} ` +
      `generated=${report.summary.generated} failed=${report.summary.failed}`
  );
  if (report.run.simulated) {
    console.log("SIMULATED RUN: no provider was called and no image was produced.");
  }
  console.log(`Report JSON: ${result.jsonPath}`);
  console.log(`Report Markdown: ${result.markdownPath}`);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const code = error && error.code ? String(error.code) : "PILOT_FAILED";
  const message = error && error.message ? String(error.message) : "Pilot failed.";
  console.error(`[${code}] ${message}`);
  process.exitCode = 1;
});
