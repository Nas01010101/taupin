# Prediction work plan

Instructions for turning the claims Taupin cannot make yet into claims it can defend. Each track
names a claim, says why it is not safe, lists the work, and sets the test the work must pass
before the claim goes into the README, the deck or the submission page.

State on 2026-11-15, after commit `db5aaab`: Track A is done (`web/js/forecast.js`), Track C is
partly done, Tracks B and D are open.

## How to use this file

1. Pick an open track from the table below.
2. Do the tasks in order. Each task names the files to change.
3. Run the acceptance check. Put the resulting numbers in a data or metrics file, never only in
   prose.
4. Only when the check passes, use the "safe wording" line and update `README.md`,
   `docs/PROJECT.md`, `docs/CHALLENGE_FIT.md`, `docs/RESEARCH.md` and the deck.
5. If a check fails, keep the interim wording and record the result anyway. A measured negative
   result is still usable in `docs/RESEARCH.md`.

Ground rules (from `docs/spec.md`): every number comes from a metrics file or a cited source;
new code gets tests; files stay under 500 lines; evaluation uses data the model did not see;
a threshold or feature set chosen after seeing held-out scores is reported as such.

## Tracks

| # | Claim | Track | State | Effort left |
|---|---|---|---|---|
| 1 | "forecasts the likely trap window for the next five seasons" | A: trap-date forecast with a backtest | **done**, leap-year fix applied | none |
| 2 | "flags fields likely to reach the trap threshold, before trapping" | B: early field rank | open | half a day to a day |
| 3 | "ranks rotations on your priorities, with water columns forecast for each year" | C: rotation ranking | partly done | half a day for the stability count; more for the gaps |
| 4 | "forecasts this spring's trap date from a seasonal forecast" | D: seasonal forecast input | open | several days, after the hackathon |

## Wording

| Safe now | Do not say |
|---|---|
| "forecasts the likely trap window for the next five seasons from 31 years of NASA soil temperature, with an 80 % range from a backtest" | "forecasts the trap date" as one day with no range |
| "ranks fields for bait trapping using NASA soil data" | "predicts wireworm outbreaks" |
| "compares seven crop rotations, with water columns forecast for each year from 25 years of NASA GPM rain" | "predicts which rotation will perform best" |
| "classifies soil insects from a photo" | "AI predicts risk" |

---

## Track A: trap-date forecast (done)

**Implementation.** `web/js/forecast.js` (commit `430b876`), used by `web/js/risk.js`
`trapForecast` and `trapPlan`, shown by `web/js/ui.js` `forecastHTML` and the trap calendar.
Four models compete: the mean of all past years, the mean of the last 10, a least-squares trend,
and the average of mean and trend. Each is scored by a rolling-origin backtest (fit on the years
up to t, predict t + 1 to t + 5, first origin after 10 years). The lowest mean absolute miss wins,
and the 80 % range at each horizon is the 10th to 90th percentile of that model's own misses.

**Results on the demo field** (NASA POWER `TSOIL1`, 1995 to 2025, from running the app's code):

| | Trap date | Rootworm hatch |
|---|---|---|
| Model used | mean of all years | mean of all years |
| Mean backtest miss: mean / last 10 / trend / blend | 6.9 / 7.4 / 8.4 / 7.6 days | 3.8 / 3.9 / 4.2 / 4.0 days |
| 2026 forecast and 80 % range | 14 May, 6 to 24 May | 26 June, 17 to 28 June |

The app's 2026 calendar: traps ready by 6 May, set at 12 °C (most likely around 14 May, by 24 May
in 9 years out of 10), counts on 21 May, 28 May and 4 June, and the count decides the 2027 seed.

**Acceptance check: passed.** The bar was that the 80 % range holds on years it was not built
from in 70 % to 90 % of cases. Check: at each origin, build the range only from the misses
already seen (at least 5), then test the next miss.

| Horizon (years ahead) | 1 | 2 | 3 | 4 | 5 | All |
|---|---|---|---|---|---|---|
| Inside the range | 16 of 16 | 12 of 15 | 12 of 14 | 11 of 13 | 10 of 12 | 61 of 70 (87 %) |

Samples are small, and the 1-year-ahead range held every time, so it may be slightly wide.
Reproduce by running `backtest()` from `forecast.js` on `web/data/soil.json` with the loop above.

**Leap-year fix (applied).** The day of year counted a date in a leap year one day later than the
same calendar date in other years (14 May 2024 was day 135, 14 May 2025 day 134), while the labels
read days on the 2001 calendar. Dates are now counted on a non-leap calendar from 1 March on:
`soil.py` `doy` (baked means and trend, through `date_stats`), `power.js` `doy` (live means and
trend) and `risk.js`, which now uses the same `doy` for the forecast. Effect on the demo field:
the 2026 range ends on 24 May instead of 25 May; the means read 133.9 and 118.5 instead of 134.2
and 118.8 (labels still 14 May and 29 April); the trend interval is ± 3.86 instead of ± 3.85; the
out-of-sample check is unchanged. A test gives the same calendar date every year, leap years
included, and checks the forecast returns that date with no spread; it fails under the old rule.

**Safe wording.** "Forecasts the likely trap window for the next five seasons from 31 years of
NASA soil temperature: 2026 most likely 14 May, 6 to 24 May in 8 years out of 10 (range held in 61
of 70 backtest cases)."

**Limits to keep stating.** No seasonal weather forecast is used; the range assumes the coming
springs fall within the spread of past ones; NASA POWER is a grid of about 50 km.

---

## Track B: early field rank ("predicts wireworm outbreaks")

**Why it is not safe.**
- Timing: the rank uses spring root-zone wetness up to 31 May, but traps go in around mid-May,
  so a season's rank is complete only after trapping starts. The app ranks the latest season
  with data (2026 on 15 November 2026), which is over.
- Output: a rank, not a probability. The Brier score (0.110) barely beats the base rate (0.116).
- Validation: AUC 0.80 leaving one field out, 0.68 leaving one year out, from 82 fields, 11
  positive, 5 years (`risk/model/metrics.json`). The four features were chosen after seeing the
  first cross-validation.
- "Outbreak" implies a population surge. The label is "at least 1 wireworm per bait trap". Do not
  use "outbreak" even after this track.

**What changed since the plan was written.** The three baked Quebec fields (Laval,
Saint-Eustache, Mirabel) carry 2011 to 2025 crop history from the AAFC Annual Crop Inventory, and
the app presets the years-in-forage input from it (`src/taupin/crophist.py`, `web/js/app.js`).
That fills one field-form input; it does not make the rank available before trapping.

**Tasks.**
1. `risk/fit.py`: add a feature set `early` = `light_soil`, `forage_years`,
   `tsoil_winter_min_c` (all known by 1 April). Leave the existing sets unchanged so the
   comparison stays fixed. Note in the code that `early` was defined after the first results.
2. Run the fit:
   ```bash
   uv run --with scikit-learn --with numpy python risk/fit.py risk/model early
   ```
   It writes the same scores as the other sets: leave one field, year, region and weather cell
   out, bootstrap interval, permutation p, Brier against base rate.
3. Calibration: add a reliability table (predicted against observed rate in three bins) for
   `early` and `compact` to `risk/model/metrics.json`. With 11 positives it is coarse; report it.
4. `web/data/risk_model.json` and `web/data/field_risk.json`: export both models. In
   `web/js/fieldrisk.js` and `web/js/ui.js`, show "early rank (from 1 April)" and "full rank
   (from 1 June)", each with its own year-out AUC under "Details".
5. `web/js/app.js`: rank the next season with the early model once its winter data is complete,
   instead of the last finished season.
6. Tests: `tests/test_risk.py` for the new set and the export; `web/test/fieldrisk.test.mjs` for
   the two ranks and the default year.
7. More data, after the hackathon: the 82 fields cover 2012 to 2016. Ask CÉROM about access to the
   VFF QC fields (about 800, not published) and look for RAP yearly bait-trap reports. More years
   matter more than more fields for the year-out score.

**Acceptance check.** For `early`: leave-one-year-out AUC with a bootstrap 95 % interval whose
lower end is above 0.5, and permutation p below 0.05. If the interval includes 0.5, the early rank
does not ship.

**Safe wording once done.** "Before trapping, ranks a field among 82 Quebec fields for its chance
of reaching the 1 wireworm per trap threshold, from NASA winter soil temperature and two field
questions (year-out AUC X)." A probability can only be claimed once the reliability table shows
calibration on held-out years.

---

## Track C: rotation ranking ("predicts which rotation will perform best")

**What changed since the plan was written** (commits `430b876`, `3758a27`):
- Seven rotations instead of four (`web/data/rotations.json`, `web/js/risk.js`
  `ROTATION_NAMES`): adds buckwheat first, soybean and wheat with no corn, and two corn years then
  soybean and wheat.
- The water columns use a forecast for each rotation year (`web/js/soilwater.js`
  `projectClimate`, same models and backtest as Track A); the dry year is the forecast plus the
  80th percentile of the backtest misses.
- Baked fields preset the current rotation from their crop history.

**Why it is still not safe.**
- The ranking orders seven fixed rotations by the priorities the farmer ticks. It compares; it
  does not predict outcomes.
- No outcome is checked: no yield, no measured soil loss, no measured pest counts per rotation.
- Known gaps (`docs/PROJECT.md`, "Soil and water"; `docs/CHALLENGE_FIT.md`): no yield penalty for
  corn after corn, no cover crops, no soil water stored at sowing, USLE uses C only, buckwheat
  values missing, equal weights, no prices. On equal weights corn every year ranks first.

**Tasks.**
1. Stability: in `web/js/soilwater.js`, add a function that runs `rotationMetrics()` and `rank()`
   once per past weather year (2001 to 2025) and returns how often each rotation ranks first. Show
   it in `web/js/swui.js` ("first in 14 of 25 seasons"). Test in `web/test/soilwater.test.mjs`.
2. Corn after corn: add a sourced yield penalty (Quebec or Ontario rotation trials) to
   `web/data/crops.json` and apply it to yield, residue and nitrogen in `rotationMetrics()`. No
   source found: leave it null and list it as a gap; do not pick a number.
3. Soil water at sowing: start a FAO-56 Ch. 8 water balance from `GWETROOT` (or SMAP) at sowing,
   with available water from the CanSIS soil tables, before computing the shortfall.
4. Cover crop option after wheat and soybean, with its USLE C and nitrogen effect, each value
   sourced in `crops.json`.
5. Buckwheat: find a measured crop coefficient and a CRAAQ nitrogen rate. Until then the "?"
   stays and its rotations rank after the fully scored ones.
6. After the hackathon: compare the order with a published Quebec or Ontario long-term rotation
   trial on the measures the trial reports.

**Acceptance check.** Task 1 done and shown in the app; tasks 2 and 3 done or recorded as
sourced gaps; the "corn every year ranks first" result rechecked after tasks 2 to 4 and reported
as it comes out.

**Safe wording once done.** "Ranks seven rotations on the priorities you choose, with water
columns forecast for each year from 25 years of NASA rain; shows how often each one came first."
"Predicts which rotation will perform best" stays off the list until task 6 shows agreement with
measured trial outcomes.

---

## Track D: seasonal forecast ("forecasts this spring's trap date")

**Why it is not safe.** Track A extends the field's own history. It uses no information about the
coming spring.

**What makes it safe.** Running the 12 °C rule on a forecast of the coming spring, and showing on
past years that it beats the Track A forecast.

**Tasks.**
1. Find a seasonal forecast with open daily soil or air temperature for March to June near the
   field. Candidates to check: NASA GMAO GEOS-S2S, NOAA CFSv2. Record licence and access in
   `DATA_SOURCES.md`.
2. Convert it to the 0 to 10 cm layer that POWER `TSOIL1` represents (bias-correct against POWER
   over the hindcast years).
3. Run `crossing()` from `web/js/power.js` on each ensemble member; report the spread as the
   range.
4. Backtest on the forecast's hindcast years against the POWER dates.

**Acceptance check.** On hindcast years, the forecast date has a lower mean absolute miss than
the Track A forecast (6.9 days on the demo field), and its range covers the observed date at its
stated rate.

**Safe wording once done.** "Forecasts this spring's trap window from a NASA seasonal forecast
(hindcast miss X days against 6.9 days for the history-based forecast)."

---

## "AI predicts risk"

No work unlocks this phrase as written. The risk levels come from cited rules
(`src/taupin/engine.py`), the field rank from a logistic regression, the forecasts from simple
models of the field's own history, and the photo model only names the animal. Name each part for
what it is.

## Before changing any public wording

- [ ] The track's acceptance check passed, and its numbers are in a data or metrics file.
- [ ] Tests for the new code pass: `uv run pytest` and `node --test web/test/*.test.mjs`.
- [ ] README, `docs/PROJECT.md`, `docs/CHALLENGE_FIT.md`, `docs/RESEARCH.md` and the deck use the
      same wording and the same numbers.
- [ ] Any choice made after seeing held-out scores is stated next to the number.
