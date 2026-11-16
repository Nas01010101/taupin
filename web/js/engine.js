// The wireworm and corn rootworm rules of src/taupin/engine.py, line for line, for the rotations a
// farmer builds on the page. The preset rotations keep their levels from web/data/risk.json; this
// port gives the same levels and the same trace text for any other sequence, so a farmer's own
// rotation is scored by the same rules. Constants and sources come from risk.json (`rules`,
// `sources`), never from a copy here. web/test/engine.test.mjs checks the output against the Python
// engine on web/test/fixtures/engine_parity.json.

// Python prints a float with at least one decimal (3.0, 1.5); match it in the trace text.
export const pyFloat = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));

export function makeRules(risk) {
  const r = risk.rules;
  return {
    grass: new Set(r.grass), prescription: new Set(r.prescription_crops), threshold: r.trap_threshold,
    levels: r.levels, src: risk.sources, prior: r.default_prior, yearsSinceSod: r.default_years_since_sod,
  };
}

export function wirewormFactors(R, fld, history, yearsSinceSod) {
  const f = [];
  if (['sand', 'loamy-sand', 'organic'].includes(fld.texture)) f.push(['light or organic soil', 'RAP']);
  if (fld.organic_matter_pct > 10) f.push(['organic matter > 10 %', 'RAP']);
  let grassRun = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (!R.grass.has(history[i])) break;
    grassRun++;
  }
  // Sod return and long grass runs are one biological factor (grass hosts); counted once.
  if (yearsSinceSod <= 2 || grassRun >= 3) f.push([`grass history (years since sod=${yearsSinceSod}, grass run=${grassRun})`, 'RAP']);
  return f;
}

export function wirewormLevel(R, fld, history, yearsSinceSod, trapMean = null) {
  const factors = wirewormFactors(R, fld, history, yearsSinceSod);
  let level = Math.min(factors.length, 2);
  const trace = factors.map(([name, s]) => `WW factor: ${name} [${R.src[s]}]`);
  if (history.length && history[history.length - 1] === 'buckwheat' && level > 0) {
    level -= 1;   // larval survival 15 % on buckwheat vs 44 % on barley over 120 d (NORONHA)
    trace.push(`WW -1: previous buckwheat slows larval growth/survival, not a biofumigant [${R.src.NORONHA}]`);
  }
  if (trapMean != null) {
    const thr = R.threshold[fld.dominant_genus];
    level = trapMean >= thr ? 2 : Math.min(level, 1);
    trace.push(`WW trap mean ${pyFloat(trapMean)} vs threshold ${pyFloat(thr)}/trap (${fld.dominant_genus}) [${R.src.RAP}]`);
  }
  return [R.levels[level], trace];
}

export function crwLevel(R, crop, history) {
  if (crop !== 'corn') return ['NONE', []];
  let run = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i] !== 'corn') break;
    run++;
  }
  const level = R.levels[Math.min(run, 2)];
  return [level, [`CRW: ${run} prior corn year(s) -> ${level} [${R.src.MAPAQ_CRW}]`]];
}

// Same output as engine.plan_rotation (YearRisk as a plain object). traps: {year: mean}.
export function planRotation(R, crops, fld, { startYear, yearsSinceSod = R.yearsSinceSod, prior = R.prior, traps = {} } = {}) {
  const history = [...prior], out = [];
  crops.forEach((crop, i) => {
    const year = startYear + i;
    const [ww, t1] = wirewormLevel(R, fld, history, yearsSinceSod + i, traps[year] ?? null);
    const [crw, t2] = crwLevel(R, crop, history);
    const ok = R.prescription.has(crop) && ww === 'HIGH';
    const t3 = [`Prescription ${ok ? 'supportable' : 'not supported'} for ${crop} [${R.src.QC_2025}]`];
    out.push({ year, crop, wireworm: ww, corn_rootworm: crw, prescription_supportable: ok, trace: [...t1, ...t2, ...t3] });
    history.push(crop);
  });
  return out;
}

// One zone's two scenarios for a sequence, in the shape of risk.json `zones[z].scenarios[*][id]`.
// start: {prior, yearsSinceSod} to replace the baked start (the farmer's crop history); omitted, the
// start is the one risk.json was baked with, so the result equals the baked tables.
export function scenariosFor(risk, R, zone, crops, start = null) {
  const z = risk.zones[zone], startYear = risk.start_year;
  const opts = start ? { startYear, prior: start.prior, yearsSinceSod: start.yearsSinceSod } : { startYear };
  return {
    baseline: planRotation(R, crops, z.field, opts),
    trap_threshold: planRotation(R, crops, z.field, { ...opts, traps: { [startYear]: z.trap_threshold } }),
  };
}
