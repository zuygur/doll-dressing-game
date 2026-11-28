# Phase 1 — Backend Skeleton and Private Beta Gate

Status: **Phase 1 complete. No external image-generation API was called. No paid
service or storage was created. Generation remains disabled by default.**

Phase 1 adds a Vercel serverless endpoint, request validation, structured
errors, a provider adapter boundary, a private beta gate, safe logging, and an
async-compatible job envelope. It does **not** generate, fit, warp, upload, or
register any image, and it does not modify the live game.

Phase 0 calibration profiles remain
`status: "draft-needs-visual-signoff"`. They were not marked calibrated.

---

## 1. Project structure and Vercel entry point

The repository is still the original plain HTML/CSS/JavaScript game. There is no
`package.json`, no framework, and no existing `vercel.json`. Vercel's zero-config
Node.js convention is used:

```
api/generate.js                  POST /api/generate (Vercel Function)
server/phase1/config.js          server-side environment configuration
server/phase1/errors.js          structured ApiError
server/phase1/http.js            body limits, JSON parsing, responses
server/phase1/beta-gate.js       timing-safe private-beta check
server/phase1/logger.js          structured, redacted request logging
server/phase1/validation.js      strict request validation and normalization
server/phase1/jobs.js            Phase-0-compatible queued job envelope
server/phase1/providers/         provider adapter interface and placeholders
phase1/tests/generate.test.cjs   node:test API tests
phase1/local-server.cjs          development-only HTTP wrapper
phase1/README.md                 this document
```

Vercel creates a function for every supported file under the root `api/`
directory. Shared modules are therefore **outside** `api/` and imported by
`api/generate.js`; this follows Vercel's non-framework guidance. The shared
modules contain no secrets. All provider keys and the beta token exist only in
server-side environment variables.

No `vercel.json` is required. Static hosting for `index.html`, `script.js`,
`style.css`, assets, and the game behavior is unchanged. Adding `api/` does not
alter static routes.

---

## 2. API contract

### Request

`POST /api/generate`

Required headers:

```
Content-Type: application/json
```

Private-beta header, when the gate is enabled:

```
x-beta-access-token: <BETA_TOKEN>
```

`Authorization: Bearer <BETA_TOKEN>` is also accepted. Tokens are never accepted
from query strings.

Body limits:

- Default maximum: **65,536 bytes** (`PHASE1_MAX_BODY_BYTES`).
- Declared `Content-Length` and actual streamed bytes are both enforced.
- Only `application/json` is accepted.
- Unknown fields are rejected, not ignored.

Body shape:

```json
{
  "version": 1,
  "source": {
    "kind": "ai-concept",
    "prompt": "A red midi dress with long sleeves",
    "conceptId": "concept_01",
    "designId": "design_optional",
    "preparedPayloadRef": "optional-reference",
    "refinementInstructions": ["Make the hem longer"]
  },
  "garment": {
    "slot": "upper",
    "garmentKind": "dress",
    "subtype": "dress",
    "coversLower": true,
    "category": "clothes"
  },
  "concept": {
    "title": "Red Midi Dress",
    "colors": ["red"],
    "silhouette": "A-line",
    "neckline": "V-neck",
    "sleeves": "long",
    "length": "midi",
    "decorations": "none",
    "style": "elegant",
    "description": "Optional description",
    "designNotes": "Optional notes"
  },
  "options": {
    "previewGenders": ["girl", "boy"]
  }
}
```

Field rules:

- `version` must be exactly `1`.
- `source.kind` is `ai-concept` or `draw`.
- `source.prompt` is required for `ai-concept`, max 2,000 characters.
- `draw` requests require `source.designId` or `source.sketchRef`.
- IDs must match `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`.
- At most 10 refinement instructions, each 1–300 characters.
- `sketchRef`, if present, must be a future-safe reference: HTTPS URL without
  credentials, width/height 1–4,096, and `transparent` boolean. It is **not
  fetched in Phase 1**. A binary sketch-upload endpoint does not exist yet.
- `garment.slot` is `upper` or `lower`. `shoes` and `accessory` are reserved
  and rejected in Phase 1.
- `garment.garmentKind` must be a Clothes upper/lower kind:
  `top`, `shirt`, `tshirt`, `sweatshirt`, `blouse`, `sweater`, `dress`, `gown`,
  `tulum`, `jumpsuit`, `coat`, `jacket`, `outerwear`, `skirt`, `pants`,
  `shorts`, or `tracksuit`.
- `garment.subtype` is optional and defaults to the first profile subtype for
  that kind. It must be valid for the Phase 0 profile slot.
- `garment.coversLower` is optional and derived from `garmentKind`. If supplied,
  it must match:
  - `dress`, `gown`, `tulum`, `jumpsuit` → `true` (registered in Upper);
  - `coat`, `jacket`, `outerwear` → `false`;
  - all other upper/lower kinds → `false`.
- `garment.category` is fixed to `clothes`.
- `options.previewGenders` must be exactly `["girl", "boy"]` when supplied.
  Omitting it defaults to both genders.
- `concept` fields are optional but bounded. Colors are limited to 8 entries of
  40 characters.

Examples:

```json
{
  "version": 1,
  "source": {
    "kind": "draw",
    "designId": "design_42"
  },
  "garment": {
    "slot": "lower",
    "garmentKind": "pants"
  }
}
```

```json
{
  "version": 1,
  "source": {
    "kind": "ai-concept",
    "prompt": "A red midi dress with long sleeves",
    "conceptId": "concept_01"
  },
  "garment": {
    "slot": "upper",
    "garmentKind": "dress"
  }
}
```

### Success response

When `PHASE1_GENERATION_ENABLED=true` and `PHASE1_DRY_RUN=true`:

```
HTTP/1.1 202 Accepted
Content-Type: application/json; charset=utf-8
Cache-Control: no-store, max-age=0
X-Content-Type-Options: nosniff
X-Request-Id: req_...
```

```json
{
  "ok": true,
  "requestId": "req_...",
  "job": {
    "jobId": "job_...",
    "status": "queued",
    "provider": "unknown",
    "designId": "dsg_...",
    "createdAt": "2026-11-27T14:17:45.343Z",
    "updatedAt": "2026-11-27T14:17:45.343Z",
    "expiresAt": "2026-11-27T15:17:45.343Z",
    "requestId": "req_...",
    "dryRun": true,
    "slot": "upper",
    "profileSlot": "fullbody",
    "subtype": "dress",
    "garmentKind": "dress",
    "coversLower": true,
    "fitProfileVersion": "0.1.0",
    "fitProfileStatus": "draft-needs-visual-signoff",
    "planned": {
      "master": true,
      "preview": true,
      "thumbnail": true,
      "genderVariants": ["girl", "boy"],
      "fitting": false,
      "meshWarp": false,
      "wardrobeRegistration": false
    },
    "inputSummary": {
      "sourceKind": "ai-concept",
      "promptLength": 34,
      "conceptTitleLength": 14,
      "colorCount": 1,
      "refinementCount": 1,
      "hasSketch": false,
      "previewGenders": ["girl", "boy"]
    }
  }
}
```

The job envelope follows `phase0/asset-contract.schema.json#/$defs/generationJob`
and adds non-sensitive Phase 1 metadata. It deliberately contains no prompt,
concept text, token, provider key, master URL, preview URL, or fitted assets.
The `planned` block makes clear that fitting and wardrobe registration are still
not implemented. `server/phase1/jobs.js` currently pins
`FIT_PROFILE_VERSION = "0.1.0"` and `FIT_PROFILE_STATUS =
"draft-needs-visual-signoff"`; update those constants when the Phase 0 profile
version or status changes.

### Error response

```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "requestId": "req_...",
    "details": [
      {
        "path": "garment.slot",
        "code": "UNSUPPORTED",
        "message": "Phase 1 supports the upper and lower slots only."
      }
    ]
  }
}
```

Error details contain field paths and fixed messages only. Request bodies,
prompts, tokens, and stack traces are never returned.

---

## 3. Status codes and failure behavior

| Status | Code | Meaning |
|---:|---|---|
| 202 | `DRY_RUN_QUEUED` / `QUEUED` | Validated; dry-run or future provider job accepted |
| 400 | `INVALID_JSON` | Malformed or empty JSON |
| 400 | `INVALID_ENCODING` | Body is not valid UTF-8 |
| 401 | `BETA_ACCESS_DENIED` | Missing or wrong beta token (same response) |
| 405 | `METHOD_NOT_ALLOWED` | Method is not POST; `Allow: POST` is returned |
| 413 | `PAYLOAD_TOO_LARGE` | Declared or actual body exceeds the limit |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Content-Type is not JSON |
| 422 | `VALIDATION_FAILED` | Field validation failed |
| 501 | `PROVIDER_NOT_IMPLEMENTED` | Provider adapter boundary reached; not implemented |
| 503 | `GENERATION_DISABLED` | Generation flag is off (default) |
| 503 | `BETA_GATE_REQUIRED` | Production has generation enabled without the gate |
| 503 | `BETA_GATE_NOT_CONFIGURED` | Gate enabled without a strong server token |
| 503 | `PROVIDER_NOT_CONFIGURED` | No provider, or no server-side provider key |
| 503 | `SERVER_MISCONFIGURED` | Invalid server configuration, e.g. bad provider id |
| 500 | `INTERNAL_ERROR` | Unexpected server error; generic public message |

When generation is disabled, the endpoint returns `GENERATION_DISABLED` before
reading/validating the body, so the default deployment cannot spend provider
resources.

---

## 4. Private beta gate

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PHASE1_BETA_GATE_ENABLED` | `false` | Enables the token gate |
| `PHASE1_BETA_TOKEN` | empty | Server-only access token, minimum 32 characters |

Behavior:

- The gate is opt-in, and fails closed when enabled without a sufficiently
  strong token.
- Missing and wrong tokens return the same `401 BETA_ACCESS_DENIED`.
- Comparison uses SHA-256 digests and `crypto.timingSafeEqual`.
- Tokens are accepted only from `x-beta-access-token` or a Bearer header.
- Tokens are not accepted from URLs, cookies, or request bodies.
- Tokens are never logged or returned.
- In `VERCEL_ENV=production`, enabling generation with the gate disabled returns
  `503 BETA_GATE_REQUIRED`. This prevents accidentally exposing a paid provider
  during the private beta.
- The token is intended for a small private group. Do not embed it in public
  client JavaScript or a public repository. Client integration and a safer
  per-user access mechanism are deferred.

Generate a token locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 5. Environment variables

| Variable | Default | Notes |
|---|---|---|
| `PHASE1_GENERATION_ENABLED` | `false` | Master switch. Keep false until provider testing and approval. |
| `PHASE1_DRY_RUN` | `true` | When generation is enabled, returns a job without provider calls. Keep true until Phase 2. |
| `PHASE1_BETA_GATE_ENABLED` | `false` | Enable for private beta deployments. |
| `PHASE1_BETA_TOKEN` | empty | Required when the gate is enabled; min 32 characters. |
| `PHASE1_PROVIDER` | `none` | `none`, `openai`, `replicate`, or `stability`. No provider is selected. |
| `PHASE1_MAX_BODY_BYTES` | `65536` | Clamped to 1,024–1,048,576. |
| `PHASE1_JOB_TTL_SECONDS` | `3600` | Clamped to 60–86,400. Used for `expiresAt`. |
| `PHASE1_LOG_LEVEL` | `info` | `silent`, `error`, `warn`, `info`, or `debug`. |

Future provider keys (server-side only; **not used in Phase 1**):

- `OPENAI_API_KEY`
- `REPLICATE_API_TOKEN`
- `STABILITY_API_KEY`

The adapter interface checks key presence only. No provider request is made, and
no provider is committed to. Provider keys must never be placed in HTML, client
JavaScript, a `VITE_*`/`NEXT_PUBLIC_*` variable, or a public config file.
`PHASE1_PROVIDER` is server-only; clients cannot choose a provider.

---

## 6. Vercel configuration

1. Keep the repository as a static project. Vercel detects the root `api/`
   directory and deploys `api/generate.js` as a Node.js Function.
2. Do not add framework build settings. No `package.json` or `vercel.json` is
   required for this skeleton.
3. Add environment variables in **Project Settings → Environment Variables**.
   Use separate values for Production and Preview. Do not expose them to the
   client or commit them.
4. Recommended initial **Preview/private-beta** configuration:

```
PHASE1_GENERATION_ENABLED=true
PHASE1_DRY_RUN=true
PHASE1_BETA_GATE_ENABLED=true
PHASE1_BETA_TOKEN=<32+ character random token>
PHASE1_PROVIDER=none
PHASE1_LOG_LEVEL=info
```

5. Keep Production at `PHASE1_GENERATION_ENABLED=false` until explicit approval.
   Use a Preview deployment with a separate beta token for private testing.
6. Do not configure provider keys yet. Phase 1 must not spend money or call an
   image provider.
7. Vercel's Function logs receive the JSON request line. They contain request
   ID, status, duration, source kind, slot, garment kind, prompt length,
   refinement count, sketch presence, provider id, and dry-run flag. They do
   not contain prompts, concept text, tokens, authorization headers, or keys.

If the project is later moved into a framework, the same handler can be wrapped;
the request/response contract does not depend on the static frontend.

---

## 7. Local testing

Install nothing. Node.js 18+ is sufficient; the tests were run on Node 24.

Run the API tests:

```bash
node --test phase1/tests/generate.test.cjs
```

Run the development HTTP wrapper:

```bash
PHASE1_GENERATION_ENABLED=true \
PHASE1_DRY_RUN=true \
PHASE1_PROVIDER=none \
PHASE1_BETA_GATE_ENABLED=true \
PHASE1_BETA_TOKEN=test-beta-token-0123456789abcdef \
PHASE1_LOG_LEVEL=info \
PORT=3101 \
node phase1/local-server.cjs
```

Then:

```bash
curl -i -X POST http://localhost:3101/api/generate \
  -H 'Content-Type: application/json' \
  -H 'x-beta-access-token: test-beta-token-0123456789abcdef' \
  --data-binary '{
    "version": 1,
    "source": {
      "kind": "ai-concept",
      "prompt": "A red midi dress with long sleeves",
      "conceptId": "concept_01"
    },
    "garment": { "slot": "upper", "garmentKind": "dress" }
  }'
```

Observed local results:

- Valid dry-run request: **202**, queued job, `dryRun: true`, both planned
  gender variants, `fitProfileStatus: "draft-needs-visual-signoff"`.
- Missing beta token: **401** `BETA_ACCESS_DENIED`.
- Shoes request: **422** `VALIDATION_FAILED` with `UNSUPPORTED` details.
- `text/plain`: **415** `UNSUPPORTED_MEDIA_TYPE`.
- Log output contained `generate.request` and no prompt or token.
- `node --test`: **19 passed, 0 failed**.

Test coverage includes method/content-type/JSON errors, beta-gate denial and
acceptance, fail-closed gate configuration, disabled-by-default generation,
production gate guard, valid dry-run job shape, draw validation, derived
lower/full-body metadata, unknown fields, unsupported garment kinds,
`coversLower` mismatches, preview-gender enforcement, prompt limits, declared
and actual body limits, provider misconfiguration, the unimplemented provider
boundary, Vercel's pre-parsed body path, and log redaction.

---

## 8. Provider adapter interface

`server/phase1/providers/base.js` documents the future boundary:

```js
createGenerationJob(input, context)
getGenerationJob(providerJobId, context)
getGenerationResult(providerJobId, context)
```

Each future adapter must:

- read keys only from server-side environment variables;
- perform provider calls only on the server;
- normalize the returned master image and metadata;
- never log prompts, keys, or signed provider URLs;
- never fit, mesh-warp, upload to a paid store, or register wardrobe assets by
  itself. Those remain separate later phases.

`openai.js`, `replicate.js`, and `stability.js` are placeholders. They expose
only `id`, `envKeys`, `capabilities`, `isConfigured()`, and methods that throw
`501 PROVIDER_NOT_IMPLEMENTED`. No provider SDK or network call exists.

No provider was selected or tested in Phase 1.

---

## 9. Async-generation architecture

Phase 1 returns a **202** with a `generationJob`-shaped envelope, so a future
synchronous or asynchronous implementation can keep the same response contract.

Planned future flow, not implemented:

1. `POST /api/generate` validates the input and creates a queued job.
2. A server-side worker/provider adapter creates the single garment master.
3. A later phase performs transparency checks, girl/boy fitting, preview and
   thumbnail creation, and optional Blob upload.
4. A future `GET /api/jobs/:id` (or equivalent) polls a durable store.
5. The client shows both fitted previews before Accept/Regenerate/Reject.

Phase 1 does **not** persist jobs. Serverless invocations do not share reliable
in-memory state, so a fake in-memory job store would be misleading. Durable job
storage/queueing will be chosen in Phase 2 or later; Vercel KV/Redis and Blob
are candidates but were not purchased or configured. No polling endpoint is
implemented yet. The job contract, provider status values, `expiresAt`, and
`providerJobId` field are already reserved for that transition.

---

## 10. Security summary

- Provider keys and beta tokens are server-side environment variables only.
- No secrets appear in public HTML, public JavaScript, or client configuration.
- The beta gate is timing-safe and fails closed.
- Production refuses ungated generation.
- Generation is disabled by default and dry-run is the default when enabled.
- JSON-only, POST-only, strict field whitelist, body byte cap, and length caps.
- No request body, prompt, token, or stack trace is reflected to clients.
- Logs are structured and redacted; only lengths/flags are recorded.
- No CORS headers are emitted; the endpoint is same-origin by default.
- No external API, paid service, storage, database, or queue was created.
- Basic per-request limits exist, but there is no durable rate limiter or quota.
  Public usage still requires server-side quotas, likely with Vercel KV/Redis,
  and abuse controls before launch.

---

## 11. Files created / modified

Created:

- `api/generate.js`
- `server/phase1/config.js`
- `server/phase1/errors.js`
- `server/phase1/http.js`
- `server/phase1/beta-gate.js`
- `server/phase1/logger.js`
- `server/phase1/validation.js`
- `server/phase1/jobs.js`
- `server/phase1/providers/base.js`
- `server/phase1/providers/index.js`
- `server/phase1/providers/openai.js`
- `server/phase1/providers/replicate.js`
- `server/phase1/providers/stability.js`
- `phase1/tests/generate.test.cjs`
- `phase1/local-server.cjs`
- `phase1/README.md`

No existing game file, wardrobe UI, character asset, clothing asset, saved doll,
saved design, Phase 0 calibration profile, or calibration overlay was modified.
Profiles remain drafts. No `package.json`, `vercel.json`, Blob store, database,
KV/Redis instance, or paid service was created.

---

## 12. Open decisions / blockers

1. **Phase 0 sign-off:** landmarks and target/safe boxes, including the revised
   wrist points, remain `draft-needs-visual-signoff`.
2. **Provider selection:** no provider has been tested or chosen. Adapters are
   placeholders only.
3. **Client integration:** the game and AI Fashion Studio do not call
   `/api/generate` yet. A later phase must build the bridge, preserve state, and
   show both fitted previews before acceptance.
4. **Beta-token delivery:** the current shared token is suitable for a small
   private beta, not a public user system. Per-user sessions/allowlists are an
   open decision.
5. **Sketch uploads:** only an HTTPS `sketchRef` reference is accepted. Binary
   upload, validation, and storage do not exist; the server does not fetch the
   reference in Phase 1.
6. **Durable async jobs:** storage, queue/worker model, polling endpoint, and
   expiry cleanup remain to be designed. KV/Redis and Blob are candidates only.
7. **Rate limiting / public quotas:** no durable limiter exists. Public release
   still needs server-side quotas and abuse controls.
8. **Master image policy:** resolution, aspect, padding, and transparency rules
   are not fixed.
9. **Provider/model pilot:** required before `PHASE1_DRY_RUN=false` or
   `PHASE1_GENERATION_ENABLED=true` in production.
10. **CORS:** the endpoint is same-origin only. An external client would require
    an explicit origin policy and separate review.
11. **Static exposure of helper source:** `server/phase1/*.js` is source code
    outside `api/` and may be publicly fetchable on a static deployment. It
    contains no secrets; secrets remain environment-only. If source hiding is
    required, a future deployment configuration should address it.

Phase 1 stops here. Phase 2 has not been started.
