"use strict";

const { ApiError, ERROR_CODES } = require("./errors");

const TOP_LEVEL_KEYS = new Set(["version", "source", "garment", "concept", "options"]);
const SOURCE_KEYS = new Set([
  "kind",
  "conceptId",
  "designId",
  "prompt",
  "preparedPayloadRef",
  "refinementInstructions",
  "sketchRef",
  "dollPlacement",
]);
const ASSET_REF_KEYS = new Set(["url", "width", "height", "transparent", "mimeType", "checksum"]);
const DOLL_PLACEMENT_KEYS = new Set([
  "visible",
  "heightRatio",
  "aspect",
  "canvasWidth",
  "canvasHeight",
]);
const CONCEPT_KEYS = new Set([
  "title",
  "colors",
  "silhouette",
  "neckline",
  "sleeves",
  "length",
  "decorations",
  "style",
  "description",
  "designNotes",
]);
const GARMENT_KEYS = new Set(["slot", "subtype", "garmentKind", "coversLower", "category"]);
const OPTIONS_KEYS = new Set(["previewGenders"]);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const KIND_RULES = Object.freeze({
  top: { slots: ["upper"], profileSlot: "upper", subtypes: ["standard", "tshirt", "oversized"], coversLower: false },
  shirt: { slots: ["upper"], profileSlot: "upper", subtypes: ["standard", "oversized"], coversLower: false },
  tshirt: { slots: ["upper"], profileSlot: "upper", subtypes: ["tshirt", "standard"], coversLower: false },
  sweatshirt: { slots: ["upper"], profileSlot: "upper", subtypes: ["oversized", "standard"], coversLower: false },
  blouse: { slots: ["upper"], profileSlot: "upper", subtypes: ["standard", "oversized"], coversLower: false },
  sweater: { slots: ["upper"], profileSlot: "upper", subtypes: ["standard", "oversized"], coversLower: false },
  dress: { slots: ["upper"], profileSlot: "fullbody", subtypes: ["dress"], coversLower: true },
  gown: { slots: ["upper"], profileSlot: "fullbody", subtypes: ["gown"], coversLower: true },
  tulum: { slots: ["upper"], profileSlot: "fullbody", subtypes: ["tulum"], coversLower: true },
  jumpsuit: { slots: ["upper"], profileSlot: "fullbody", subtypes: ["tulum"], coversLower: true },
  coat: { slots: ["upper"], profileSlot: "upper", subtypes: ["outerwear"], coversLower: false },
  jacket: { slots: ["upper"], profileSlot: "upper", subtypes: ["outerwear"], coversLower: false },
  outerwear: { slots: ["upper"], profileSlot: "upper", subtypes: ["outerwear"], coversLower: false },
  skirt: { slots: ["lower"], profileSlot: "lower", subtypes: ["skirt"], coversLower: false },
  pants: { slots: ["lower"], profileSlot: "lower", subtypes: ["pants"], coversLower: false },
  shorts: { slots: ["lower"], profileSlot: "lower", subtypes: ["shorts"], coversLower: false },
  tracksuit: { slots: ["lower"], profileSlot: "lower", subtypes: ["tracksuit"], coversLower: false },
});

const RESERVED_GARMENT_KINDS = new Set(["shoes", "accessory", "other"]);
const RESERVED_SLOTS = new Set(["shoes", "accessory"]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function has(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function addError(errors, path, code, message) {
  if (errors.length < 20) {
    errors.push({ path, code, message });
  }
}

function rejectUnknown(object, allowed, basePath, errors) {
  for (const key of Object.keys(object)) {
    if (!allowed.has(key)) {
      addError(
        errors,
        basePath ? `${basePath}.${key}` : key,
        "UNKNOWN_FIELD",
        "Unknown field."
      );
    }
  }
}

function readString(object, key, path, options, errors) {
  const opts = options || {};
  if (!has(object, key)) {
    if (opts.required) {
      addError(errors, path, "REQUIRED", "This field is required.");
    }
    return undefined;
  }
  const value = object[key];
  if (typeof value !== "string") {
    addError(errors, path, "INVALID_TYPE", "Expected a string.");
    return undefined;
  }
  const text = opts.trim === false ? value : value.trim();
  if (opts.min !== undefined && text.length < opts.min) {
    addError(errors, path, "TOO_SHORT", `Must be at least ${opts.min} character(s).`);
    return undefined;
  }
  if (opts.max !== undefined && text.length > opts.max) {
    addError(errors, path, "TOO_LONG", `Must be at most ${opts.max} characters.`);
    return undefined;
  }
  if (opts.pattern && !opts.pattern.test(text)) {
    addError(errors, path, "INVALID_VALUE", "Use letters, numbers, dots, underscores, or dashes.");
    return undefined;
  }
  return text;
}

function readEnum(object, key, path, allowed, options, errors) {
  const opts = options || {};
  if (!has(object, key)) {
    if (opts.required) addError(errors, path, "REQUIRED", "This field is required.");
    return undefined;
  }
  const value = object[key];
  if (typeof value !== "string") {
    addError(errors, path, "INVALID_TYPE", "Expected a string.");
    return undefined;
  }
  const text = value.trim();
  if (!allowed.includes(text)) {
    addError(errors, path, "INVALID_VALUE", `Expected one of: ${allowed.join(", ")}.`);
    return undefined;
  }
  return text;
}

function readBoolean(object, key, path, options, errors) {
  const opts = options || {};
  if (!has(object, key)) {
    if (opts.required) addError(errors, path, "REQUIRED", "This field is required.");
    return undefined;
  }
  if (typeof object[key] !== "boolean") {
    addError(errors, path, "INVALID_TYPE", "Expected a boolean.");
    return undefined;
  }
  return object[key];
}

function readInteger(object, key, path, options, errors) {
  const opts = options || {};
  if (!has(object, key)) {
    if (opts.required) addError(errors, path, "REQUIRED", "This field is required.");
    return undefined;
  }
  const value = object[key];
  if (!Number.isInteger(value)) {
    addError(errors, path, "INVALID_TYPE", "Expected an integer.");
    return undefined;
  }
  if (opts.min !== undefined && value < opts.min) {
    addError(errors, path, "OUT_OF_RANGE", `Must be at least ${opts.min}.`);
    return undefined;
  }
  if (opts.max !== undefined && value > opts.max) {
    addError(errors, path, "OUT_OF_RANGE", `Must be at most ${opts.max}.`);
    return undefined;
  }
  return value;
}

function readNumber(object, key, path, options, errors) {
  const opts = options || {};
  if (!has(object, key)) {
    if (opts.required) addError(errors, path, "REQUIRED", "This field is required.");
    return undefined;
  }
  const value = object[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    addError(errors, path, "INVALID_TYPE", "Expected a finite number.");
    return undefined;
  }
  if (opts.min !== undefined && value < opts.min) {
    addError(errors, path, "OUT_OF_RANGE", `Must be at least ${opts.min}.`);
    return undefined;
  }
  if (opts.max !== undefined && value > opts.max) {
    addError(errors, path, "OUT_OF_RANGE", `Must be at most ${opts.max}.`);
    return undefined;
  }
  return value;
}

function validateAssetRef(value, path, errors) {
  if (!isRecord(value)) {
    addError(errors, path, "INVALID_TYPE", "Expected an object.");
    return null;
  }
  rejectUnknown(value, ASSET_REF_KEYS, path, errors);

  const url = readString(value, "url", `${path}.url`, { required: true, min: 1, max: 2048 }, errors);
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") {
        addError(errors, `${path}.url`, "INVALID_VALUE", "Use an https URL.");
      }
      if (parsed.username || parsed.password) {
        addError(errors, `${path}.url`, "INVALID_VALUE", "URLs with embedded credentials are not allowed.");
      }
      if (parsed.hostname === "localhost" || parsed.hostname.endsWith(".local")) {
        addError(errors, `${path}.url`, "INVALID_VALUE", "Local addresses are not allowed.");
      }
    } catch (_error) {
      addError(errors, `${path}.url`, "INVALID_VALUE", "Expected a valid absolute URL.");
    }
  }

  const width = readInteger(value, "width", `${path}.width`, { required: true, min: 1, max: 4096 }, errors);
  const height = readInteger(value, "height", `${path}.height`, { required: true, min: 1, max: 4096 }, errors);
  const transparent = readBoolean(value, "transparent", `${path}.transparent`, { required: true }, errors);
  const mimeType = readEnum(
    value,
    "mimeType",
    `${path}.mimeType`,
    ["image/png"],
    {},
    errors
  );
  const checksum = readString(value, "checksum", `${path}.checksum`, { max: 128 }, errors);

  return { url, width, height, transparent, mimeType, checksum };
}

function validateDollPlacement(value, path, errors) {
  if (!isRecord(value)) {
    addError(errors, path, "INVALID_TYPE", "Expected an object.");
    return null;
  }
  rejectUnknown(value, DOLL_PLACEMENT_KEYS, path, errors);
  return {
    visible: readBoolean(value, "visible", `${path}.visible`, {}, errors),
    heightRatio: readNumber(value, "heightRatio", `${path}.heightRatio`, { min: 0, max: 1 }, errors),
    aspect: readString(value, "aspect", `${path}.aspect`, { max: 16 }, errors),
    canvasWidth: readInteger(value, "canvasWidth", `${path}.canvasWidth`, { min: 1, max: 2000 }, errors),
    canvasHeight: readInteger(value, "canvasHeight", `${path}.canvasHeight`, { min: 1, max: 2000 }, errors),
  };
}

function validateSource(value, errors) {
  const path = "source";
  if (!isRecord(value)) {
    addError(errors, path, "INVALID_TYPE", "Expected an object.");
    return null;
  }
  rejectUnknown(value, SOURCE_KEYS, path, errors);

  const kind = readEnum(value, "kind", `${path}.kind`, ["ai-concept", "draw"], { required: true }, errors);
  const prompt = readString(value, "prompt", `${path}.prompt`, { min: 1, max: 2000 }, errors);
  const conceptId = readString(value, "conceptId", `${path}.conceptId`, { min: 1, max: 128, pattern: ID_RE }, errors);
  const designId = readString(value, "designId", `${path}.designId`, { min: 1, max: 128, pattern: ID_RE }, errors);
  const preparedPayloadRef = readString(
    value,
    "preparedPayloadRef",
    `${path}.preparedPayloadRef`,
    { min: 1, max: 512 },
    errors
  );

  const refinementInstructions = [];
  if (has(value, "refinementInstructions")) {
    if (!Array.isArray(value.refinementInstructions)) {
      addError(errors, `${path}.refinementInstructions`, "INVALID_TYPE", "Expected an array of strings.");
    } else {
      if (value.refinementInstructions.length > 10) {
        addError(
          errors,
          `${path}.refinementInstructions`,
          "TOO_MANY_ITEMS",
          "At most 10 refinement instructions are allowed."
        );
      }
      value.refinementInstructions.slice(0, 10).forEach((item, index) => {
        if (typeof item !== "string") {
          addError(
            errors,
            `${path}.refinementInstructions[${index}]`,
            "INVALID_TYPE",
            "Expected a string."
          );
          return;
        }
        const text = item.trim();
        if (text.length < 1 || text.length > 300) {
          addError(
            errors,
            `${path}.refinementInstructions[${index}]`,
            "OUT_OF_RANGE",
            "Must be 1-300 characters."
          );
          return;
        }
        refinementInstructions.push(text);
      });
    }
  }

  let sketchRef = null;
  if (has(value, "sketchRef")) {
    sketchRef = validateAssetRef(value.sketchRef, `${path}.sketchRef`, errors);
  }

  let dollPlacement = null;
  if (has(value, "dollPlacement")) {
    dollPlacement = validateDollPlacement(value.dollPlacement, `${path}.dollPlacement`, errors);
  }

  if (kind === "ai-concept" && !has(value, "prompt")) {
    addError(errors, `${path}.prompt`, "REQUIRED", "A prompt is required for ai-concept requests.");
  }
  if (kind === "draw" && !designId && !has(value, "sketchRef")) {
    addError(errors, path, "REQUIRED", "Draw requests require designId or sketchRef.");
  }

  return {
    kind,
    prompt: prompt || "",
    conceptId,
    designId,
    preparedPayloadRef,
    refinementInstructions,
    sketchRef,
    dollPlacement,
  };
}

function validateConcept(value, errors) {
  if (value === undefined) return null;
  const path = "concept";
  if (!isRecord(value)) {
    addError(errors, path, "INVALID_TYPE", "Expected an object.");
    return null;
  }
  rejectUnknown(value, CONCEPT_KEYS, path, errors);

  const concept = {
    title: readString(value, "title", `${path}.title`, { max: 120 }, errors),
    silhouette: readString(value, "silhouette", `${path}.silhouette`, { max: 200 }, errors),
    neckline: readString(value, "neckline", `${path}.neckline`, { max: 200 }, errors),
    sleeves: readString(value, "sleeves", `${path}.sleeves`, { max: 200 }, errors),
    length: readString(value, "length", `${path}.length`, { max: 200 }, errors),
    decorations: readString(value, "decorations", `${path}.decorations`, { max: 200 }, errors),
    style: readString(value, "style", `${path}.style`, { max: 200 }, errors),
    description: readString(value, "description", `${path}.description`, { max: 2000 }, errors),
    designNotes: readString(value, "designNotes", `${path}.designNotes`, { max: 2000 }, errors),
  };

  if (has(value, "colors")) {
    if (!Array.isArray(value.colors)) {
      addError(errors, `${path}.colors`, "INVALID_TYPE", "Expected an array of strings.");
      concept.colors = [];
    } else {
      if (value.colors.length > 8) {
        addError(errors, `${path}.colors`, "TOO_MANY_ITEMS", "At most 8 colors are allowed.");
      }
      concept.colors = value.colors.slice(0, 8).map((color, index) => {
        if (typeof color !== "string") {
          addError(errors, `${path}.colors[${index}]`, "INVALID_TYPE", "Expected a string.");
          return null;
        }
        const text = color.trim();
        if (text.length < 1 || text.length > 40) {
          addError(errors, `${path}.colors[${index}]`, "OUT_OF_RANGE", "Must be 1-40 characters.");
          return null;
        }
        return text;
      });
    }
  }

  return concept;
}

function validateGarment(value, errors) {
  const path = "garment";
  if (!isRecord(value)) {
    addError(errors, path, "INVALID_TYPE", "Expected an object.");
    return null;
  }
  rejectUnknown(value, GARMENT_KEYS, path, errors);

  const slot = readString(value, "slot", `${path}.slot`, { required: true, min: 1, max: 32 }, errors);
  if (slot && RESERVED_SLOTS.has(slot)) {
    addError(errors, `${path}.slot`, "UNSUPPORTED", "Phase 1 supports the upper and lower slots only.");
  } else if (slot && !["upper", "lower"].includes(slot)) {
    addError(errors, `${path}.slot`, "INVALID_VALUE", "Expected upper or lower.");
  }

  const garmentKind = readString(
    value,
    "garmentKind",
    `${path}.garmentKind`,
    { required: true, min: 1, max: 32 },
    errors
  );
  let rule = null;
  if (garmentKind) {
    if (RESERVED_GARMENT_KINDS.has(garmentKind)) {
      addError(
        errors,
        `${path}.garmentKind`,
        "UNSUPPORTED",
        "Phase 1 supports Clothes upper/lower garment kinds only."
      );
    } else if (!KIND_RULES[garmentKind]) {
      addError(errors, `${path}.garmentKind`, "INVALID_VALUE", "Unknown garmentKind.");
    } else {
      rule = KIND_RULES[garmentKind];
    }
  }

  const subtype = readString(value, "subtype", `${path}.subtype`, { min: 1, max: 32 }, errors);
  const coversLower = readBoolean(value, "coversLower", `${path}.coversLower`, {}, errors);
  const category = readString(value, "category", `${path}.category`, { min: 1, max: 32 }, errors);

  if (category && category !== "clothes") {
    addError(errors, `${path}.category`, "UNSUPPORTED", "Phase 1 supports category 'clothes' only.");
  }

  if (rule) {
    if (slot && !rule.slots.includes(slot)) {
      addError(
        errors,
        `${path}.slot`,
        "MISMATCH",
        `${garmentKind} is not valid for the ${slot} slot.`
      );
    }
    if (subtype && !rule.subtypes.includes(subtype)) {
      addError(
        errors,
        `${path}.subtype`,
        "INVALID_VALUE",
        `Allowed subtypes for ${garmentKind}: ${rule.subtypes.join(", ")}.`
      );
    }
    if (coversLower !== undefined && coversLower !== rule.coversLower) {
      addError(
        errors,
        `${path}.coversLower`,
        "MISMATCH",
        `${garmentKind} requires coversLower=${rule.coversLower}.`
      );
    }
  }

  return {
    slot,
    subtype: subtype || (rule ? rule.subtypes[0] : undefined),
    garmentKind,
    coversLower: coversLower === undefined && rule ? rule.coversLower : coversLower,
    category: category || "clothes",
    profileSlot: rule ? rule.profileSlot : undefined,
  };
}

function validateOptions(value, errors) {
  const defaults = { previewGenders: ["girl", "boy"] };
  if (value === undefined) return defaults;
  const path = "options";
  if (!isRecord(value)) {
    addError(errors, path, "INVALID_TYPE", "Expected an object.");
    return defaults;
  }
  rejectUnknown(value, OPTIONS_KEYS, path, errors);
  if (!has(value, "previewGenders")) return defaults;

  const genders = value.previewGenders;
  if (!Array.isArray(genders) || genders.length !== 2) {
    addError(
      errors,
      `${path}.previewGenders`,
      "INVALID_VALUE",
      "previewGenders must contain exactly girl and boy."
    );
    return defaults;
  }
  const unique = new Set(genders);
  if (unique.size !== 2 || !unique.has("girl") || !unique.has("boy")) {
    addError(
      errors,
      `${path}.previewGenders`,
      "INVALID_VALUE",
      "previewGenders must contain exactly girl and boy."
    );
  }
  return defaults;
}

/**
 * Validates and normalizes a POST /api/generate body.
 *
 * The normalized object intentionally contains only whitelisted fields. It is
 * kept server-side; the response exposes only non-sensitive input summaries.
 */
function validateGenerateRequest(body) {
  const errors = [];
  if (!isRecord(body)) {
    throw new ApiError(
      422,
      ERROR_CODES.VALIDATION_FAILED,
      "Request validation failed.",
      [{ path: "$", code: "INVALID_TYPE", message: "Body must be a JSON object." }]
    );
  }

  rejectUnknown(body, TOP_LEVEL_KEYS, "", errors);
  readInteger(body, "version", "version", { required: true, min: 1, max: 1 }, errors);
  const source = validateSource(body.source, errors);
  const garment = validateGarment(body.garment, errors);
  const concept = validateConcept(body.concept, errors);
  const options = validateOptions(body.options, errors);

  if (errors.length) {
    throw new ApiError(
      422,
      ERROR_CODES.VALIDATION_FAILED,
      "Request validation failed.",
      errors
    );
  }

  return {
    version: 1,
    source,
    garment,
    concept: concept || {},
    options,
  };
}

module.exports = {
  KIND_RULES,
  validateGenerateRequest,
};
