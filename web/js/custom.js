// The farmer's own rotations: five crops picked on the page, kept in this browser only, scored by
// the same rules as the preset rotations (web/js/engine.js for the pest levels, soilwater.js for the
// soil and water columns). Pure data: no DOM. The crops offered are the ones with soil and water
// values in web/data/crops.json, so a crop added there with its sources becomes available here.

export const CUSTOM_KEY = 'taupin.customRotations';
export const MAX_CUSTOM = 3;
export const YEARS = 5;

export const isCustom = id => /^U\d+$/.test(id);

// Crops the farmer can pick: crops.json order, each with its display name.
export const pickable = cropData => Object.entries(cropData.crops).map(([id, c]) => ({ id, name: c.name }));

// A saved list is used only if it still fits: known crops, five years, at most MAX_CUSTOM.
export function cleanCustom(list, cropData) {
  if (!Array.isArray(list)) return [];
  const ok = new Set(Object.keys(cropData.crops));
  return list.filter(r => r && isCustom(r.id) && Array.isArray(r.crops) && r.crops.length === YEARS && r.crops.every(c => ok.has(c)))
    .slice(0, MAX_CUSTOM).map(r => ({ id: r.id, name: String(r.name ?? '').slice(0, 40), crops: [...r.crops] }));
}

export function loadCustom(storage, cropData) {
  try { return cleanCustom(JSON.parse(storage?.getItem(CUSTOM_KEY) ?? '[]'), cropData); } catch { return []; }
}

// Returns false when the browser blocks storage: the rotations then last for this visit only.
export function saveCustom(storage, list) {
  try { storage.setItem(CUSTOM_KEY, JSON.stringify(list)); return true; } catch { return false; }
}

// Adds a rotation; returns { list, error } with error a key of ERRORS when nothing was added.
export function addCustom(list, crops, name, cropData) {
  const ok = new Set(Object.keys(cropData.crops));
  if (list.length >= MAX_CUSTOM) return { list, error: 'full' };
  if (crops.length !== YEARS || !crops.every(c => ok.has(c))) return { list, error: 'crops' };
  if (list.some(r => r.crops.join() === crops.join())) return { list, error: 'same' };
  const used = new Set(list.map(r => r.id));
  let n = 1;
  while (used.has(`U${n}`)) n++;
  const label = String(name ?? '').trim().slice(0, 40) || `My rotation ${n}`;
  return { list: [...list, { id: `U${n}`, name: label, crops: [...crops] }], error: null };
}

export const ERRORS = {
  full: `Up to ${MAX_CUSTOM} of your own rotations: remove one to add another.`,
  crops: 'Pick a crop for each of the five years.',
  same: 'This sequence is already in your rotations.',
};

export const removeCustom = (list, id) => list.filter(r => r.id !== id);

const short = s => s.replace(/ \[.*\]$/, '');
const src = s => (s.match(/\[(.*)\]$/) ?? [])[1];

// Card text for a farmer's rotation, written from what the engine found year by year (`rows`: the
// rotation's row of riskView), so every line carries the source of the rule behind it.
export function customText(custom, row, cropData) {
  const evidence = [], seen = new Set();
  for (const y of row.years) {
    for (const t of y.trace) {
      if (t.startsWith('Prescription')) continue;
      const rule = short(t).replace(/\(years since sod=\d+, grass run=\d+\)/, '').replace(/CRW: \d+ prior/, 'CRW: prior');
      if (seen.has(rule)) continue;
      seen.add(rule);
      evidence.push(`${y.year} (${cropData.crops[y.crop]?.name ?? y.crop}): ${short(t)} [${src(t)}]`);
    }
  }
  const at = (pred) => row.years.filter(pred).map(y => y.year);
  const risks = [];
  const crw = at(y => y.crw === 'MODERATE' || y.crw === 'HIGH');
  if (crw.length) risks.push(`Corn after corn in ${crw.join(', ')}: corn rootworm moderate or high`);
  const ww = at(y => y.wireworm === 'HIGH');
  if (ww.length) risks.push(`Wireworm high in ${ww.join(', ')}: bait traps before buying seed`);
  const rx = at(y => y.rx);
  if (rx.length) risks.push(`The rules would support a coated-seed prescription in ${rx.join(', ')}; the agronomist decides`);
  return {
    why: `Your own rotation (${custom.crops.map(c => cropData.crops[c]?.name ?? c).join(', ')}), scored by the same rules and data as the others.`,
    evidence,
    risks: risks.length ? risks : ['No pest level above moderate under the engine rules'],
    gaps: ['Card text is written from the engine rules for this sequence; no agronomist note on it yet',
      'Before 2026 the field is taken as three sod years, the same start as the preset rotations'],
  };
}
