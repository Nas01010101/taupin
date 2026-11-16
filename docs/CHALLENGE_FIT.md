# Challenge fit

NASA Space Apps 2026, challenge "Field Shift: Adapting Farms with NASA Data".
Written 2026-11-15.

## Sources

| Item | State | Source |
|---|---|---|
| The challenge page | verified by search result title only | https://www.spaceappschallenge.org/2026/challenges/field-shift-adapting-farms-with-nasa-data/ |
| Objectives as summarised below | secondary source, not the official text | Sonoma State Space Apps 2026 page, https://edeon.sonoma.edu/nasaspaceapps-26/ |
| The five judging criteria: Impact, Creativity, Validity, Relevance, Presentation | official judging and submission guides | https://www.spaceappschallenge.org/resources/judging-awards-guide , https://www.spaceappschallenge.org/resources/project-submission-guide/ |
| Official list of NASA data for this challenge | not found | |

The secondary summary: a decision-support tool that pairs NASA Earth observations with local soil
information, crop traits and farmer priorities, so farmers can test crop rotation strategies for
soil health under changing conditions.

## Objectives

| Objective (secondary summary) | Where Taupin meets it | What is weak |
|---|---|---|
| Use NASA Earth observations | NASA GPM IMERG daily rain sets the rotation water and heavy-rain columns for any coordinates (`web/js/power.js`, `web/js/soilwater.js`); NASA POWER `GWETROOT` and winter `TSOIL1` are two of the four field risk inputs (`risk/fit.py`, `web/js/fieldrisk.js`); NASA HLS NDVI is a layer of the 3D field (`src/taupin/layers.py`); NASA SMAP L4 checks the POWER wetness input, anomaly r = 0.78 over 126 months (`src/taupin/smap.py`, `web/data/smap.json`) | HLS and Landsat layers are baked for the prepared fields only; SMAP is shown for the demo field only |
| Pair them with local soil information | IRDA soil map and CanSIS texture under the Quebec fields (`web/data/layers/soil.bin`); SoilGrids organic matter for any picked field (`web/js/organic.js`) | the soil map gives surface clay, not sand; no organic matter balance over the rotation |
| Crop traits and farmer priorities | FAO-56 crop coefficients, OMAFRA USLE crop and tillage factors, CRAAQ and MAPAQ nitrogen rates, Lal 2005 residue ratios, one source per value (`web/data/crops.json`); the farmer ticks which of five priorities count and picks the current rotation (`web/js/swui.js`) | buckwheat has no FAO-56 coefficient or Quebec nitrogen rate; priorities have equal weight; no yield or price |
| Test rotation strategies | seven rotations over five years, ranked on the chosen priorities, each card with its reason against the current rotation (`web/data/rotations.json`, `web/js/swui.js`) | no yield, cost or corn-after-corn yield penalty |
| Soil health | USLE cover factor per crop and tillage, heavy-rain days on bare soil, residue returned, nitrogen to buy (`web/js/soilwater.js`) | USLE uses C only, not the field's K and LS; no cover crops |
| Changing conditions | rotation water columns projected for 2026 to 2030 with an 80 % range from a rolling backtest (`web/js/forecast.js`, `soilwater.js` `projectClimate`) | projections extend the field's own history; no seasonal forecast or climate projection |
| Usable for a farmer | one page: field, crop field check, ranking, photos and notes; offline PWA (`web/sw.js`); English and French | no farmer or agronomist has tried it |

## Judging criteria

| Criterion | Where Taupin meets it | What is weak |
|---|---|---|
| Impact | a farmer anywhere picks a field and gets seven rotations ranked by soil, water and pests | no field trial |
| Creativity | the field in 3D from lidar or terrain tiles in the browser; photos and notes pinned on it change the ranking; the photo model answers "unclear" instead of guessing (`web/js/classify.js`) | |
| Validity | every rule carries a source; held-out scores and limits in `risk/model/metrics.json`, `model/metrics.json`, `model/MODEL_CARD.md`; the app says when a square is not an active crop field (`web/js/cropcheck.js`) | field risk model on 82 fields, 11 positives (AUC 0.80 optimistic, year-out 0.68); no photos taken in Quebec fields |
| Relevance (NASA data as a core component) | GPM IMERG rain and POWER soil data for any coordinates feed the ranking; HLS and SMAP for the prepared fields | HLS and Landsat layers only for the prepared fields |
| Presentation | 30 s video (https://youtu.be/k4BG-ckcc1k); `?demo=1` scripted walk-through (`web/js/demo.js`) | |

## Still open

- HLS, Landsat and soil map layers for any picked field, not only the prepared ones.
- A field trial with a farmer or an agronomist.
