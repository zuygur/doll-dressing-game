"use strict";

const BASE_RULES = [
  "Create one single garment for a flat 2D chibi paper-doll dress-up game.",
  "Front view, centered, full garment visible, clean crisp outlines, soft cel shading, simple readable shapes.",
  "Garment only: no person, no body, no mannequin, no hanger, no background, no floor, no text, no watermark.",
  "Do not create an outfit or multiple garments.",
  "The background must be fully transparent; the garment must be isolated with clean alpha edges.",
  "Keep the style consistent with a cute, flat 2D chibi fashion illustration, not photorealism.",
].join(" ");

function oneLine(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function appendField(parts, label, value) {
  const text = oneLine(value);
  if (text) parts.push(`${label}: ${text}.`);
}

function slotInstruction(caseDef) {
  if (caseDef.profileSlot === "fullbody") {
    return "This is one full-body upper-slot garment. Do not add a separate top, trousers, skirt, or shoes.";
  }
  if (caseDef.slot === "lower") {
    return "This is one lower-body garment. Do not include a top, shoes, or any body part.";
  }
  if (caseDef.subtype === "outerwear") {
    return "This is one outerwear garment. Do not include trousers, a skirt, shoes, or a body; the lower layer will be added separately.";
  }
  return "This is one upper-body garment. Do not include trousers, a skirt, shoes, or any body part.";
}

function sketchInstruction(caseDef) {
  if (caseDef.type !== "sketch") return "";
  return [
    "The attached image is a rough line sketch for this single garment.",
    "Use it as the authoritative shape guide and preserve its neckline, waistline, sleeve length, hem, leg width, and overall silhouette.",
    "Clean the sketch into a finished garment and remove rough construction lines, canvas marks, and stray strokes.",
    "Do not reproduce the sketch as line art only, do not add a person, and do not copy any reference doll.",
  ].join(" ");
}

/**
 * Builds one deterministic prompt from structured case data. Client-supplied
 * free text is not trusted as the whole prompt; the safety/style/garment-only
 * rules are appended server-side for every provider.
 */
function buildPilotPrompt(caseDef) {
  if (!caseDef || !caseDef.concept || !caseDef.garmentKind) {
    throw new Error("A valid pilot case is required to build a prompt.");
  }
  const concept = caseDef.concept;
  const parts = [BASE_RULES, slotInstruction(caseDef)];

  parts.push(`Garment type: ${caseDef.garmentKind}; wardrobe slot: ${caseDef.slot}; fit profile subtype: ${caseDef.subtype}.`);
  appendField(parts, "Title", concept.title);
  appendField(parts, "Colors", Array.isArray(concept.colors) ? concept.colors.join(", ") : concept.colors);
  appendField(parts, "Silhouette", concept.silhouette);
  appendField(parts, "Neckline", concept.neckline);
  appendField(parts, "Sleeves", concept.sleeves);
  appendField(parts, "Length", concept.length);
  appendField(parts, "Decorations", concept.decorations);
  appendField(parts, "Style", concept.style);
  appendField(parts, "Description", concept.description);
  appendField(parts, "Design notes", concept.designNotes);

  const sketch = sketchInstruction(caseDef);
  if (sketch) parts.push(sketch);

  return parts.join(" ");
}

module.exports = {
  BASE_RULES,
  buildPilotPrompt,
  slotInstruction,
};
