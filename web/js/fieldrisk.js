// The trained field risk model (data/risk_model.json) run in the browser. Same formula as
// src/taupin/fieldrisk.py: z = intercept + sum(coef * (transform(x) - mean) / sd). The page shows
// z only as a rank against the 82 training fields (data/field_risk.json cut points), never as a
// probability: the model was fitted on 11 positive fields and is not calibrated for one farm.

export function transform(kind, x) {
  if (kind === 'log1p') return Math.log1p(x);
  if (kind === 'log') return Math.log(x);
  if (kind === 'identity' || kind === '0/1') return Number(x);
  throw new Error(`unknown transform ${kind}`);
}

export function score(model, inputs) {
  let z = model.intercept;
  for (const f of model.features) {
    const x = inputs[f.name];
    if (x == null || Number.isNaN(Number(x))) throw new Error(`missing input ${f.name}`);
    z += model.coef[f.name] * (transform(f.transform, x) - f.mean) / f.sd;
  }
  return z;
}

export const RANKS = ['low', 'mid', 'high'];
export const rankOf = (z, [a, b]) => (z <= a ? 'low' : z <= b ? 'mid' : 'high');

// POWER daily parameters ({YYYYMMDD: value}) -> the two weather inputs for a scouting year.
// Mirrors risk/fetch_power.py features(); -999 is POWER's missing value.
export function powerFeatures(p, year) {
  const win = (s, a, b) => Object.entries(s ?? {}).filter(([d, v]) => d >= a && d <= b && v > -900).map(([, v]) => v);
  const gw = win(p.GWETROOT, `${year}0401`, `${year}0531`), ts = win(p.TSOIL1, `${year - 1}1201`, `${year}0331`);
  return {
    gwet_spring: gw.length ? Math.round(1000 * gw.reduce((a, b) => a + b, 0) / gw.length) / 1000 : null,
    tsoil_winter_min_c: ts.length ? Math.min(...ts) : null,
  };
}

// Names of the inputs that fall outside what the 82 training fields covered.
export function outsideTraining(inputs, ranges) {
  return Object.entries(ranges).filter(([k, [lo, hi]]) => inputs[k] < lo || inputs[k] > hi).map(([k]) => k);
}

// One scouting year for the field: the class, the inputs used and any extrapolation.
export function fieldRanking(model, fr, { year, forageYears = 0, lightSoil = 0 }) {
  const w = fr.per_year[year];
  if (!w) return null;
  const inputs = { light_soil: lightSoil, forage_years: forageYears, ...w };
  const z = score(model, inputs);
  return { year, inputs, z, rank: rankOf(z, fr.rank_cutpoints), outside: outsideTraining(inputs, fr.training_range) };
}

// Can the "sand or sandy loam" input be read off the field's soil map? On the soil texture
// triangle (Canadian System of Soil Classification, same classes as USDA) sand, loamy sand and
// sandy loam all have under 20 % clay. The baked map gives surface clay but not sand, so a unit
// with 20 % clay or more, an organic unit or a named non-sandy texture is not light, and a unit
// under 20 % clay may or may not be. light: 0 when no unit can be light, null when the farmer
// must say. Returns null when the field has no soil layer.
export const LIGHT_MAX_CLAY = 20;
export function soilLightCheck(field) {
  const layer = field?.layers?.find(l => l.key === 'soil');
  if (!layer?.classes?.length) return null;
  const seen = new Set(), units = [];
  for (const k of layer.classes.flatMap(c => c.components ?? [])) {
    if (seen.has(k.name)) continue;
    seen.add(k.name);
    const t = String(k.texture ?? '').trim(), m = t.match(/(\d+(?:\.\d+)?) % clay/), clay = m ? Number(m[1]) : null;
    const kind = /^organic/i.test(t) ? 'organic'
      : clay != null ? (clay >= LIGHT_MAX_CLAY ? 'heavy' : 'maybe')
      : !t || /sand/i.test(t) ? 'maybe' : 'heavy';
    units.push({ name: k.name, kind, what: kind === 'organic' ? 'organic' : clay != null ? `${clay} % clay` : t ? t.split(' on ')[0] : 'texture not given' });
  }
  const maybe = units.filter(u => u.kind === 'maybe');
  return { light: maybe.length ? null : 0, units, maybe };
}

const list = xs => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

// The sentence under the rank for a field with a soil map (soilLightCheck result).
export function soilLightNote(chk) {
  const all = `Soil map units here: ${list(chk.units.map(u => `${u.name} (${u.what})`))}.`;
  if (chk.light === 0) return `${all} None can be sand or sandy loam (those have under ${LIGHT_MAX_CLAY} % clay), so that input is no.`;
  return `${all} ${list(chk.maybe.map(u => u.name))} ${chk.maybe.length > 1 ? 'have' : 'has'} under ${LIGHT_MAX_CLAY} % clay and may be sand or sandy loam; ` +
    'the map gives clay, not sand. Tick the box if your part of the field is sand or sandy loam.';
}
