"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { KIND_RULES } = require("../phase1/validation");

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_CASES_PATH = path.join(PROJECT_ROOT, "phase2", "pilot-cases.json");

class PilotCaseError extends Error {
  constructor(message) {
    super(message);
    this.name = "PilotCaseError";
    this.code = "PILOT_CASE_INVALID";
  }
}

function assert(condition, message) {
  if (!condition) throw new PilotCaseError(message);
}

function validateCase(caseDef) {
  assert(caseDef && typeof caseDef === "object", "Case must be an object.");
  assert(typeof caseDef.id === "string" && caseDef.id, "Case id is required.");
  assert(["concept", "sketch"].includes(caseDef.type), `Unsupported case type: ${caseDef.type}`);
  assert(["ai-concept", "draw"].includes(caseDef.sourceKind), `Unsupported source kind: ${caseDef.sourceKind}`);
  assert(["upper", "lower"].includes(caseDef.slot), `Unsupported slot in ${caseDef.id}.`);
  assert(caseDef.category === "clothes", `Unsupported category in ${caseDef.id}.`);

  const rule = KIND_RULES[caseDef.garmentKind];
  assert(rule, `Unsupported garmentKind in ${caseDef.id}.`);
  assert(rule.profileSlot === caseDef.profileSlot, `profileSlot mismatch in ${caseDef.id}.`);
  assert(rule.slots.includes(caseDef.slot), `slot mismatch in ${caseDef.id}.`);
  assert(rule.coversLower === caseDef.coversLower, `coversLower mismatch in ${caseDef.id}.`);
  assert(rule.subtypes.includes(caseDef.subtype), `subtype mismatch in ${caseDef.id}.`);

  assert(caseDef.concept && typeof caseDef.concept === "object", `Concept is missing in ${caseDef.id}.`);
  assert(Array.isArray(caseDef.evaluationFocus) && caseDef.evaluationFocus.length > 0, `evaluationFocus is missing in ${caseDef.id}.`);

  if (caseDef.type === "sketch") {
    assert(typeof caseDef.sketchFixture === "string" && caseDef.sketchFixture, `Sketch fixture is missing in ${caseDef.id}.`);
    assert(caseDef.dollPlacement && typeof caseDef.dollPlacement === "object", `dollPlacement is missing in ${caseDef.id}.`);
  }
}

function loadPilotCases(casesPath) {
  const filePath = casesPath || DEFAULT_CASES_PATH;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new PilotCaseError(`Could not read pilot cases: ${error.name}`);
  }

  assert(parsed && parsed.kind === "phase2-provider-pilot-cases", "Unexpected pilot cases file.");
  assert(Array.isArray(parsed.cases), "Pilot cases must be an array.");
  assert(parsed.cases.length === 7, "Exactly 7 pilot cases are required.");

  const ids = new Set();
  for (const caseDef of parsed.cases) {
    validateCase(caseDef);
    assert(!ids.has(caseDef.id), `Duplicate pilot case id: ${caseDef.id}`);
    ids.add(caseDef.id);
  }

  const concepts = parsed.cases.filter((item) => item.type === "concept");
  const sketches = parsed.cases.filter((item) => item.type === "sketch");
  assert(concepts.length === 5, "Exactly 5 concept cases are required.");
  assert(sketches.length === 2, "Exactly 2 sketch cases are required.");

  return {
    meta: {
      schemaVersion: parsed.schemaVersion,
      caseSelection: parsed.caseSelection,
      scope: parsed.scope,
      sourcePath: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, "/"),
    },
    cases: parsed.cases,
  };
}

module.exports = {
  DEFAULT_CASES_PATH,
  PilotCaseError,
  loadPilotCases,
  validateCase,
};
