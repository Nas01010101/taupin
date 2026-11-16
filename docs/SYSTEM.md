# Taupin system

Taupin compares five-year crop rotations for one Quebec field. The comparison covers soil, water,
nitrogen and pests. NASA data comes first: rain, soil moisture, soil temperature and plant cover.
The farmer's photos and notes come second and change the comparison for that field. The farmer and
the agronomist make the decision.

The demo video (`docs/assets/`, 40 s and 90 s cuts) shows the steps below. Each row names the part of
the repo that does it.

| Video scene | What the app does | Code |
|---|---|---|
| What we built | A 3D model of a 600 m square, 300 x 300 cells of 2 m, with satellite layers | `web/js/scene.js`, `web/js/layers.js`, `src/taupin/layers.py`, `src/taupin/terrain.py` |
| NASA data first, photos second | Satellite and weather inputs are baked per field; the photo is an extra input on top | `src/taupin/bake.py`, `weather.py`, `smap.py`, `fieldrisk.py` |
| The farmer adds what satellites can't see | Four note types pinned on the field: soil insect, standing water, ground cover, water channel | `web/js/mapnotes.js`, `web/js/finds.js` |
| Here is an example | The Bois-de-Liesse park square, 45.5013 N, 73.7651 W (`?field=demo`), visited on 15 November 2026 | `web/data/field.json` |
| The prediction after our visit | "Is this an active crop field?" Half or more of the square under lidar canopy of 3 m or more means no. The park square has 68 % of 36 ha under trees and 1.3 ha of open ground | `web/js/cropcheck.js`, `web/test/cropcheck.test.mjs` |
| Each photo updates the comparison | A photo goes through the photo model, gets pinned on the 3D field, and re-ranks the rotations | `web/js/classify.js`, `web/js/model.js`, `web/js/engine.js`, `web/js/soilwater.js` |
| The field keeps its memory | Notes and photos stay with the field across seasons, in the browser's storage | `web/js/memory.js`, `web/js/memoryui.js` |

The video ranks four rotations. The app ranks seven (`web/data/rotations.json`).

## Inputs

| Source | Used for | Code |
|---|---|---|
| NASA GPM IMERG daily rain via NASA POWER, 2001 to 2025 | rotation water need, heavy-rain days on bare soil | `src/taupin/weather.py` |
| NASA SMAP L4 root-zone soil moisture, 252 dates, 2015 to 2025 | check of the POWER wetness input (anomaly r = 0.78) | `src/taupin/smap.py` |
| NASA POWER (MERRA-2) TSOIL1, GWETROOT, T2M | trap week (soil at 12 °C), field risk features | `src/taupin/fieldrisk.py`, `web/js/power.js` |
| NASA HLS v2 (Landsat 8/9 and ESA Sentinel-2), 30 m, 2020 to 2025 | plant cover (NDVI) layer | `src/taupin/fetch_layers.py` |
| USGS Landsat 8/9 surface temperature, 2016 to 2025 | where the soil warms first | `src/taupin/fetch_layers.py` |
| AAFC Annual Crop Inventory, 2011 to 2025 | crop history per field, preset rotation | `src/taupin/crophist.py` |
| NRCan HRDEM lidar, 1 m | relief, slope, wetness index, canopy height, tree crowns | `src/taupin/terrain.py` |
| IRDA and AAFC CanSIS soil maps | soil units, organic matter | `src/taupin/soil.py`, `src/taupin/organic.py` |
| RAP Grandes cultures wireworm method | ten trap points, count threshold | `web/js/scout.js` |

## Models

- **Field risk.** L2 logistic regression with four inputs: light soil, years in forage, spring
  root-zone wetness and winter minimum soil temperature. It was trained on 82 fields from Labrie et al.
  2020. Leave-one-field-out AUC is 0.80 (95 % CI 0.63 to 0.93). The output is a rank in thirds, not a
  probability. `src/taupin/fieldrisk.py`, `web/js/fieldrisk.js`.
- **Photo model.** DINOv2-S with an 8-class head (wireworm, click beetle, corn rootworm, white grub,
  ground beetle, millipede, earthworm, other), int8 ONNX, run in the browser. It scores 0.925 on 756
  sealed test photos. Below a confidence of 0.892 the answer is "unclear: send to the lab".
  `web/model/`, `src/taupin/classify.py`.
- **Rotation engine.** Rules with one source per rule. Each rule scores pest levels per year and the
  soil and water columns: dry-year water, bare-soil heavy rain, USLE cover, nitrogen and residue.
  `src/taupin/engine.py`, `web/js/engine.js` (parity checked by `src/taupin/engine_parity.py`).

Measured limits for each model are in [`PROJECT.md`](PROJECT.md#models).

## Outputs

- Trap week and ten trap points on the 3D field, exportable as CSV, GPX and GeoJSON.
- Wireworm count against the threshold for the coated-seed prescription.
- Seven rotations over five years, ranked by the farmer's priorities, with the evidence behind each rank.
- A field record: photos, notes and counts per season.

## Run

```sh
./run.sh            # Linux; run.command on macOS, run.bat on Windows
# or
PYTHONPATH=src python3 -m taupin --port 8801
```

Open `http://127.0.0.1:8801/`. `?field=demo` opens the park square from the video. `?field=laval`,
`eustache` or `mirabel` opens a farm field. `?demo=1` plays the scripted photo walk-through.
`?lang=fr` switches to French.

Tests: `node --test web/test/*.test.mjs` and `PYTHONPATH=src uv run --group dev python -m pytest`.
