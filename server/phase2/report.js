"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const RUBRIC = Object.freeze({
  garmentOnlyCompliance: {
    label: "Garment-only output compliance",
    description:
      "Exactly one garment; no person, body, mannequin, hanger, background, text, or extra outfit pieces. Full garment visible.",
  },
  transparencyAndEdgeCleanliness: {
    label: "Transparent PNG quality and edge cleanliness",
    description:
      "Valid PNG with real alpha; transparent corners/background; clean silhouette edges; minimal halo, fringe, cutout holes, or accidental semi-transparent noise.",
  },
  styleConsistency: {
    label: "Flat 2D / chibi art-style consistency",
    description:
      "Flat 2D chibi fashion look, crisp outlines, soft cel shading, simple readable shapes; not photorealistic, not 3D, not a different art style.",
  },
  sketchFidelity: {
    label: "Sketch fidelity and important details",
    description:
      "For sketch cases only: preservation of the sketch silhouette, neckline, waistline, sleeve length, hem, leg width, and distinctive construction details.",
  },
  silhouetteAndShape: {
    label: "Garment silhouette and shape",
    description:
      "Readable, consistent silhouette; proportions match the requested garment; no melted, merged, or ambiguous garment parts.",
  },
  fittingSuitability: {
    label: "Suitability for later girl/boy fitting",
    description:
      "Centered with margin; front-facing; separable sleeves/legs/hems; no body occlusion; plausible affine fit to the Phase 0 draft profiles. Fitting itself is not implemented in Phase 2.",
  },
});

function metric(status, notes) {
  return {
    status,
    score: null,
    scale: "0-4",
    notes: notes || "",
  };
}

function evaluationFor(caseDef, simulated, failed) {
  if (failed) {
    return {
      garmentOnlyCompliance: metric("not_evaluated", "Generation failed."),
      transparencyAndEdgeCleanliness: metric("not_evaluated", "Generation failed."),
      styleConsistency: metric("not_evaluated", "Generation failed."),
      sketchFidelity:
        caseDef.type === "sketch"
          ? metric("not_evaluated", "Generation failed.")
          : metric("not_applicable", "Concept case has no sketch input."),
      silhouetteAndShape: metric("not_evaluated", "Generation failed."),
      fittingSuitability: metric("not_evaluated", "Generation failed."),
    };
  }

  if (simulated) {
    const note =
      "Mock run: no image was produced and no provider was called. No quality score is claimed.";
    return {
      garmentOnlyCompliance: metric("simulated_not_evaluated", note),
      transparencyAndEdgeCleanliness: metric("simulated_not_evaluated", note),
      styleConsistency: metric("simulated_not_evaluated", note),
      sketchFidelity:
        caseDef.type === "sketch"
          ? metric("simulated_not_evaluated", note)
          : metric("not_applicable", "Concept case has no sketch input."),
      silhouetteAndShape: metric("simulated_not_evaluated", note),
      fittingSuitability: metric("simulated_not_evaluated", note),
    };
  }

  return {
    garmentOnlyCompliance: metric("pending_human_review"),
    transparencyAndEdgeCleanliness: metric("pending_human_review"),
    styleConsistency: metric("pending_human_review"),
    sketchFidelity:
      caseDef.type === "sketch"
        ? metric("pending_human_review")
        : metric("not_applicable", "Concept case has no sketch input."),
    silhouetteAndShape: metric("pending_human_review"),
    fittingSuitability: metric("pending_human_review"),
  };
}

function automatedChecksFor(simulated) {
  return {
    status: "not_run",
    reason: simulated
      ? "Mock run: there are no generated artifacts to analyze."
      : "Run phase2/analyze_outputs.py after generation to add PNG/alpha metrics.",
    dimensions: null,
    alphaBBox: null,
    alphaCoveragePct: null,
    semiTransparentRatioPct: null,
    transparentCorners: null,
    edgeCleanliness: null,
  };
}

function buildReport({ meta, results, run, startedAt, finishedAt }) {
  const cases = results.map((item) => item.reportCase);
  const pricedCases = cases.filter(
    (item) => Number.isFinite(item.estimatedCostUsd) && item.estimatedCostUsd >= 0
  );
  const totalEstimatedCostUsd = run.simulated || pricedCases.length === 0
    ? null
    : pricedCases.reduce((sum, item) => sum + item.estimatedCostUsd, 0);
  const costEstimateStatus = run.simulated
    ? "simulated_not_applicable"
    : pricedCases.length === 0
      ? "not_configured"
      : pricedCases.length === cases.length
        ? "configured_estimate"
        : "partial_configured_estimate";

  const summary = {
    caseCount: cases.length,
    simulated: cases.filter((item) => item.status === "simulated").length,
    generated: cases.filter((item) => item.status === "generated").length,
    failed: cases.filter((item) => item.status === "failed").length,
    realProviderResults: cases.filter((item) => item.status === "generated").length,
    totalEstimatedCostUsd,
    costEstimateStatus,
  };

  return {
    schemaVersion: 1,
    kind: "phase2-provider-pilot-evaluation-report",
    generatedAt: new Date().toISOString(),
    run: {
      id: run.id,
      mode: run.mode,
      simulated: run.simulated,
      realPilotExecuted: !run.simulated,
      provider: run.provider,
      providerLabel: run.providerLabel,
      model: run.model,
      startedAt,
      finishedAt,
      outputDirectory: run.outputDirectory,
    },
    mockNotice: run.simulated
      ? "SIMULATED RUN: no external provider was called, no image was generated, and no provider quality score is claimed."
      : null,
    scope: meta.scope || null,
    caseSelection: meta.caseSelection || null,
    rubric: RUBRIC,
    cases,
    summary,
    notes: run.simulated
      ? [
          "Every case is simulated. Do not treat this report as provider evidence.",
          "Real-pilot commands and required environment variables are in phase2/README.md.",
        ]
      : [
          "Images were generated by the selected real provider. Quality scores are still pending human review.",
          "Run phase2/analyze_outputs.py to add automated PNG/alpha measurements.",
        ],
  };
}

function markdownEscape(value) {
  return String(value === undefined || value === null ? "" : value).replace(/\|/g, "\\|");
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Phase 2 Provider Pilot Evaluation");
  lines.push("");
  if (report.run.simulated) {
    lines.push(
      "> **SIMULATED RUN — NOT PROVIDER RESULTS.** No external API was called, no image was produced, and no quality score is claimed."
    );
    lines.push("");
  }
  lines.push(`- Run ID: \`${report.run.id}\``);
  lines.push(`- Mode: \`${report.run.mode}\``);
  lines.push(`- Provider: \`${report.run.provider}\` (${report.run.providerLabel})`);
  lines.push(`- Model: \`${report.run.model || "not configured"}\``);
  lines.push(`- Started: ${report.run.startedAt}`);
  lines.push(`- Finished: ${report.run.finishedAt}`);
  lines.push(`- Output directory: \`${report.run.outputDirectory}\``);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Cases | Simulated | Generated | Failed | Real provider results |");
  lines.push("|---:|---:|---:|---:|---:|");
  lines.push(
    `| ${report.summary.caseCount} | ${report.summary.simulated} | ${report.summary.generated} | ${report.summary.failed} | ${report.summary.realProviderResults} |`
  );
  lines.push("");
  lines.push(`- Cost estimate status: \`${report.summary.costEstimateStatus}\``);
  lines.push(`- Total estimated cost: ${report.summary.totalEstimatedCostUsd === null ? "not configured" : `$${report.summary.totalEstimatedCostUsd}`}`);
  lines.push("");
  lines.push("## Case Results");
  lines.push("");
  lines.push("| Case | Type | Slot/Kind | Status | Latency | Est. cost | Artifacts |");
  lines.push("|---|---|---|---|---:|---:|---|");
  for (const item of report.cases) {
    const latency = item.latencyMs === null ? "not measured" : `${item.latencyMs} ms`;
    const cost =
      item.estimatedCostUsd === null ? "not configured" : `$${item.estimatedCostUsd}`;
    const artifacts = item.artifacts.length ? item.artifacts.map((a) => `\`${a.path}\``).join("<br>") : "none";
    lines.push(
      `| ${markdownEscape(item.caseId)} | ${markdownEscape(item.type)} | ${markdownEscape(
        `${item.garment.slot}/${item.garment.garmentKind}`
      )} | ${markdownEscape(item.status)} | ${latency} | ${cost} | ${artifacts} |`
    );
  }
  lines.push("");
  lines.push("## Evaluation Rubric");
  lines.push("");
  lines.push("Scores are intentionally `null` in this report unless a human reviewer fills them. Mock mode never assigns scores.");
  lines.push("");
  lines.push("| Criterion | Scale | Description |");
  lines.push("|---|---:|---|");
  for (const [key, item] of Object.entries(report.rubric)) {
    lines.push(`| ${markdownEscape(item.label)} | 0–4 | ${markdownEscape(item.description)} |`);
  }
  lines.push("");
  lines.push("## Per-Case Evaluation Status");
  lines.push("");
  for (const item of report.cases) {
    lines.push(`### ${item.caseId}`);
    lines.push("");
    lines.push(`- Type: \`${item.type}\`; garment: \`${item.garment.slot}/${item.garment.garmentKind}/${item.garment.subtype}\`; coversLower: \`${item.garment.coversLower}\``);
    lines.push(`- Status: \`${item.status}\`; simulated: \`${item.simulated}\``);
    lines.push(`- Prompt: ${item.promptLength} characters; SHA-256: \`${item.promptSha256}\``);
    if (item.sketchFixture) {
      lines.push(`- Sketch fixture: \`${item.sketchFixture}\` (${item.fixtureOrigin || "unknown origin"})`);
    }
    if (item.errors.length) {
      lines.push(`- Errors: ${item.errors.map((e) => `${e.code}: ${e.message}`).join("; ")}`);
    }
    for (const [key, value] of Object.entries(item.evaluation)) {
      lines.push(
        `- ${report.rubric[key] ? report.rubric[key].label : key}: \`${value.status}\`, score \`${value.score}\`${value.notes ? ` — ${value.notes}` : ""}`
      );
    }
    lines.push("");
  }
  lines.push("## Notes");
  lines.push("");
  for (const note of report.notes) lines.push(`- ${note}`);
  lines.push("");
  return lines.join("\n");
}

async function writeReport(report, outputDir) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, "report.json");
  const markdownPath = path.join(outputDir, "report.md");
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, renderMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

module.exports = {
  RUBRIC,
  automatedChecksFor,
  buildReport,
  evaluationFor,
  renderMarkdown,
  writeReport,
};
