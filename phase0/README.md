# Phase 0 — Asset Inspection, Calibration Profiles, and Contracts

Status: **Phase 0 complete; calibration values are drafts pending visual sign-off.**
This directory is development-only and is not linked from the live game.

No image generation, external API, paid service, or game behavior was implemented.
No original character or clothing asset was moved, overwritten, or deleted.

## Approved plan adjustments recorded here

- **Generation request architecture:** the production flow is not required to finish
  image generation, transparency processing, dual-gender fitting, and Blob
  uploads inside one synchronous Vercel request. The initial private pilot may
  begin synchronously if measured latency fits Vercel limits, but the data
  contract already includes `generationJob`, explicit statuses, and polling-
  compatible result objects so it can move to asynchronous jobs without changing
  the client schema or redesigning the workflow.
- **Initial category scope:** generation and calibration target **Clothes → Upper**
  and **Clothes → Lower** only. `shoes` and `accessory` remain in the schema for
  compatibility, but their generation, fitting, and calibration are deferred.
- **Wardrobe structure:** no Dress category/tab/layer. Dresses remain in Upper
  with internal full-body metadata; coats/jackets remain in Upper without
  lower-clearing metadata.

---

## 1. Verified asset geometry

### Character base canvases
Both files are exactly **320×700 RGBA PNG** with transparent backgrounds.

| Asset | Dimensions | Mode | Alpha bounding box |
|---|---:|---|---|
| `doll.png` (girl) | 320×700 | RGBA | `(43, 35, 273, 688)` |
| `boydoll.png` (boy) | 320×700 | RGBA | `(43, 43, 267, 692)` |

Coordinate origin is top-left. All clothing layers are authored onto the same
320×700 transparent canvas.

### Worn Upper/Lower clothing
Every non-preview file in `clothes/` that is used as a worn layer is
**320×700 RGBA**. Representative alpha bounds:

| Asset | Alpha bbox | Notes |
|---|---|---|
| `clothes/gömlek1.png` | `(59, 264, 260, 451)` | girl shirt |
| `clothes/sweat1.png` | `(63, 254, 256, 433)` | girl sweatshirt |
| `clothes/tişört1.png` | `(76, 276, 243, 450)` | girl short-sleeve |
| `clothes/boygömlek1.png` | `(69, 253, 243, 450)` | boy shirt |
| `clothes/boysweat.png` | `(58, 250, 259, 434)` | boy sweatshirt |
| `clothes/boytişört1.png` | `(76, 268, 238, 432)` | boy short-sleeve |
| `clothes/pantolon.png` | `(99, 395, 218, 631)` | girl trousers |
| `clothes/eşofman.png` | `(96, 398, 222, 635)` | girl tracksuit |
| `clothes/etek1.png` | `(75, 389, 245, 522)` | girl skirt |
| `clothes/etek2.png` | `(64, 386, 255, 628)` | girl longer skirt |
| `clothes/boypantolon1.png` | `(94, 406, 224, 633)` | boy trousers |
| `clothes/boyeşofman.png` | `(98, 412, 223, 642)` | boy tracksuit |
| `clothes/boyşort1.png` | `(96, 411, 222, 529)` | boy shorts |

### Other observations
- **Preview assets are not worn assets.** `*-removebg-preview.png` files have
  arbitrary dimensions and cropped framing. They must never be used for fitting.
- Worn hair, face, and shoes assets are also 320×700, but they are outside the
  first MVP scope.
- Worn accessories in `accesor/` are **not** 320×700 (roughly 290–312 × 642–696);
  the accessory menu is also currently empty. Accessories are therefore
  intentionally deferred and treated as schema-compatible but not calibrated.
- No dress or coat artwork exists in the repository. There is no `.dress`
  panel, CSS rule, selector, or Dress tab; Upper is the only upper/full-body
  wardrobe slot.
- Existing Upper/Lower assets are already aligned to the character canvas; the
  target boxes below were derived from their actual alpha bounds.

---

## 2. Character landmarks (Phase 0 drafts)

These are measured from the real alpha silhouettes, not example coordinates.
They remain drafts until checked visually on both dolls.

### Girl (`doll.png`)
| Landmark | Approx. point |
|---|---|
| headTop | (159, 35) |
| headCenter | (159, 140) |
| neck | (159, 266) |
| shoulderL / shoulderR | (105, 305) / (214, 305) |
| chestL / chestR | (119, 345) / (198, 345) |
| waistL / waistR | (119, 360) / (198, 360) |
| hipL / hipR | (103, 438) / (214, 438) |
| crotch | (159, 460) |
| kneeL / kneeR | (127, 550) / (191, 550) |
| ankleL / ankleR | (130, 650) / (189, 650) |
| footL / footR | (132, 680) / (185, 680) |
| elbowL / elbowR | (90, 390) / (227, 390) |
| wristL / wristR | (75, 421) / (243, 421) |

### Boy (`boydoll.png`)
| Landmark | Approx. point |
|---|---|
| headTop | (157, 43) |
| headCenter | (157, 145) |
| neck | (157, 264) |
| shoulderL / shoulderR | (100, 305) / (218, 305) |
| chestL / chestR | (117, 345) / (198, 345) |
| waistL / waistR | (117, 360) / (198, 360) |
| hipL / hipR | (105, 425) / (212, 425) |
| crotch | (157, 440) |
| kneeL / kneeR | (124, 550) / (197, 550) |
| ankleL / ankleR | (129, 650) / (197, 650) |
| footL / footR | (129, 680) / (195, 680) |
| elbowL / elbowR | (85, 390) / (232, 390) |
| wristL / wristR | (70, 415) / (248, 415) |

Key proportion differences: the boy has broader shoulders, a higher crotch
(y≈440 vs ≈460), and slightly longer legs. The girl profile must not be reused
for the boy.

---

## 3. Fit profiles

Files:
- `fit-profiles.girl.json`
- `fit-profiles.boy.json`

Both use `profileVersion: "0.1.0"` and
`status: "draft-needs-visual-signoff"`.

The profiles are split by gender and by slot/subtype:

- `upper`: `standard`, `tshirt`, `oversized`, `outerwear`
- `lower`: `pants`, `skirt`, `shorts`, `tracksuit`
- `fullbody`: `dress`, `gown`, `tulum`

Every subtype records:
- `targetBox` — where the alpha-trimmed master should land.
- `safeBox` — the allowed overflow/sleeve/hem area.
- `targetAnchors` — neck/shoulder/waist/hip/hem/sleeve landmarks.
- `fitMode` — affine or affine-first/mesh-likely.
- `coversLower` — true only for full-body garments. Lower-slot garments keep
  this false; they occupy the lower layer rather than hiding it.
- `notes` — measured source evidence and calibration warnings.

### Affine-first candidates
Likely sufficient initially:
- standard shirts, T-shirts, sweatshirts, oversized tops
- straight trousers, shorts, tracksuits
- simple skirts with limited flare

### Mesh-warp candidates
Likely to need mesh warp after visual testing:
- dresses, gowns, and tulum/jumpsuits
- strongly flared, pleated, tiered, or asymmetric skirts/dresses
- long coats and jackets with lapels, shoulder shaping, or long hems
- wide-leg trousers where hem shape matters
- any garment where the girl/boy shoulder–waist–hip–hem relationship distorts
  under a single affine transform

No fit is considered final until the overlays and representative tests on both
dolls are visually approved.

---

## 4. Calibration artifacts

- `calibration-overlay-girl.png`
- `calibration-overlay-boy.png`

Generated from the measured profiles at 2× scale. They show:
- the 20 px / 100 px grid,
- landmarks,
- representative target boxes:
  - blue: upper/standard
  - orange: upper/outerwear
  - green: lower/pants
  - purple: lower/skirt
  - pink: fullbody/dress.

- `calibrate.html` — interactive, standalone overlay viewer. It is not linked
  from the game and makes no external requests.

Run it from the repository root:

```bash
python -m http.server 8000
# open http://localhost:8000/phase0/calibrate.html
```

If opened via `file://` and profile `fetch()` is blocked, use the two profile
file inputs on the page.

---

## 5. Test set

`test-set.json` contains 18 cases:
- 13 existing Upper/Lower garments with recorded 320×700 alpha bboxes.
- 5 future-generated cases: dress, gown, coat, oversized top, wide-leg pants.

Each case records:
- wardrobe slot (`upper` / `lower`) and separate profile slot/subtype,
- garment kind,
- expected fit mode,
- whether the lower layer should remain visible,
- source asset and alpha bbox for available cases.

Expected rules:
- ordinary Upper: lower remains visible;
- Lower: occupies lower, lower remains visible;
- full-body Upper (dress/gown): `coversLower: true`, lower hidden;
- coat/jacket: `coversLower: false`, lower remains visible;
- no Dress category or layer.

---

## 6. Data contracts

`asset-contract.schema.json` defines:
- `garmentMaster`
- `fittedAsset` (320×700 transparent, per gender)
- `wardrobePreview` (large preview, separate from worn asset)
- `thumbnail`
- `fitTransform` / `fitProfile`
- `generationResult`
- `generationJob` (for future async transition)
- `designRecord` (accepted/regeneration history)
- `sourceRef` with Draw Your Own `dollPlacement`

Key rules encoded:
- one master, two fitted variants (girl/boy), no independent generation;
- fitted worn assets are 320×700 transparent PNGs;
- previews/thumbnails are separate and are not resized into worn assets;
- full-body garments use `coversLower: true`; coats/jackets use `false`;
- `variants.girl` and `variants.boy` are required before acceptance;
- generation results and jobs carry explicit status values so a synchronous
  pilot can later transition to polling/async jobs without changing the client
  data model.

MVP scope note: generation and calibration currently target **Clothes → Upper**
and **Clothes → Lower** only. `shoes` and `accessory` remain in the schema for
compatibility but are not calibrated or implemented in the first MVP.

---

## 7. Dynamic wardrobe integration findings

The existing layer system can display generated assets, but the wardrobe is
currently static:

- Menu buttons are hand-written HTML; `allOptButtons` is a one-time
  `querySelectorAll` at `script.js:333`.
- Therefore adding items to `assets.js` does **not** add them to the wardrobe.
- A dynamic registry is required for accepted designs, plus event delegation or
  a shared equip function so newly created buttons work without reload.
- Generated worn PNGs can use the existing `data-item` + `layer-upper` /
  `layer-lower` mechanism.
- Generated full-body Upper items must set `data-garment-kind="dress"` and
  `data-covers-lower="true"`; coats/jackets must omit those markers.
- `doll_dressing_saves` stores layer IDs → `src`; stable Blob URLs can work, but
  asset IDs plus URL resolution are safer for deleted/expired Blobs.
- Existing saved dolls and saved designs must remain untouched; new registry
  records should be additive and feature-flagged.
- The existing UI can show both fitted variants before acceptance by rendering
  the two 320×700 previews over `doll.png` / `boydoll.png` in a studio preview;
  no wardrobe mutation is needed until the user confirms.

---

## 8. Validation performed

`analyze_assets.py` performs the reproducible checks:

```bash
python -I phase0/analyze_assets.py
```

It verifies:
- base dolls are 320×700 RGBA;
- every non-preview `clothes/` asset is 320×700 RGBA;
- every profile landmark/target/safe box is inside the canvas;
- target boxes are inside safe boxes;
- lower garments do not set `coversLower`;
- full-body garments set `coversLower`;
- outerwear does not set `coversLower`;
- available test-set assets exist, are 320×700 RGBA, and match recorded alpha
  bounding boxes;
- every available test-set source bbox is contained inside its target box;
- overlays are regenerated.

Also validated:
- JSON syntax for all Phase 0 JSON files (Python and Node).
- Inline calibration JavaScript syntax (`node --check`).
- Overlays were visually inspected.

No live game files are referenced for modification by these checks.

---

## 9. Open issues / decisions

- Visual sign-off of the landmark and target-box profiles on both dolls.
- Whether the initial affine fit is acceptable for simple skirts/coats, or
  whether mesh warp should be added to the first fitting phase.
- Provider pilot (OpenAI first candidate) is not started; no API was connected.
- The representative generated test images (dress, gown, coat, wide-leg pants)
  do not exist yet; future cases in `test-set.json` are placeholders.
- Synchronous vs async generation decision remains open; the schema includes
  `generationJob` and statuses to support an async transition.
- The master image resolution/aspect policy is not fixed yet.
- Public quota infrastructure (KV/Redis) is a public-release decision, not a
  Phase 0 implementation.

---

## 10. Phase 0 files

Created (all isolated under `phase0/`):
- `README.md`
- `fit-profiles.girl.json`
- `fit-profiles.boy.json`
- `asset-contract.schema.json`
- `test-set.json`
- `calibrate.html`
- `analyze_assets.py`
- `calibration-overlay-girl.png`
- `calibration-overlay-boy.png`

No existing project file was modified.
