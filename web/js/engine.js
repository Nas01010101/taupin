// The wireworm and corn rootworm rules of src/taupin/engine.py, run in the browser so a field the
// farmer clicks gets a pest table from its own crop history and soil. Same rules, same trace
// lines; the source texts come from risk.json `sources` (engine.SRC). riskMatrix() with the
// park's defaults reproduces web/data/risk.json exactly (web/test/engine.test.mjs).

export const GRASS = new Set(['corn', 'wheat', 'barley', 'oat', 'rye', 'sod']);   // Poaceae: wireworm hosts
export const PRESCRIPTION_CROPS = new Set(['corn', 'soybean', 'wheat', 'barley', 'oat', 'canola']);
export const TRAP_THRESHOLD = { hypnoidus: 3.0, agriotes: 1.0, limonius: 1.0, melanotus: 1.0 };
const LEVELS = ['LOW', 'MODERATE', 'HIGH'];
// Python prints a float with a decimal point (3.0); the trace lines must read the same.
const pyNum = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));

export function wireworm(fld, history, yearsSinceSod, trapMean, SRC) {
  const f = [];
  if (['sand', 'loamy-sand', 'organic'].includes(fld.texture)) f.push(['light or organic soil', 'RAP']);
  if (fld.organic_matter_pct > 10) f.push(['organic matter > 10 %', 'RAP']);
  let run = 0;
  for (let i = history.length - 1; i >= 0 && GRASS.has(history[i]); i--) run++;
  if (yearsSinceSod <= 2 || run >= 3) f.push([`grass history (years since sod=${yearsSinceSod}, grass run=${run})`, 'RAP']);
  let level = Math.min(f.length, 2);
  const trace = f.map(([name, s]) => `WW factor: ${name} [${SRC[s]}]`);
  if (history[history.length - 1] === 'buckwheat' && level > 0) {
    level -= 1;
    trace.push(`WW -1: previous buckwheat slows larval growth/survival, not a biofumigant [${SRC.NORONHA}]`);
  }
  if (trapMean != null) {
    const thr = TRAP_THRESHOLD[fld.dominant_genus];
    level = trapMean >= thr ? 2 : Math.min(level, 1);
    trace.push(`WW trap mean ${pyNum(trapMean)} vs threshold ${pyNum(thr)}/trap (${fld.dominant_genus}) [${SRC.RAP}]`);
  }
  return [LEVELS[level], trace];
}

export function rootworm(crop, history, SRC) {
  if (crop !== 'corn') return ['NONE', []];
  let run = 0;
  for (let i = history.length - 1; i >= 0 && history[i] === 'corn'; i--) run++;
  const level = LEVELS[Math.min(run, 2)];
  return [level, [`CRW: ${run} prior corn year(s) -> ${level} [${SRC.MAPAQ_CRW}]`]];
}

export function planRotation(crops, fld, { startYear = 2026, yearsSinceSod = 1, prior = ['sod', 'sod', 'sod'], traps = {} } = {}, SRC) {
  const history = [...prior];
  return crops.map((crop, i) => {
    const year = startYear + i, [ww, t1] = wireworm(fld, history, yearsSinceSod + i, traps[year], SRC), [crw, t2] = rootworm(crop, history, SRC);
    const ok = PRESCRIPTION_CROPS.has(crop) && ww === 'HIGH';
    history.push(crop);
    return { year, crop, wireworm: ww, corn_rootworm: crw, prescription_supportable: ok,
      trace: [...t1, ...t2, `Prescription ${ok ? 'supportable' : 'not supported'} for ${crop} [${SRC.QC_2025}]`] };
  });
}

// The park's two zones (src/taupin/bake.py ZONES); a clicked field replaces texture and organic
// matter when its soil is known.
export const PARK_ZONES = {
  upland: { label: 'Upland, clay-loam, OM 5 %', field: { texture: 'clay-loam', organic_matter_pct: 5.0, dominant_genus: 'hypnoidus' } },
  pocket: { label: 'Low wet pocket, clay-loam, OM 12 % (to be measured)', field: { texture: 'clay-loam', organic_matter_pct: 12.0, dominant_genus: 'hypnoidus' } },
};

// Same shape as risk.json. history = { prior, years_since_sod, ... } from the field's crop history.
export function riskMatrix({ rotations, sources, startYear = 2026, zones = PARK_ZONES, history = null }) {
  const opt = { startYear, yearsSinceSod: history ? history.years_since_sod : 1, prior: history ? history.prior : ['sod', 'sod', 'sod'] };
  const out = {};
  for (const [zk, z] of Object.entries(zones)) {
    const fld = z.field, thr = TRAP_THRESHOLD[fld.dominant_genus], scen = { baseline: {}, trap_threshold: {} };
    for (const [rk, crops] of Object.entries(rotations)) {
      scen.baseline[rk] = planRotation(crops, fld, opt, sources);
      scen.trap_threshold[rk] = planRotation(crops, fld, { ...opt, traps: { [startYear]: thr } }, sources);
    }
    out[zk] = { label: z.label, dominant_genus: fld.dominant_genus, trap_threshold: thr, scenarios: scen };
  }
  const res = { start_year: startYear, rotations, zones: out, sources };
  if (history) res.history = history;
  return res;
}
