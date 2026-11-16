# Taupin roadmap: from three Quebec fields to any field

English · [Français](ROADMAP.fr.md)

State on 2026-11-15. This file lists what Taupin is meant to become, what exists today, the gap
between the two, and the work in order. It sits next to `docs/PROJECT.md` (current state and
gaps of the hackathon build).

## 1. What Taupin is meant to be

An assistant for farmers. It models their field from satellite and public data, predicts the
properties that matter for a crop plan, and holds a database where they compare rotations. The
farmer chooses the rotation; Taupin shows the numbers, their range and their source.

- **Their field, modelled.** A 3D view of the field built from lidar or a global elevation model,
  with plant vigour, soil warmth, wet areas and crop history from NASA, ESA and CSA missions.
- **Predictions for every field property.** Organic matter, texture, available water,
  drainage, soil moisture through the season, erosion, nitrogen need, pest pressure and expected
  crop vigour, each with a range and its source. Shown only where held-out tests support it.
- **A rotation database.** Any rotation the farmer enters, scored year by year on their field,
  and compared with what similar fields actually grew and how they did.
- **The farmer's knowledge first.** Crop history, soil tests, trap counts, yield and photos the
  farmer enters override the public data and update every prediction.

Scope grows in three steps: Quebec first (where the pest rules and soil maps are), then Canada
and the United States, then any country where the global data holds up.

## 2. What exists today

| Part | Where | Limit |
|---|---|---|
| 3D field, 300 x 300 cells of 2 m, lidar relief, HLS vigour, Landsat soil warmth, wetness index, soil units, organic matter, crop history | `src/taupin/layers.py`, `src/taupin/fetch_layers.py`, `web/js/scene.js`, `web/js/layers.js` | baked offline for three Quebec farm fields and a demo park only |
| Farmer inputs: location, crop history per year, priorities, tillage, own rotation, trap counts, photos | `web/js/history.js`, `web/js/swui.js`, `web/js/scout.js`, `web/js/finds.js` | stored on the device only; not used to improve any model |
| Rotation scoring: dry-year water (GPM rain vs FAO-56), heavy rain on bare soil, USLE cover factor, nitrogen to buy, residue, wireworm and rootworm levels | `web/js/soilwater.js`, `web/data/crops.json`, `web/data/rotations.json` | rule-based; seven fixed rotations; no yield effect of the previous crop; no cover crops; soil loss is relative, not t/ha |
| Pest rule engine (Quebec RAP thresholds) | `src/taupin/engine.py`, `web/js/engine.js` | Quebec rules only |
| Field risk model, AUC 0.80 on 82 Quebec bait-trap fields | `risk/`, `src/taupin/fieldrisk.py`, `web/js/fieldrisk.js` | whole-field rank, not a probability; one study region |
| Trap date and field rank for any coordinates from NASA POWER | `web/js/power.js` | the 3D view and pest table stay on a baked field |
| Organic matter: soil survey per field, SoilGrids for any point | `src/taupin/organic.py`, `web/js/organic.js` | no model; values shown as given |
| Insect photo classifier, DINOv2-S, 8 classes, in the browser | `model/`, `web/js/classify.js` | no Quebec field photos in the test set |
| Offline web app, French and English | `web/`, `web/js/i18n*.js` | none relevant here |

Measured on 2026-11-15: lidar terrain features do not predict HLS NDVI on open cropland across
the three baked fields (leave-one-field-out Pearson r: Laval 0.36, Saint-Eustache -0.28,
Mirabel -0.09; ridge regression on 30 m cells, cells with tree canopy excluded). Per-field
prediction needs training data from many fields, not three.

## 3. Gap between the two

| Capability | Today | Needed | Blocking item |
|---|---|---|---|
| 3D model of any field | 3 baked fields | built on request for any field the farmer draws | a bake service, or a browser-side builder working from tiled public layers |
| Field boundary | fixed 600 m square | the farmer's own field outline | map drawing tool; optional boundary detection |
| Property predictions | survey and SoilGrids values shown as is; no ranges for most properties | per-field predictions with ranges for soil, water, erosion, nitrogen, pests, vigour | trained models on thousands of fields, grouped validation |
| Crop vigour per rotation | not predicted | expected vigour per crop and year given the rotation | rotation-effect model (work started in `rotation_ml/`) |
| Rotation database | 7 fixed rotations | any rotation the farmer enters, plus what similar fields grew | rotation editor; field-similarity index over the training fields |
| Farmer data improving the model | stored locally, unused | opt-in sharing used as labels | consent flow, anonymised upload, retraining pipeline |
| Regions beyond Quebec | Quebec pest rules and soil maps | per-region data adapters and rules | adapters listed in section 5 |
| Yield | not handled | yield where farmers share yield maps; vigour elsewhere | yield-map import (ISOXML, shapefile, CSV) |

## 4. Work plan

Each workstream lists the files to write or change and the test it must pass before it ships.

### W1. Rotation-effect model (started)

Predict next-year crop vigour from the rotation, soil, terrain and weather.

- Write: `rotation_ml/sample.py` (points from the AAFC crop inventory, 2011 to 2025),
  `rotation_ml/ndvi.py` (HLS peak NDVI per point and year, Fmask), `rotation_ml/features.py`
  (SoilGrids, NASA POWER, GPM, SMAP, terrain, previous crops), `rotation_ml/train.py`,
  `rotation_ml/README.md`.
- Target: peak NDVI minus the regional mean for that crop and year.
- Validation: grouped by region and by year.
- Gate: on held-out regions, corn after soybean scores above corn after corn. If it does not,
  NDVI is too weak a label and W6 (yield maps) comes first.
- Then change: `web/js/soilwater.js` and `web/js/swui.js` to show predicted vigour with its range
  next to the rule-based columns; `web/data/` gets the exported model.

### W2. Property models

One model per property, each with a held-out test and a range.

| Property | Inputs | Labels | Gate |
|---|---|---|---|
| Organic matter, texture | HLS bare-soil composites, lidar terrain, SoilGrids | CanSIS and IRDA survey points; SSURGO in the US | beats SoilGrids alone on held-out survey points |
| Available water, drainage class | texture, terrain, wetness index | soil survey classes | held-out class accuracy reported per class |
| Soil moisture through the season | SMAP, GPM rain, texture, FAO-56 water balance | SMAP and in situ stations (e.g. AAFC/RISMA in Canada) | error vs stations reported |
| Erosion, t/ha a year | USLE: R from GPM rain, K from texture, LS from relief, C from rotation | published plot data where available | reported as an estimate with range; no gate beyond plausibility checks |
| Nitrogen need | crop, previous crop, organic matter | provincial and state rate tables | matches the tables it is built from |
| Pest pressure | field risk model, crop history, soil | bait-trap studies per region | AUC on held-out fields |

- Write: `src/taupin/props/` (one module per property, each under 500 lines), `tests/test_props_*.py`.
- Change: `web/js/layers.js` to add predicted layers with a range legend; `web/js/organic.js` to
  show model and survey side by side.

### W3. 3D for any field

- Write: `src/taupin/build_field.py` that takes a field outline and returns the same
  `field.json` and layer files the app reads today (`web/data/fields/<id>/`).
- Option A, server: a small service runs the bake on request and caches the result.
- Option B, browser: tiled public layers (Copernicus DEM, HLS composites, SoilGrids) read
  directly, lower resolution, no server.
- Start with A for Quebec, where HRDEM lidar exists; use B where no lidar exists.
- Change: `web/js/fields.js` (load a built field), `web/js/app.js` (draw a field, request a build),
  `web/index.html` (field drawing step).
- Gate: a field built on request matches the baked Laval field cell for cell.

### W4. Rotation database and comparison

- Write: `web/js/rotations.js` (rotation editor: any crops, any length, cover crops), a field
  similarity index (`rotation_ml/similar.py`) that finds training fields with close soil,
  climate and history, and shows what they grew and how their vigour went.
- Change: `web/data/rotations.json` becomes a starting list, not the full set; `web/js/swui.js`
  compares any two or three rotations side by side.
- Fill the known gaps in `docs/PROJECT.md` "Soil and water": soil water at sowing, cover crops,
  USLE in t/ha. The corn-after-corn yield penalty is done (Gagnon et al. 2019).

### W5. Farmer data in, with consent

- Write: an export of the farmer's corrections, trap counts, finds and yields as one file they
  can share; an optional anonymised upload; a retraining script that adds shared labels.
- Change: `web/js/memory.js` (what is stored), `web/js/ui.js` (consent screen in plain words).
- Rule: nothing leaves the device without the farmer choosing it. No account required to use
  the app.

### W6. Yield maps

- Write: importers for common yield-monitor exports (shapefile, CSV, ISOXML); cleaning (speed,
  header, overlap filters).
- Use: as labels for W1 where shared; per-field yield zones in the 3D view.

### W7. Expansion adapters

- Write: `src/taupin/regions/<region>.py`, each mapping the app's layer keys to that region's
  sources (section 5) and declaring which rules apply.
- Change: `src/taupin/engine.py` loads thresholds per region instead of the Quebec RAP constants;
  `web/js/i18n*.js` gains languages per region.

## 5. Data per region

| Layer | Quebec (now) | Canada | United States | World |
|---|---|---|---|---|
| Relief | NRCan HRDEM lidar, 1 m | HRDEM where covered, CDEM elsewhere | USGS 3DEP lidar | Copernicus DEM GLO-30, 30 m |
| Crop history | AAFC Annual Crop Inventory | same | USDA NASS Cropland Data Layer | ESA WorldCereal; farmer-entered history |
| Vigour | NASA HLS (Landsat 8/9, Sentinel-2) | same | same | same |
| Soil warmth | Landsat thermal | same | same | same |
| Soil | IRDA map, CanSIS | CanSIS, Soil Landscapes of Canada | SSURGO / gSSURGO | ISRIC SoilGrids 2.0 |
| Weather, rain, soil moisture | NASA POWER, GPM IMERG, SMAP | same | same | same |
| Radar | CSA RCM (inside the AAFC crop map) | RCM direct layer | Sentinel-1 | Sentinel-1 |
| Pest rules | RAP / MAPAQ | provincial guides | state extension guides | per country, or pest layer off |
| Yield statistics | Statistics Canada | same | USDA NASS county yields | national statistics |

NASA and ESA layers (HLS, POWER, GPM, SMAP, Sentinel-1) are global, so the field model and the
rotation scores carry across regions. The regional parts are crop history, soil maps, lidar and
pest rules.

## 6. Phases

| Phase | Scope | Done when |
|---|---|---|
| 1. Quebec | W1, W2 (organic matter, texture, water), W3 option A, W4 | a farmer draws a Quebec field and gets the 3D view, predicted properties with ranges, and a comparison of any rotations, with W1 past its gate |
| 2. Canada and US | W7 adapters for Ontario, the Prairies and the US Corn Belt; W5; W6 | the W1 and W2 gates pass on held-out regions in each new area |
| 3. World | W3 option B; WorldCereal and SoilGrids adapters; pest layer per country or off | gates pass on held-out countries; every layer states its resolution and source |

Before phase 2: test with two or three Quebec farmers through an agri-environmental advisory
club, and change the app from what they say.

## 7. How it stays a tool for farmers

- It gives numbers, ranges and trade-offs. It does not tell a farmer what to plant.
- What the farmer enters outranks the satellite, everywhere.
- Every number has a source and a range one tap away; "not enough data" is a valid answer.
- No account. Data stays on the device unless the farmer shares it.
- Works offline after the field is built. French and English first, then the languages of each
  new region.
- One-page export for the farmer's agronomist.

## 8. Risks

| Risk | Effect | Response |
|---|---|---|
| NDVI does not track yield closely enough | W1 predictions mislead | W1 gate; yield maps (W6) as labels |
| Public soil maps are coarse (SoilGrids 250 m) | property maps look sharper than they are | ranges shown; farmer soil tests override |
| Crop history missing outside Canada and the US | rotation features weak | farmer enters history; WorldCereal for recent years |
| Pest rules do not transfer between regions | wrong thresholds | pest layer per region, off where no rules exist |
| Running a bake service costs money | 3D on request stalls | cache built fields; browser builder (W3 option B) |
| Farmer data privacy | loss of trust | local-first storage, opt-in sharing, anonymised upload |

## 9. Open items to check

- Licence of each regional source before it ships (IRDA terms not yet checked, see `DATA_SOURCES.md`).
- Field-boundary datasets and their licences, for W3 boundary detection.
- In situ soil moisture station access in Canada and the US for the W2 moisture gate.
