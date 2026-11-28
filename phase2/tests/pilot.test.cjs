"use strict";

const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  loadPilotCases,
} = require("../../server/phase2/cases");
const {
  buildPilotPrompt,
} = require("../../server/phase2/prompt-builder");
const {
  runPilot,
  assertRealRunAllowed,
} = require("../../server/phase2/runner");
const {
  getPilotProvider,
  listPilotProviders,
} = require("../../server/phase2/providers");

let tempRoot;

before(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "doll-phase2-"));
});

after(async () => {
  if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
});

function emptyEnv() {
  return {};
}

test("loads exactly 5 concept and 2 sketch cases within Upper/Lower scope", () => {
  const loaded = loadPilotCases();
  assert.equal(loaded.cases.length, 7);
  assert.equal(loaded.cases.filter((item) => item.type === "concept").length, 5);
  assert.equal(loaded.cases.filter((item) => item.type === "sketch").length, 2);
  for (const item of loaded.cases) {
    assert.ok(["upper", "lower"].includes(item.slot));
    assert.equal(item.category, "clothes");
    assert.ok(item.evaluationFocus.length > 0);
  }
  assert.deepEqual(
    loaded.cases.filter((item) => item.type === "concept").map((item) => item.id).sort(),
    [
      "future-fullbody-dress",
      "future-fullbody-gown",
      "future-lower-wide-leg-pants",
      "future-outerwear-coat",
      "future-upper-oversized",
    ].sort()
  );
});

test("builds deterministic garment-only prompts and adds sketch guidance", () => {
  const loaded = loadPilotCases();
  for (const item of loaded.cases) {
    const prompt = buildPilotPrompt(item);
    assert.match(prompt, /one single garment/i);
    assert.match(prompt, /no person/i);
    assert.match(prompt, /transparent/i);
    assert.match(prompt, /no background/i);
    assert.match(prompt, /not photorealism/i);
    if (item.type === "sketch") {
      assert.match(prompt, /attached image/i);
      assert.match(prompt, /preserve/i);
    }
  }
});

test("provider registry keeps Stability reserved and exposes adapters", () => {
  const providers = listPilotProviders();
  const byId = Object.fromEntries(providers.map((item) => [item.id, item]));
  assert.equal(byId.mock.implemented, true);
  assert.equal(byId.openai.implemented, true);
  assert.equal(byId.replicate.implemented, true);
  assert.equal(byId.stability.implemented, false);

  const openai = getPilotProvider("openai");
  const replicate = getPilotProvider("replicate");
  const stability = getPilotProvider("stability");
  assert.equal(openai.isConfigured({}), false);
  assert.equal(openai.isConfigured({ OPENAI_API_KEY: "x", OPENAI_IMAGE_MODEL: "m" }), true);
  assert.equal(replicate.isConfigured({}), false);
  assert.equal(replicate.isConfigured({ REPLICATE_API_TOKEN: "x", REPLICATE_MODEL: "owner/model" }), true);
  assert.equal(stability.isConfigured({ STABILITY_API_KEY: "x" }), false);
});

test("mock mode never calls fetch and never claims provider results", async () => {
  let fetchCalls = 0;
  const throwingFetch = async () => {
    fetchCalls += 1;
    throw new Error("external fetch must not be called in mock mode");
  };
  const outputDir = path.join(tempRoot, "mock-run");
  const result = await runPilot({
    mode: "mock",
    provider: "mock",
    outDir: outputDir,
    env: emptyEnv(),
    fetchImpl: throwingFetch,
  });

  assert.equal(fetchCalls, 0);
  assert.equal(result.report.run.simulated, true);
  assert.equal(result.report.run.realPilotExecuted, false);
  assert.equal(result.report.run.provider, "mock");
  assert.equal(result.report.summary.caseCount, 7);
  assert.equal(result.report.summary.simulated, 7);
  assert.equal(result.report.summary.generated, 0);
  assert.equal(result.report.summary.realProviderResults, 0);
  assert.equal(result.report.summary.totalEstimatedCostUsd, null);
  assert.equal(result.report.summary.costEstimateStatus, "simulated_not_applicable");

  for (const item of result.report.cases) {
    assert.equal(item.status, "simulated");
    assert.equal(item.simulated, true);
    assert.equal(item.latencyMs, null);
    assert.equal(item.estimatedCostUsd, null);
    assert.deepEqual(item.artifacts, []);
    assert.equal(item.automatedChecks.status, "not_run");
    for (const [key, metric] of Object.entries(item.evaluation)) {
      assert.equal(metric.score, null);
      if (key === "sketchFidelity" && item.type === "concept") {
        assert.equal(metric.status, "not_applicable");
      } else {
        assert.equal(metric.status, "simulated_not_evaluated");
      }
    }
  }

  const reportJson = JSON.parse(await fs.readFile(result.jsonPath, "utf8"));
  assert.equal(reportJson.mockNotice.includes("SIMULATED RUN"), true);
  const reportMarkdown = await fs.readFile(result.markdownPath, "utf8");
  assert.match(reportMarkdown, /SIMULATED RUN — NOT PROVIDER RESULTS/);
  assert.match(reportMarkdown, /Scores are intentionally `null`/);
  assert.ok(!reportMarkdown.includes("PASSED"));
  assert.ok(!reportMarkdown.includes("provider passed"));
});

test("report contains prompt hashes but not full case descriptions", async () => {
  const outputDir = path.join(tempRoot, "privacy-run");
  const result = await runPilot({ mode: "mock", provider: "mock", outDir: outputDir, env: {} });
  const raw = await fs.readFile(result.jsonPath, "utf8");
  const loaded = loadPilotCases();
  for (const item of loaded.cases) {
    assert.equal(raw.includes(item.concept.description), false);
  }
  for (const item of result.report.cases) {
    assert.match(item.promptSha256, /^[a-f0-9]{64}$/);
    assert.ok(item.promptLength > 0);
  }
});

test("mock mode refuses a real provider selection", async () => {
  await assert.rejects(
    () =>
      runPilot({
        mode: "mock",
        provider: "openai",
        outDir: path.join(tempRoot, "refused-mock"),
        env: {},
      }),
    (error) => error.code === "MOCK_MODE_REQUIRES_MOCK_PROVIDER"
  );
});

test("real mode is blocked without explicit cost confirmation and keys", async () => {
  let fetchCalls = 0;
  const throwingFetch = async () => {
    fetchCalls += 1;
    throw new Error("must not be called");
  };

  await assert.rejects(
    () =>
      runPilot({
        mode: "real",
        provider: "openai",
        outDir: path.join(tempRoot, "real-no-confirm"),
        env: { OPENAI_API_KEY: "x", OPENAI_IMAGE_MODEL: "m" },
        fetchImpl: throwingFetch,
      }),
    (error) => error.code === "REAL_PILOT_NOT_CONFIRMED"
  );
  assert.equal(fetchCalls, 0);

  await assert.rejects(
    () =>
      runPilot({
        mode: "real",
        provider: "openai",
        outDir: path.join(tempRoot, "real-no-key"),
        env: { PHASE2_PILOT_CONFIRM_COST: "YES" },
        fetchImpl: throwingFetch,
      }),
    (error) => error.code === "PROVIDER_NOT_CONFIGURED"
  );
  assert.equal(fetchCalls, 0);
});

test("real-mode guard requires confirmation, implementation, and configuration", () => {
  assert.throws(
    () => assertRealRunAllowed("openai", {}),
    (error) => error.code === "REAL_PILOT_NOT_CONFIRMED"
  );
  assert.throws(
    () => assertRealRunAllowed("stability", { PHASE2_PILOT_CONFIRM_COST: "YES" }),
    (error) => error.code === "PROVIDER_NOT_IMPLEMENTED"
  );
  assert.throws(
    () =>
      assertRealRunAllowed("openai", {
        PHASE2_PILOT_CONFIRM_COST: "YES",
      }),
    (error) => error.code === "PROVIDER_NOT_CONFIGURED"
  );
});

test("reserved Stability adapter never calls a provider", async () => {
  const stability = getPilotProvider("stability");
  await assert.rejects(
    () => stability.generate({ caseDef: {}, prompt: "", env: {}, fetchImpl: async () => { throw new Error("no"); } }),
    (error) => error.code === "PROVIDER_NOT_IMPLEMENTED"
  );
});

test("missing provider credentials fail before fetch", async () => {
  const openai = getPilotProvider("openai");
  const replicate = getPilotProvider("replicate");
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("must not be called");
  };
  await assert.rejects(
    () => openai.generate({ caseDef: { type: "concept" }, prompt: "one garment", env: {}, fetchImpl }),
    (error) => error.code === "PROVIDER_NOT_CONFIGURED"
  );
  await assert.rejects(
    () => replicate.generate({ caseDef: { type: "concept" }, prompt: "one garment", env: {}, fetchImpl }),
    (error) => error.code === "PROVIDER_NOT_CONFIGURED"
  );
  assert.equal(calls, 0);
});

test("case filtering returns only the requested case", async () => {
  const result = await runPilot({
    mode: "mock",
    provider: "mock",
    outDir: path.join(tempRoot, "filtered-run"),
    env: {},
    caseIds: ["future-fullbody-dress"],
  });
  assert.equal(result.report.cases.length, 1);
  assert.equal(result.report.cases[0].caseId, "future-fullbody-dress");
});
