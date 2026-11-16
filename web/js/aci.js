// AAFC Annual Crop Inventory (ACI, 30 m, 2011 onward) for a field built in the browser: class
// names, the crop groups the engine models, the yearly crop over the field and the rotation the
// history follows. Matching follows src/taupin/crophist.py with the fixes of the
// fix/crop-rotation-match branch: rotations are compared by their repeating cycle, a tie goes to
// the rotation agreeing on the more recent years, and a match under 4 of 5 years is not preset.
// No imports, so node --test can load it.

export const ACI_URL = 'https://agriculture.canada.ca/imagery-images/rest/services/annual_crop_inventory/{year}/ImageServer/exportImage';
export const ACI_YEARS = Array.from({ length: 15 }, (_, i) => 2011 + i);   // 2011 to 2025

// AAFC ACI class table (codes and English labels).
export const ACI_NAMES = {
  10: 'Cloud', 20: 'Water', 30: 'Exposed land/barren', 34: 'Urban/developed', 35: 'Greenhouses', 50: 'Shrubland',
  80: 'Wetland', 85: 'Peatland', 110: 'Grassland', 120: 'Agriculture (undifferentiated)', 122: 'Pasture/forages',
  130: 'Too wet to be seeded', 131: 'Fallow', 132: 'Cereals', 133: 'Barley', 134: 'Other grains', 135: 'Millet',
  136: 'Oats', 137: 'Rye', 138: 'Spelt', 139: 'Triticale', 140: 'Wheat', 141: 'Switchgrass', 142: 'Sorghum',
  143: 'Quinoa', 145: 'Winter wheat', 146: 'Spring wheat', 147: 'Corn', 148: 'Tobacco', 149: 'Ginseng',
  150: 'Oilseeds', 151: 'Borage', 152: 'Camelina', 153: 'Canola/rapeseed', 154: 'Flaxseed', 155: 'Mustard',
  156: 'Safflower', 157: 'Sunflower', 158: 'Soybeans', 160: 'Pulses', 161: 'Other pulses', 162: 'Peas',
  163: 'Chickpeas', 167: 'Beans', 168: 'Fababeans', 174: 'Lentils', 175: 'Vegetables', 176: 'Tomatoes',
  177: 'Potatoes', 178: 'Sugarbeets', 179: 'Other vegetables', 180: 'Fruits', 181: 'Berries', 182: 'Blueberry',
  183: 'Cranberry', 185: 'Other berry', 188: 'Orchards', 189: 'Other fruits', 190: 'Vineyards', 191: 'Hops',
  192: 'Sod', 193: 'Herbs', 194: 'Nursery', 195: 'Buckwheat', 196: 'Canaryseed', 197: 'Hemp', 198: 'Vetch',
  199: 'Other crops', 200: 'Forest (undifferentiated)', 210: 'Coniferous', 220: 'Broadleaf', 230: 'Mixedwood',
};
export const aciName = code => ACI_NAMES[code] ?? `ACI class ${code}`;

// ACI code -> engine crop group (src/taupin/crophist.py GROUPS, small grains as grasses).
export const GROUPS = { 147: 'corn', 158: 'soybean', 140: 'wheat', 145: 'wheat', 146: 'wheat', 195: 'buckwheat',
  133: 'barley', 136: 'oat', 137: 'rye', 153: 'canola', 110: 'forage', 122: 'forage', 192: 'forage' };
export const groupOf = code => GROUPS[code] ?? 'other';
// Farmed ground: the agriculture codes 120 to 199 (crops, pasture, fallow, sod).
export const isFarm = code => code >= 120 && code <= 199;
export const MIN_MATCH = 4;

// URL of a size x size PNG of raw class codes over bbox [west, south, east, north] (degrees).
export function aciURL(year, bbox, size) {
  const q = new URLSearchParams({ bbox: bbox.join(','), bboxSR: '4326', imageSR: '4326', size: `${size},${size}`, format: 'png',
    pixelType: 'U8', interpolation: 'RSP_NearestNeighbor', renderingRule: JSON.stringify({ rasterFunction: 'None' }), f: 'image' });
  return `${ACI_URL.replace('{year}', year)}?${q}`;
}

// Most common class over the cells where mask is set, if that class is farmed ground.
export function majority(codes, mask) {
  const n = new Map();
  codes.forEach((c, i) => { if (mask[i] && c > 0) n.set(c, (n.get(c) ?? 0) + 1); });
  let best = null, cnt = 0, tot = 0;
  for (const [c, k] of n) { tot += k; if (k > cnt) { best = c; cnt = k; } }
  if (best == null || !isFarm(best)) return null;
  return { code: best, name: aciName(best), group: groupOf(best), share: Math.round(100 * cnt / tot) / 100 };
}

// The repeating unit of a five-year plan (corn-soy-corn-soy-corn repeats [corn, soybean]).
export function cycle(plan) {
  for (let p = 1; p <= plan.length; p++) if (plan.every((x, i) => x === plan[i % p])) return plan.slice(0, p);
  return plan.slice();
}

// Summary of a history {year: {group, ...}}: forage years, corn run, and the rotation it follows.
export function summary(hist, rotations) {
  const ys = Object.keys(hist).map(Number).sort((a, b) => a - b), groups = ys.map(y => hist[y].group), last5 = groups.slice(-5);
  let cornRun = 0;
  for (let i = groups.length - 1; i >= 0 && groups[i] === 'corn'; i--) cornRun++;
  const key = a => [a.reduce((s, v) => s + v, 0), ...a.slice().reverse()];
  const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
  const fits = {};
  for (const [k, plan] of Object.entries(rotations)) {
    const cyc = cycle(plan);
    let best = null;
    for (let s = 0; s < cyc.length; s++) {
      const kk = key(last5.map((g, i) => (cyc[(s + i) % cyc.length] === g ? 1 : 0)));
      if (!best || cmp(kk, best) > 0) best = kk;
    }
    fits[k] = best ?? [0];
  }
  const ids = Object.keys(fits);
  const best = ids.reduce((a, b) => (a == null || cmp(fits[b], fits[a]) > 0 ? b : a), null);
  const score = best ? fits[best][0] : 0;
  return {
    forage_years_last5: last5.filter(g => g === 'forage').length, corn_run: cornRun,
    rotation: best && last5.length && score >= Math.min(MIN_MATCH, last5.length - 1) ? best : null,
    rotation_best: best, rotation_ties: ids.filter(k => k !== best && fits[k][0] === score),
    rotation_match: `${score} of ${last5.length}`, last_year: ys.length ? ys[ys.length - 1] : null,
  };
}

// Engine inputs from the history (src/taupin/bake.py field_history on the fix branch): prior
// crops oldest first (hay and pasture as sod) and years since the last hay year (a lower bound
// when the record has none).
const ENGINE_CROP = { corn: 'corn', soybean: 'soybean', wheat: 'wheat', buckwheat: 'buckwheat', forage: 'sod', oat: 'oat', barley: 'barley', rye: 'rye', canola: 'canola' };
export function engineHistory(hist, startYear) {
  const ys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  if (!ys.length) return null;
  const sod = ys.filter(y => hist[y].group === 'forage');
  return { prior: ys.map(y => ENGINE_CROP[hist[y].group] ?? 'other'), years_since_sod: sod.length ? startYear - Math.max(...sod) : startYear - ys[0] + 1,
    years: [ys[0], ys[ys.length - 1]], sod_in_record: sod.length > 0, source: 'AAFC Annual Crop Inventory, 30 m, read in the browser' };
}
