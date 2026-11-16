# Crop data research: Quebec and the rest of North America

Research for the rotation ranking (read 2026-11-15). Every number below has a source. A value with
no source found is listed as a gap, never filled in. The model inputs this covers are the per-crop
fields of `web/data/crops.json` (read by `web/js/soilwater.js`) and the pest classes of
`web/data/risk.json` / `src/taupin/engine.py`, plus which crops are actually grown in each region of
`web/data/regions.json`.

What the ranking needs for each crop:

| Field | Used for | Present today for |
|---|---|---|
| `kc` (ini, mid, end), `stages` (4 lengths, days) | Crop water need, dry-year shortfall, bare-soil days | corn, soybean, wheat |
| `plant_t10` | Sowing day from NASA POWER air temperature | corn, soybean (assumed), wheat |
| `usle_crop` | USLE cover factor (times tillage) | corn, soybean, wheat, buckwheat (assumed) |
| `n_need`, `n_credit_next` | Nitrogen to buy | corn, soybean, wheat |
| `yield_kg_ha`, `residue_ratio` | Residue returned (organic matter input) | corn, soybean, wheat |
| Grass host / prescription crop / rootworm host | Pest levels (`engine.py`) | corn, soybean, wheat, barley, oat, rye, canola, sod, buckwheat |

The history picker (`web/js/history.js` `PAST_CROPS`) already offers barley, oats, rye, canola and
hay/pasture, but `crops.json` has no values for them. This file supplies them.

---

## 1. Which crops farmers plant (relevance)

Mean of 2021 to 2025 for Canada (StatCan), 2022 to 2024 for the US (USDA NASS). Area is seeded
area for Canada and planted area for the US, except hay (harvested). Yields are kg/ha at market
moisture. Regions are the six points in `web/data/regions.json`. Canadian figures are provincial
and US figures are state totals, not the county the point sits in.

### Quebec (region `qc`, Montérégie) [STATCAN_FC], potatoes [STATCAN_POT]

| Crop | Seeded area (ha) | Yield (kg/ha) |
|---|---|---|
| Tame hay | 650 251 | 5 240 |
| Soybean | 411 376 | 3 096 |
| Grain corn | 359 560 | 9 568 |
| Wheat, all | 95 444 | 3 468 |
| — spring wheat | 65 506 | 3 147 |
| — winter wheat (remaining) | 24 540 | 4 319 |
| Silage corn | 74 753 | 36 131 |
| Oats | 63 798 | 2 645 |
| Barley | 34 242 | 3 155 |
| Rye, all | 25 782 | 3 265 |
| Potatoes | 18 600 | 34 074 |
| Canola | 14 359 | 2 323 |
| Mixed grains | 9 422 | 2 868 |
| Buckwheat | 4 483 | 1 265 |

The Quebec government's grain page also reports soybean (43 %) and corn (37 %) as 80 % of grain area,
with wheat third [QC_GRAINS].

### Ontario (region `on`, Chatham-Kent) [STATCAN_FC]

| Crop | Seeded area (ha) | Yield (kg/ha) |
|---|---|---|
| Soybean | 1 199 230 | 3 370 |
| Grain corn | 897 981 | 10 969 |
| Tame hay | 654 104 | 4 835 |
| Winter wheat (remaining) | 420 440 | 6 466 |
| Silage corn | 111 846 | 40 793 |
| Dry beans | 49 303 | 2 762 |
| Rye, all | 47 894 | 3 394 |
| Spring wheat | 33 160 | 4 015 |
| Oats | 30 285 | 3 425 |
| Barley | 24 405 | 3 839 |
| Canola | 20 847 | 2 761 |
| Potatoes | 15 593 | 25 555 |

### Prince Edward Island (region `pe`) [STATCAN_FC], potatoes [STATCAN_POT]

| Crop | Seeded area (ha) | Yield (kg/ha) |
|---|---|---|
| Tame hay | 42 602 | 4 998 |
| Potatoes | 34 366 | 33 962 |
| Barley | 22 749 | 3 556 |
| Wheat, all | 16 586 | 4 331 |
| Soybean | 13 195 | 2 882 |
| Grain corn | 6 020 | 8 670 |
| Oats | 2 924 | 2 645 |

### Saskatchewan (region `sk`, Saskatoon) [STATCAN_FC]

| Crop | Seeded area (ha) | Yield (kg/ha) |
|---|---|---|
| Wheat, all | 5 467 485 | 2 775 |
| Canola | 4 860 080 | 2 076 |
| — spring wheat (excl. durum) | 3 421 590 | 3 165 |
| — durum wheat | 2 002 542 | 2 103 |
| Lentils | 1 470 942 | 1 382 |
| Tame hay | 1 277 383 | 2 214 |
| Barley | 1 116 101 | 3 221 |
| Dry peas | 730 138 | 2 061 |
| Oats | 580 910 | 3 228 |
| Summerfallow | 303 647 | — |
| Flaxseed | 231 066 | 1 255 |

### Iowa (region `ia`, Story County) [NASS_2024]

| Crop | Planted area (ha) | Yield (kg/ha) |
|---|---|---|
| Grain corn | 5 247 428 | 12 805 |
| Soybean | 4 060 350 | 3 957 |
| All hay (harvested) | 428 967 | 7 076 (dry t basis as reported) |
| Oats | 62 726 | 2 917 |

### Idaho (region `id`, Magic Valley) [NASS_2024]

| Crop | Planted area (ha) | Yield (kg/ha) |
|---|---|---|
| All hay (harvested) | 531 488 | 8 586 |
| Wheat, all | 477 260 | 5 871 |
| — winter wheat | 307 561 | 6 008 |
| — other spring wheat | 167 270 | 5 649 |
| Barley | 223 926 | 5 954 |
| Grain corn | 141 640 | 13 076 |
| Potatoes | 126 802 | 47 636 |
| Sugar beets | 70 267 | 88 248 |
| Dry edible beans | 15 648 | 2 806 |
| Oats | 18 211 | 2 953 |

Unit conversions used for NASS: 1 acre = 0.404686 ha; bushel weights corn 56 lb (25.401 kg),
soybean and wheat 60 lb (27.216 kg), barley 48 lb (21.772 kg), oats 32 lb (14.515 kg);
1 cwt = 45.359 kg; 1 short ton = 907.185 kg. Most Idaho crops are irrigated, so these yields are
not comparable with the rain-fed water column of the app.

**What this means for the crop list.** Corn, soybean and wheat (already in) cover most of the area
in QC, ON and IA. The crops that matter and are missing from `crops.json`: **hay/pasture**
(the largest area in QC, PE, ID), **barley** and **oats** (all six regions), **canola** (second
crop by area in SK after wheat, present in QC/ON), **potato** (PE, ID, QC), and for the West
**lentils, peas** and **sugar beet**.

---

## 2. Per-crop parameters

Values for the crops already in `crops.json` are unchanged and left out unless a source below
adds to them. Source keys are listed in section 6.

### Water use (FAO-56)

Kc from FAO-56 Table 12 [FAO56_T12]; stage lengths (initial, development, mid, late, days) from
Table 11 [FAO56_T11]. Table 11 prints each row's values before the region they apply to.

| Crop | Kc ini | Kc mid | Kc end | Stages (days) | Table 11 row used |
|---|---|---|---|---|---|
| Barley | 0.3 | 1.15 | 0.25 | 20, 25, 60, 30 | "Barley/Oats/Wheat", sown March/April at 35 to 45° latitude (the row already used for wheat) |
| Oats | 0.3 | 1.15 | 0.25 | 20, 25, 60, 30 | same |
| Winter wheat | 0.4 (frozen soils) | 1.15 | 0.25–0.4 | 160, 75, 75, 25 | Idaho, USA, October sowing |
| Canola (rapeseed) | 0.35 | 1.0–1.15 | 0.35 | **no row in Table 11** | — |
| Potato | 0.5 | 1.15 | 0.75 | 25, 30, 45, 30 | Continental climate, May; Idaho row is 45, 30, 70, 20 (Apr/May) |
| Sugar beet | 0.35 | 1.20 | 0.70 | 50, 40, 50, 40 | Idaho, USA, April |
| Dry beans | 0.4 | 1.15 | 0.35 | 20, 30, 40, 20 | Continental climates, May/June |
| Lentil | 0.4 | 1.10 | 0.30 | 20, 30, 60, 40 | Europe, April |
| Peas (dry/seed) | 0.4–0.5 | 1.15 | 0.30 | 15, 25, 35, 15 | Europe, May; Idaho row is 35, 25, 30, 20 (April) |
| Alfalfa hay (averaged cuttings) | 0.40 | 0.95 | 0.90 | season from last to first −4 °C | Table 11 footnote 4 |
| Grazing pasture (rotated) | 0.40 | 0.85–1.05 | 0.85 | 7 days before last −4 °C to 7 days after first −4 °C | Table 11 footnote 4 |
| Buckwheat | **not in FAO-56** | | | | |

Notes:
- The FAO-56 Kc end for potato is 0.75; footnote 4 gives about 0.40 for long-season potatoes with
  vine kill. Sugar beet Kc end is 0.70 with no irrigation in the last month, up to 1.0 with rain.
- Peas "Dry/Seed" leaves Kc ini blank under the "Peas" row (fresh 0.5); the legume group value is 0.4.
- Canola: a Saskatchewan study measured grass-reference Kc of 0.35 (initial), 0.91 (development),
  1.17 (mid) and 0.78 (late), tied to growing degree days, not calendar days [SK_CANOLA_KC]. OMAFRA
  gives growing degree days (base 0 °C) for spring canola: emergence 152–186, flowering 759–852,
  swathing 1 432–1 557 [OMAFRA_811, Table 6–2]. These could be turned into stage lengths from the
  NASA POWER temperatures. That would be a Taupin computation, not a published day count.
- Buckwheat: OMAFRA gives 70 to 90 days from sowing to maturity, first flower 5 to 6 weeks after
  sowing, harvest at 10 to 12 weeks [OMAFRA_811, ch. 7]. This gives the season length but no Kc.

### Sowing rule

| Crop | Rule | Source |
|---|---|---|
| Barley, oats | Same as spring wheat: 10-day mean air temperature reaches 5 °C. FAO-56 states this for spring wheat; barley and oats share the "Barley/Oats/Wheat" stage row. Treat barley/oats as an assumption, stated as such | [FAO56_PLANT], [FAO56_T11] |
| Soybean | OMAFRA: "if soil temperature and moisture conditions are suitable for planting corn, they are generally also suitable for soybeans". This supports the current assumption (maize rule, 13 °C) and can replace "no source" in `crops.json` | [OMAFRA_811, ch. 2] |
| Canola (spring) | "Seed as early as soil conditions permit… 5 °C or higher is a reasonable target" (soil temperature, not air) | [OMAFRA_811, ch. 6] |
| Buckwheat | Minimum soil temperature 7 °C; earliest planting after the risk of frost has passed; frost-sensitive | [OMAFRA_811, ch. 7] |

The app's rule uses the 10-day mean **air** temperature. The canola and buckwheat thresholds are
**soil** temperatures, so they can't be dropped into `plant_t10` as they are. NASA POWER `TSOIL1`,
already fetched by the app, could be used for them.

### Soil loss (USLE crop type factor)

OMAFRA Factsheet 23-005, Table 4 [OMAFRA_USLE]: grain corn 0.40; silage corn, beans and canola 0.50;
cereals (spring and winter) 0.35; seasonal horticultural crops 0.50; fruit trees 0.10; hay and
pasture 0.02. Tillage factors (Table 5): fall plow 1.0, spring plow 0.90, mulch 0.60,
**ridge 0.35 and zone tillage 0.25** (both missing from `crops.json`), no-till 0.25.

| Crop | Factor | Note |
|---|---|---|
| Barley, oats, rye | 0.35 | "Cereals" |
| Canola | 0.50 | named in Table 4 |
| Hay / pasture (sod) | 0.02 | named in Table 4 |
| Silage corn | 0.50 | named in Table 4 |
| Potato, sugar beet | 0.50 | assumption: "seasonal horticultural crops"; Table 4 has no potato row |
| Buckwheat | 0.35 | assumption already in `crops.json` (counted as a cereal) |

### Nitrogen need (Quebec)

| Crop | kg N/ha | Source |
|---|---|---|
| Barley | 60–90 on fine soils (G1); 90 on medium/coarse (G2, G3); down to 30 on G1 with >5 % organic matter; 120 possible on G2/G3 with <3 % OM; malting barley max 60 | MAPAQ reference grid, wheat, oats and barley [MAPAQ_CEREAL_N] |
| Oats | G1: 50 (OM ≤ 4 %), 25 (OM > 4 %); G2/G3: 75 (OM ≤ 4 %), 25 (OM > 4 %) | [MAPAQ_CEREAL_N] |
| Spring wheat | 120; 90 on G1 with > 4 % OM (confirms the value in `crops.json`) | [MAPAQ_CEREAL_N] |
| Canola | 80–120 ("la grille du CRAAQ recommande d'appliquer entre 80 et 120 kg N/ha") | FPCCQ canola production guide, 2013, quoting the CRAAQ grid [FPCCQ_CANOLA] |
| Hay, grass (≤ 30 % legumes) | 140–220 by climate zone (degree-days base 0 °C) | MAPAQ reference grid, grasslands [MAPAQ_PRAIRIE_N] |
| Hay, mixed (31–50 % legumes) | 110–170 | [MAPAQ_PRAIRIE_N] |
| Hay, legumes (≥ 70 %) | 0–50 | [MAPAQ_PRAIRIE_N] |
| Buckwheat | **No Quebec grid found.** Ontario: maximum 35 kg/ha (southern Ontario), 55 kg/ha (northern Ontario); "fertility requirements similar to oats" | [OMAFRA_811, Table 7–1] |

The MAPAQ cereal grid gives the doses by soil texture group and organic matter. The app already
reads soil organic matter per map unit, so it could choose the right row instead of a mid-range.

### Nitrogen left for the next crop (previous-crop credit)

CPVQ 1996 table, as printed in Agri-Réseau feuillet 4B [CPVQ_CREDIT] (kg N/ha: roots only, roots and
stems at maturity, whole crop abandoned):

| Previous crop | Roots only | Roots + stems | Whole crop |
|---|---|---|---|
| Oats, barley, spring wheat, winter wheat, mixed grains, grain corn | 0 | 0 | 0 |
| Dry beans | 25 | 25 | 40–60 |
| Faba bean and lupin | 25 | 40 | 80–100 |
| Alfalfa (established) | 40–70 | 80–120 | 80–120 |
| Pasture/hay, ≥ 40 % legumes | 40–60 | 60–85 | 60–85 |
| Pasture/hay, ≥ 80 % legumes | 40–70 | 80–120 | 80–120 |

So barley and oats are 0. **Sod (hay/pasture) is not 0**: a legume-rich sod gives 40 to 85 kg N/ha.
This matters because the default field history is three sod years. Canola and buckwheat have no row.

### Yield (behind the residue)

Quebec 2021–2025 means from StatCan [STATCAN_FC]: barley 3 155, oats 2 645, rye 3 265, canola
2 323, **buckwheat 1 265** kg/ha (fills the buckwheat gap), tame hay 5 240, potatoes 34 074.
The regional tables in section 1 give the same for each region.

Check on the values in use: `crops.json` uses the Concertation Grains Québec 1981–2023 means
(corn 7 656, soybean 2 759, wheat 3 035). The 2021–2025 StatCan means are higher (corn 9 568,
soybean 3 096, spring wheat 3 147). The long-term mean understates current residue. The team
should pick one period and state it.

### Residue ratio

Lal 2005 (the source in use) is paywalled. I couldn't read its table, so no new Lal values are given.
IPCC 2006 Guidelines, Vol. 4, Ch. 11, Table 11.2 [IPCC_T11_2] is open and gives above-ground residue
dry matter as `slope × (yield × DRY) + intercept` (Mg/ha). Ratios worked out at Quebec yields:

| Crop | DRY | Slope | Intercept | Residue at QC yield (t DM/ha) | Ratio to harvested yield |
|---|---|---|---|---|---|
| Grain corn (check) | 0.87 | 1.03 | 0.61 | 9.18 | 0.96 (Lal: 1.0) |
| Soybean (check) | 0.91 | 0.93 | 1.35 | 3.97 | 1.28 (Lal: 1.0) |
| Spring wheat (check) | 0.89 | 1.29 | 0.75 | 4.36 | 1.39 (Lal: 1.5) |
| Barley | 0.89 | 0.98 | 0.59 | 3.34 | 1.06 |
| Oats | 0.89 | 0.91 | 0.89 | 3.03 | 1.15 |
| Rye | 0.88 | 1.09 | 0.88 | 4.01 | 1.23 (IPCC: no rye data, all-grain default) |
| Buckwheat | 0.88 | 1.09 | 0.88 | 2.09 | 1.65 (assumption: IPCC generic "Grains") |
| Potato | 0.22 | 0.10 | 1.06 | — | IPCC footnote: mean residue:tuber 0.27 |
| Alfalfa / non-legume hay | 0.90 | 0.29 / 0.18 | 0 | — | litter and harvest losses only |
| Canola | — | — | — | — | **no IPCC row** |

IPCC residue is dry matter and depends on yield; the app multiplies a fixed ratio by market-moisture
yield. If IPCC replaces Lal, it should replace it for every crop, not just the new ones, so all
the values share one method.

---

## 3. Pest classes (wireworm and corn rootworm)

| Crop | Wireworm (engine `GRASS`) | Class 3A prescription crop (QC) | Corn rootworm host |
|---|---|---|---|
| Barley, oats, rye, wheat, corn | Grass host (Poaceae) [RAP], [SAGUEZ]; AAFC: "small grains and clover… are good hosts" [AAFC_WW] | Yes: oats, wheat, barley, grain/silage/sweet corn [QC_3A] | Corn only [MAPAQ_CRW] |
| Hay / pasture | Host; damage worst after "pasture or cereal crops" [AAFC_WW] | — | No |
| Soybean | Not a grass | Yes [QC_3A] | No |
| Canola | Not a grass. Host status **unresolved**: AAFC shows brown mustard (another Brassica) is an "inadequate host", but canola was not tested; Alberta lists canola among crops the prairie grain wireworm attacks [AB_PGW] | Yes [QC_3A] | No |
| Buckwheat | Larval survival 15 % on buckwheat vs 44 % on barley [NORONHA]; two years of buckwheat cut wireworm damage to the next potato crop in PEI field trials [AAFC_WW] | No | No |
| Potato | Damaged crop, not a sustaining host in the engine's sense; Alberta lists potatoes as attacked [AB_PGW] | No | No |

The eight class 3A crops (coated seed needs an agronomist's prescription in Quebec) are oats,
wheat, canola, silage corn, grain corn, sweet corn, barley and soybean [QC_3A]. That matches
`risk.json` `prescription_crops`.

---

## 4. A rotation finding the ranking should know

OMAFRA Publication 811, Buckwheat: "Should Not Rotate With: Soybeans, edible beans, canola or
sunflowers", because all of them get white mould (sclerotinia), "a problem that affects soybeans,
dry edible beans, canola, sunflower and buckwheat". Its preferred rotation crops are corn and
cereals [OMAFRA_811, ch. 7].

Two preset rotations put soybean right after buckwheat:
- `C_with_buckwheat`: corn → **buckwheat → soybean** → wheat → corn
- `E_buckwheat_first`: **buckwheat → soybean** → corn → soybean → wheat

The ranking scores wireworm gains from buckwheat but has no disease rule, so these two rotations
are ranked without this sourced drawback. Buckwheat → corn or buckwheat → wheat avoids it.

---

## 5. Gaps (no reliable source found)

- Buckwheat: FAO-56 Kc and stage split (only the 70–90 day total); a Quebec nitrogen grid
  (Ontario's is used above); a residue ratio specific to buckwheat (IPCC generic grains used).
- Canola: day-based stage lengths (only degree days); a residue ratio; a previous-crop N credit;
  wireworm host status.
- Corn rootworm extended diapause outside Quebec: the "one year out of corn breaks the cycle" rule
  comes from the Quebec MAPAQ fiche. In Iowa the extended-diapause northern corn rootworm and the
  rotation-resistant western corn rootworm are known, so the rule should not be applied there
  unchanged. No source was checked for this in this pass.
- Nitrogen rates outside Quebec: only Iowa was looked at. Iowa State's 2022 spring update gives an
  MRTN of 137 lb N/acre (≈ 154 kg N/ha) for corn after soybean, at that year's prices [ISU_N].
  Rates for ON, PE, SK and ID were not collected.
- County-level yields for the region points (Story County, Magic Valley, Chatham-Kent, Saskatoon):
  the tables above are state or province totals.
- Lal 2005 Table: paywalled, not re-read.

---

## 6. Sources

| Key | Source | Link |
|---|---|---|
| STATCAN_FC | Statistics Canada, Table 32-10-0359-01, Estimated areas, yield, production, average farm price and total farm value of principal field crops, in metric and imperial units. Full CSV downloaded 2026-11-15; 2021–2025 means computed by this research | https://www150.statcan.gc.ca/n1/tbl/csv/32100359-eng.zip |
| STATCAN_POT | Statistics Canada, Table 32-10-0358-01, Area, production and farm value of potatoes | https://www150.statcan.gc.ca/n1/tbl/csv/32100358-eng.zip |
| NASS_2024 | USDA NASS, Crop Production 2024 Summary (January 2025), state tables for Iowa and Idaho, 2022–2024 | https://esmis.nal.usda.gov/sites/default/release-files/k3569432s/nk324887m/vx023905r/cropan25.txt |
| QC_GRAINS | Gouvernement du Québec, Culture des grains (céréales et oléagineux) | https://www.quebec.ca/agriculture-environnement-et-ressources-naturelles/agriculture/industrie-agricole-au-quebec/productions-agricoles/culture-grains-cereales-oleagineux |
| FAO56_T11, FAO56_T12, FAO56_PLANT | Allen et al. 1998, FAO Irrigation and Drainage Paper 56, Ch. 6, Tables 11 and 12 and footnotes | https://www.fao.org/4/x0490e/x0490e0b.htm |
| OMAFRA_USLE | OMAFRA Factsheet 23-005, Universal Soil Loss Equation (2023), Tables 4 and 5 | https://files.ontario.ca/omafra-universal-soil-loss-equation-23-005-en-2023-03-02.pdf |
| OMAFRA_811 | OMAFRA Publication 811, Agronomy Guide for Field Crops (2022): ch. 2 soybeans, ch. 6 canola (Table 6–2), ch. 7 buckwheat (Table 7–1) | https://www.ontario.ca/files/2022-10/omafra-agronomy-guide-for-field-crops-en-2022-10-13.pdf |
| MAPAQ_CEREAL_N | MAPAQ, Grilles de référence en fertilisation : blé, avoine et orge (IRDA scientific basis: Landry et al. 2021, Fascicule 04) | https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/agriculture-pecheries-alimentation/agriculture/pratiques-agricoles-et-environnement/GR_fertilisation_ble_orge_avoine_MAPAQ.pdf |
| MAPAQ_PRAIRIE_N | MAPAQ, Grilles de référence en fertilisation : prairies de graminées et de légumineuses | https://cdn-contenu.quebec.ca/cdn-contenu/adm/min/agriculture-pecheries-alimentation/agriculture/pratiques-agricoles-et-environnement/GR_reference_fertilisation_prairies_graminees_legumes_MAPAQ.pdf |
| FPCCQ_CANOLA | Fédération des producteurs de cultures commerciales du Québec, Guide de production du canola (2013), quoting the CRAAQ grid | https://www.agrireseau.net/grandescultures/documents/Guide%20de%20production%20du%20Canola-FPCCQ-2013.pdf |
| CPVQ_CREDIT | CPVQ 1996 residue credit table, in Guide des pratiques de conservation en grandes cultures, feuillet 4-B, Tableau 1 | https://agrireseau.net/agroenvironnement/documents/feuillet4b.pdf |
| IPCC_T11_2 | IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Vol. 4, Ch. 11, Table 11.2 | https://www.ipcc-nggip.iges.or.jp/public/2006gl/pdf/4_Volume4/V4_11_Ch11_N2O&CO2.pdf |
| SK_CANOLA_KC | Final report: crop coefficient development for canola and dry bean in Saskatchewan (Government of Canada science profile) | https://profils-profiles.science.gc.ca/en/publication/final-report-crop-coefficient-development-canola-and-dry-bean-saskatchewan-improve-yield |
| AAFC_WW | AAFC Pest Management Centre, project PRR07-030, Using crop rotation to control wireworms in agricultural fields (Noronha) | https://agriculture.canada.ca/en/science/agriculture-and-agri-food-research-centres/pest-management-centre/pesticide-risk-reduction-pest-management-centre/integrated-pest-management-projects/using-crop-rotation-control-wireworms-agricultural-fields |
| AB_PGW | Alberta Agriculture, Prairie grain wireworm (Agdex) | https://www1.agric.gov.ab.ca/$department/deptdocs.nsf/all/prm2509 |
| QC_3A | Données Québec, description of the fields of the prescribed-pesticide sales dataset ("culture visée": oats, wheat, canola, silage corn, grain corn, sweet corn, barley, soybean); MELCCFP information sheet on the 1 Aug 2025 extension | https://www.donneesquebec.ca/recherche/dataset/819687fc-4f5d-40b3-9db1-0369841aa329/resource/2795f220-333c-45d6-a121-738f6b2e1714/download/description-champs-pesticides-prescription.pdf ; https://environnement.gouv.qc.ca/ministere/consultation-modification-reglement-eau-pestides-phosphore-exploitants-agricoles/feuillet-pesticides.pdf |
| ISU_N | Iowa State University, Spring 2022 nitrogen fertilization update (MRTN) | https://www.agronext.iastate.edu/soilfertility/currenttopics/Spring2022Nfertilization4-12-2022.pdf |
| RAP, SAGUEZ, NORONHA, MAPAQ_CRW | As in `web/data/risk.json` `sources` | — |

Read directly from the downloaded document: STATCAN_FC, STATCAN_POT, NASS_2024, FAO56, OMAFRA_USLE,
OMAFRA_811, MAPAQ_CEREAL_N, MAPAQ_PRAIRIE_N, FPCCQ_CANOLA, CPVQ_CREDIT, IPCC_T11_2, AAFC_WW.
Taken from search-result excerpts only, so re-read them before citing them in the app: QC_GRAINS,
SK_CANOLA_KC, AB_PGW, QC_3A, ISU_N.
