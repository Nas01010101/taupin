# Taupin: project file

NASA Space Apps 2026, challenge "Field Shift: Adapting Farms with NASA Data".
Last updated 2026-11-16.

## What it does

A farmer picks a field on a map. Taupin builds the field in 3D in the browser, checks whether the
square is an active crop field, and ranks seven five-year rotations (2026 to 2030) on dry-year
water, heavy rain on bare soil, USLE cover, nitrogen to buy, residue and pests. NASA data sets the
ranking; the farmer's photos and notes, pinned on the 3D field, change it for that field. The
farmer and the agronomist make the decision.

## Prior work

VFF QC (CÉROM and MAPAQ, 2017, https://cerom.qc.ca/vffqc/) predicts a wireworm risk level per field
from close to 800 Quebec fields, inside Info-Sols, with an account. Taupin's field risk model is
fitted on 82 public fields, about a tenth of that data. It is an open complement, not a stronger
predictor.

| VFF QC | Taupin |
|---|---|
| one risk level for the current year | seven rotations over five years, ranked on soil, water and pests |
| no weather or satellite input | NASA GPM IMERG rain, POWER soil temperature and wetness, SMAP, HLS |
| identification by sending samples | photo model in the browser, with the lab as the fallback |
| account required, model and data not published | open code, open model, public data, runs offline |

## Data

| Source | Variables | Used for |
|---|---|---|
| NASA GPM IMERG via POWER (`IMERG_PRECTOT`), POWER `T2M_MAX`, `T2M_MIN`, 2001 to 2025 | daily rain, air temperature | rotation water need, heavy-rain days on bare soil |
| NASA POWER daily point API (MERRA-2) | `TSOIL1`, `GWETROOT` | two of the four field risk inputs |
| NASA SMAP L4 root-zone soil moisture, GIBS, 252 dates, 2015 to 2025 | m3/m3 | check of the POWER wetness input (anomaly r = 0.78, 126 months) |
| NASA HLS v2.0 (L30 and S30), 2020 to 2025 | NDVI | plant cover layer of the 3D field |
| Landsat 8/9 Collection 2 Level-2, 2016 to 2025 | surface temperature | spring warm and cold parts of the field |
| FAO-56, OMAFRA 23-005, CRAAQ and MAPAQ grids, Lal 2005, CGQ yields, Gagnon et al. 2019 | crop coefficients, USLE C, nitrogen rates, residue ratios, corn-after-corn yield loss | rotation columns (`web/data/crops.json`) |
| NRCan HRDEM lidar, 1 m; AWS Terrain Tiles elsewhere | terrain, canopy height | relief, slope, wetness index, crop field check |
| IRDA soil map (1:20 000), AAFC CanSIS tables, ISRIC SoilGrids 2.0 | soil units, texture, organic matter | soil layer; organic matter for any point |
| AAFC Annual Crop Inventory, 2011 to 2025 | crop per year | crop history and preset rotation for the Quebec farm fields |
| Labrie et al. 2020, PLoS ONE 15(2): e0229136, CC BY 4.0 | bait-trap counts and field covariates, 82 fields, 2012 to 2016 | labels and covariates of the field risk model |
| iNaturalist, GBIF and Wikimedia Commons photos | open-licence images, credits in `data/attribution.csv` | photo model |

`DATA_SOURCES.md` lists every layer with its source, licence and access date.

The demo field (`?field=demo`) is a 600 m square in the Parc-nature du Bois-de-Liesse, centred on
45.5013 N, 73.7651 W, visited on 15 November 2026. It is a park, not a crop field: 68 % of its 36 ha
is under lidar canopy of 3 m or more, and the crop field check says so.

## Models

### Photo model

DINOv2-S fine-tuned, classes: wireworm, click beetle, corn rootworm, white grub, ground beetle,
millipede, earthworm, other. Numbers from `model/metrics.json`:

| Split | n | Accuracy | Accuracy above the abstain threshold | Share answered | Wireworm named (argmax) |
|---|---|---|---|---|---|
| Validation | 976 | 0.946 | 0.981 | 0.900 | 58 of 61 |
| Sealed test | 756 | 0.925 | 0.975 | 0.849 | 51 of 55 |
| Outside sources, audited | 491 | 0.927 | 0.974 | 0.853 | 17 of 19 |

Below a confidence of 0.892 the app answers "unclear: send to the lab". The previous version
(EfficientNet-B0) scores 0.861 on the same test photos and 0.862 on the same outside photos.

Limits, as measured:

- The outside set was audited by eye by one person, after a poor wireworm result prompted a look:
  157 of 648 images were removed (`data/ood_audit.csv`). On all 648 the model scores 0.765.
- 92 of the 157 removed images still got an answer instead of "unclear". A photo that shows no
  soil animal can get a confident name.
- The 0.892 threshold (98 % validation target) was chosen after the 95 % and 98 % targets had both
  been scored on test and outside photos.
- Museum and lab specimens score 0.771 (n 48) against 0.944 for field photos (n 443).
- No test photo was taken in a Quebec field.

### Field risk model

Question: which fields reach 1 wireworm per bait trap? The answer feeds the pest column of the
ranking.

- Labels: bar heights read from Figures 1 and 3 of Labrie et al. 2020 (`risk/digitize.py`),
  82 fields, 11 at or above 1 per trap.
- Features: light soil, years in forage (asked of the farmer), spring root-zone soil wetness and
  winter minimum soil temperature (NASA POWER).
- Model: L2 logistic regression, four features (`risk/fit.py`).

| Model | AUC, leave one field out | Year out | Region out | Weather cell out |
|---|---|---|---|---|
| Field covariates only | 0.67 | 0.44 | 0.54 | 0.70 |
| NASA POWER only | 0.75 | 0.77 | 0.72 | 0.77 |
| Shipped: 2 field + 2 NASA features | 0.80 (95 % CI 0.63 to 0.93) | 0.68 | 0.65 | 0.77 |

Limits, as measured:

- The four shipped features were chosen after seeing the cross-validation of the first three sets,
  so 0.80 is optimistic.
- The Brier score (0.110) is close to the base rate (0.116). The output is a rank in thirds, not a
  probability.
- 82 fields, 5 years, 15 weather cells: the weather features may partly stand for year and region.

## What the rotation ranking leaves out

| Gap | Effect on the ranking | Next step |
|---|---|---|
| Soil water stored at sowing is not counted | a crop sown early (wheat) looks drier than it is | FAO-56 Ch. 8 soil water balance started from SMAP or GWETROOT at sowing |
| No cover crops | wheat and soybean years keep bare soil after harvest | a cover crop option with its USLE C and nitrogen effect |
| USLE uses C only | soil loss is compared, not estimated in t/ha | A = R K LS C P from HRDEM slope and CanSIS texture |
| Buckwheat has no FAO-56 coefficient, Quebec nitrogen rate or CGQ yield | its rotation ranks after the fully scored ones | a measured coefficient and a CRAAQ rate |
| Equal weights, no yield or price | the ranking ignores income | farmer weights per priority; CGQ prices per crop |
| HLS, Landsat and soil map layers only for the prepared fields | a picked field gets terrain and NASA weather, not the satellite layers | fetch the layers for the picked square in the browser |
| No field trial with a farmer or agronomist | usefulness not measured | a trial with a Quebec grower |
