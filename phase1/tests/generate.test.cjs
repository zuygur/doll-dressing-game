"use strict";

const { afterEach, beforeEach, test } = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const handler = require("../../api/generate.js");

const TOKEN = "test-beta-token-0123456789abcdef";
const MANAGED_ENV = [
  "PHASE1_BETA_GATE_ENABLED",
  "PHASE1_BETA_TOKEN",
  "PHASE1_DRY_RUN",
  "PHASE1_GENERATION_ENABLED",
  "PHASE1_JOB_TTL_SECONDS",
  "PHASE1_LOG_LEVEL",
  "PHASE1_MAX_BODY_BYTES",
  "PHASE1_PROVIDER",
  "VERCEL_ENV",
  "OPENAI_API_KEY",
  "REPLICATE_API_TOKEN",
  "STABILITY_API_KEY",
];

const GENERATE_ENV = {
  PHASE1_GENERATION_ENABLED: "true",
  PHASE1_DRY_RUN: "true",
  PHASE1_PROVIDER: "none",
};

const GATE_ENV = {
  PHASE1_BETA_GATE_ENABLED: "true",
  PHASE1_BETA_TOKEN: TOKEN,
};

function setEnv(overrides) {
  for (const key of MANAGED_ENV) delete process.env[key];
  Object.assign(process.env, { PHASE1_LOG_LEVEL: "silent" }, overrides || {});
}

function makeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    headersSent: false,
    finished: false,
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = String(value);
    },
    getHeader(name) {
      return this.headers[String(name).toLowerCase()];
    },
    end(chunk) {
      if (chunk !== undefined && chunk !== null) {
        this.body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
      }
      this.headersSent = true;
      this.finished = true;
    },
  };
}

function basePayload() {
  return {
    version: 1,
    source: {
      kind: "ai-concept",
      prompt: "A red midi dress with long sleeves",
      conceptId: "concept_1",
      refinementInstructions: ["Make the hem longer"],
    },
    garment: {
      slot: "upper",
      garmentKind: "dress",
    },
    concept: {
      title: "Red Midi Dress",
      colors: ["red"],
      silhouette: "A-line",
      neckline: "V-neck",
      sleeves: "long",
      length: "midi",
      decorations: "none",
      style: "elegant",
    },
    options: {
      previewGenders: ["girl", "boy"],
    },
  };
}

async function invoke(options) {
  const opts = options || {};
  setEnv({ PHASE1_LOG_LEVEL: "silent", ...(opts.env || {}) });

  const headers = { ...(opts.headers || {}) };
  let requestBody = null;
  let req;

  if (opts.preParsed) {
    req = Readable.from([]);
    req.body = opts.payload;
    requestBody = JSON.stringify(opts.payload);
  } else if (opts.rawBody !== undefined) {
    requestBody = opts.rawBody;
    req = Readable.from([Buffer.from(requestBody)]);
  } else {
    requestBody = opts.payload === undefined ? "" : JSON.stringify(opts.payload);
    req = Readable.from(requestBody ? [Buffer.from(requestBody)] : []);
  }

  if (!opts.omitContentLength) {
    const length = Buffer.byteLength(requestBody || "", "utf8");
    if (headers["content-length"] === undefined) {
      headers["content-length"] = String(length);
    }
  }

  req.method = opts.method || "POST";
  req.url = "/api/generate";
  req.headers = {
    "content-type": "application/json",
    ...headers,
  };

  const res = makeRes();
  await handler(req, res);

  let json = null;
  try {
    json = JSON.parse(res.body);
  } catch (_error) {
    json = null;
  }

  return {
    status: res.statusCode,
    headers: res.headers,
    json,
    raw: res.body,
  };
}

beforeEach(() => setEnv({}));
afterEach(() => setEnv({}));

test("rejects non-POST methods with Allow: POST", async () => {
  const result = await invoke({ method: "GET", env: GENERATE_ENV });
  assert.equal(result.status, 405);
  assert.equal(result.headers.allow, "POST");
  assert.equal(result.json.error.code, "METHOD_NOT_ALLOWED");
});

test("rejects non-JSON content type", async () => {
  const result = await invoke({
    payload: basePayload(),
    headers: { "content-type": "text/plain" },
    env: GENERATE_ENV,
  });
  assert.equal(result.status, 415);
  assert.equal(result.json.error.code, "UNSUPPORTED_MEDIA_TYPE");
});

test("rejects malformed JSON without echoing the body", async () => {
  const result = await invoke({ rawBody: '{"version":1,', env: GENERATE_ENV });
  assert.equal(result.status, 400);
  assert.equal(result.json.error.code, "INVALID_JSON");
  assert.ok(!result.raw.includes('"version"'));
});

test("beta gate denies missing and wrong tokens with the same response", async () => {
  const missing = await invoke({ payload: basePayload(), env: { ...GENERATE_ENV, ...GATE_ENV } });
  const wrong = await invoke({
    payload: basePayload(),
    headers: { "x-beta-access-token": "wrong-token" },
    env: { ...GENERATE_ENV, ...GATE_ENV },
  });

  assert.equal(missing.status, 401);
  assert.equal(wrong.status, 401);
  assert.equal(missing.json.error.code, "BETA_ACCESS_DENIED");
  assert.equal(wrong.json.error.code, "BETA_ACCESS_DENIED");
  assert.equal(missing.json.error.message, wrong.json.error.message);
  assert.equal(missing.headers["www-authenticate"], 'Bearer realm="doll-phase1"');
});

test("beta gate accepts x-beta-access-token and Authorization bearer", async () => {
  const header = await invoke({
    payload: basePayload(),
    headers: { "x-beta-access-token": TOKEN },
    env: { ...GENERATE_ENV, ...GATE_ENV },
  });
  const bearer = await invoke({
    payload: basePayload(),
    headers: { authorization: `Bearer ${TOKEN}` },
    env: { ...GENERATE_ENV, ...GATE_ENV },
  });

  assert.equal(header.status, 202);
  assert.equal(bearer.status, 202);
});

test("enabled beta gate fails closed with a short token", async () => {
  const result = await invoke({
    payload: basePayload(),
    headers: { "x-beta-access-token": "short" },
    env: {
      ...GENERATE_ENV,
      PHASE1_BETA_GATE_ENABLED: "true",
      PHASE1_BETA_TOKEN: "short",
    },
  });
  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "BETA_GATE_NOT_CONFIGURED");
});

test("generation is disabled by default", async () => {
  const result = await invoke({ payload: basePayload() });
  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "GENERATION_DISABLED");
  assert.ok(!result.raw.includes(basePayload().source.prompt));
});

test("production requires the beta gate before generation", async () => {
  const result = await invoke({
    payload: basePayload(),
    env: {
      ...GENERATE_ENV,
      VERCEL_ENV: "production",
    },
  });
  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "BETA_GATE_REQUIRED");
});

test("valid dry-run request returns a Phase 0 compatible queued job", async () => {
  const payload = basePayload();
  const result = await invoke({
    payload,
    headers: { "x-beta-access-token": TOKEN },
    env: { ...GENERATE_ENV, ...GATE_ENV },
  });

  assert.equal(result.status, 202);
  assert.equal(result.json.ok, true);
  assert.match(result.json.requestId, /^req_/);
  assert.match(result.json.job.jobId, /^job_/);
  assert.equal(result.json.job.status, "queued");
  assert.equal(result.json.job.provider, "unknown");
  assert.equal(result.json.job.slot, "upper");
  assert.equal(result.json.job.profileSlot, "fullbody");
  assert.equal(result.json.job.subtype, "dress");
  assert.equal(result.json.job.garmentKind, "dress");
  assert.equal(result.json.job.coversLower, true);
  assert.equal(result.json.job.fitProfileVersion, "0.1.0");
  assert.equal(result.json.job.fitProfileStatus, "draft-needs-visual-signoff");
  assert.equal(result.json.job.dryRun, true);
  assert.deepEqual(result.json.job.planned.genderVariants, ["girl", "boy"]);
  assert.equal(result.json.job.planned.fitting, false);
  assert.equal(result.json.job.planned.wardrobeRegistration, false);
  assert.equal(result.json.job.inputSummary.promptLength, payload.source.prompt.length);
  assert.equal(result.json.job.inputSummary.refinementCount, 1);
  assert.equal(result.json.job.inputSummary.hasSketch, false);
  assert.ok(!("master" in result.json.job));
  assert.ok(!("preview" in result.json.job));
  assert.ok(!("variants" in result.json.job));
  assert.ok(!result.raw.includes(payload.source.prompt));
  assert.ok(!result.raw.includes("Red Midi Dress"));
  assert.equal(result.headers["cache-control"], "no-store, max-age=0");
  assert.equal(result.headers["x-content-type-options"], "nosniff");
  assert.equal(result.headers["x-request-id"], result.json.requestId);
  assert.equal(result.headers["access-control-allow-origin"], undefined);
});

test("draw requests need a designId or sketchRef", async () => {
  const missing = basePayload();
  missing.source = { kind: "draw", prompt: "" };
  const result = await invoke({ payload: missing, env: GENERATE_ENV });
  assert.equal(result.status, 422);
  assert.equal(result.json.error.code, "VALIDATION_FAILED");
  assert.ok(result.json.error.details.some((item) => item.path === "source"));
});

test("derives lower-slot metadata and accepts a supplied designId", async () => {
  const payload = {
    version: 1,
    source: { kind: "draw", designId: "design_42" },
    garment: { slot: "lower", garmentKind: "pants" },
  };
  const result = await invoke({ payload, env: GENERATE_ENV });
  assert.equal(result.status, 202);
  assert.equal(result.json.job.designId, "design_42");
  assert.equal(result.json.job.profileSlot, "lower");
  assert.equal(result.json.job.subtype, "pants");
  assert.equal(result.json.job.coversLower, false);
});

test("rejects unknown fields and unsupported garment kinds", async () => {
  const unknown = basePayload();
  unknown.unexpected = true;
  const unknownResult = await invoke({ payload: unknown, env: GENERATE_ENV });
  assert.equal(unknownResult.status, 422);
  assert.ok(unknownResult.json.error.details.some((item) => item.path === "unexpected"));

  const shoes = basePayload();
  shoes.garment = { slot: "shoes", garmentKind: "shoes" };
  const shoesResult = await invoke({ payload: shoes, env: GENERATE_ENV });
  assert.equal(shoesResult.status, 422);
  assert.ok(shoesResult.json.error.details.some((item) => item.code === "UNSUPPORTED"));
});

test("rejects inconsistent coversLower and invalid preview genders", async () => {
  const covers = basePayload();
  covers.garment.coversLower = false;
  const coversResult = await invoke({ payload: covers, env: GENERATE_ENV });
  assert.equal(coversResult.status, 422);
  assert.ok(
    coversResult.json.error.details.some(
      (item) => item.path === "garment.coversLower" && item.code === "MISMATCH"
    )
  );

  const genders = basePayload();
  genders.options.previewGenders = ["girl"];
  const gendersResult = await invoke({ payload: genders, env: GENERATE_ENV });
  assert.equal(gendersResult.status, 422);
  assert.ok(
    gendersResult.json.error.details.some((item) => item.path === "options.previewGenders")
  );
});

test("rejects a prompt longer than 2000 characters", async () => {
  const payload = basePayload();
  payload.source.prompt = "x".repeat(2001);
  const result = await invoke({ payload, env: GENERATE_ENV });
  assert.equal(result.status, 422);
  assert.ok(
    result.json.error.details.some((item) => item.path === "source.prompt" && item.code === "TOO_LONG")
  );
  assert.ok(!result.raw.includes("x".repeat(2001)));
});

test("enforces declared and actual body size limits", async () => {
  const large = JSON.stringify({ version: 1, padding: "x".repeat(4000) });
  const declared = await invoke({
    rawBody: large,
    headers: { "content-length": String(Buffer.byteLength(large)) },
    env: { ...GENERATE_ENV, PHASE1_MAX_BODY_BYTES: "1024" },
  });
  assert.equal(declared.status, 413);
  assert.equal(declared.json.error.code, "PAYLOAD_TOO_LARGE");

  const actual = await invoke({
    rawBody: large,
    omitContentLength: true,
    env: { ...GENERATE_ENV, PHASE1_MAX_BODY_BYTES: "1024" },
  });
  assert.equal(actual.status, 413);
  assert.equal(actual.json.error.code, "PAYLOAD_TOO_LARGE");
});

test("provider boundary never calls an external service", async () => {
  const none = await invoke({
    payload: basePayload(),
    env: {
      ...GENERATE_ENV,
      PHASE1_DRY_RUN: "false",
      PHASE1_PROVIDER: "none",
    },
  });
  assert.equal(none.status, 503);
  assert.equal(none.json.error.code, "PROVIDER_NOT_CONFIGURED");

  const noKey = await invoke({
    payload: basePayload(),
    env: {
      ...GENERATE_ENV,
      PHASE1_DRY_RUN: "false",
      PHASE1_PROVIDER: "openai",
    },
  });
  assert.equal(noKey.status, 503);
  assert.equal(noKey.json.error.code, "PROVIDER_NOT_CONFIGURED");

  const adapter = await invoke({
    payload: basePayload(),
    env: {
      ...GENERATE_ENV,
      PHASE1_DRY_RUN: "false",
      PHASE1_PROVIDER: "openai",
      OPENAI_API_KEY: "test-key-not-used",
    },
  });
  assert.equal(adapter.status, 501);
  assert.equal(adapter.json.error.code, "PROVIDER_NOT_IMPLEMENTED");
});

test("invalid provider configuration fails closed", async () => {
  const result = await invoke({
    payload: basePayload(),
    env: { ...GENERATE_ENV, PHASE1_PROVIDER: "unknown-provider" },
  });
  assert.equal(result.status, 503);
  assert.equal(result.json.error.code, "SERVER_MISCONFIGURED");
});

test("supports Vercel's pre-parsed req.body path", async () => {
  const result = await invoke({
    payload: basePayload(),
    preParsed: true,
    env: GENERATE_ENV,
  });
  assert.equal(result.status, 202);
});

test("logs request metadata without prompts or tokens", async () => {
  const payload = basePayload();
  const logs = [];
  const originalLog = console.log;
  console.log = (...args) => logs.push(args.map(String).join(" "));

  try {
    const result = await invoke({
      payload,
      headers: { "x-beta-access-token": TOKEN },
      env: {
        ...GENERATE_ENV,
        ...GATE_ENV,
        PHASE1_LOG_LEVEL: "info",
      },
    });
    assert.equal(result.status, 202);
  } finally {
    console.log = originalLog;
  }

  const output = logs.join("\n");
  assert.match(output, /generate\.request/);
  assert.match(output, /"status":202/);
  assert.match(output, /"sourceKind":"ai-concept"/);
  assert.ok(!output.includes(payload.source.prompt));
  assert.ok(!output.includes(TOKEN));
  assert.ok(!output.includes("Red Midi Dress"));
  assert.ok(!output.toLowerCase().includes("authorization"));
});
