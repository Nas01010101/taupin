// The field's crop history for the last five years, checked and corrected by the farmer. Pure data:
// no DOM. On a baked farm field the years start from the satellite record that the field's
// risk.json was baked from (`history`: AAFC Annual Crop Inventory, mapped to the engine's crops by
// src/taupin/bake.py field_history); the farmer confirms or changes each year. With no record (the
// park, or a point typed in step 1) the years start empty and the engine keeps the baked start.
// The result is the engine's start for the 2026 plan: the crops before 2026 and the years since the
// last hay or pasture year. It is kept in this browser only, per field.

export const YEARS = 5;
export const histKey = fieldKey => `taupin.history.${fieldKey}`;

// What the farmer can pick for a past year: the engine's crops, hay or pasture (the engine's sod),
// and "other" for a crop or fallow the engine has no rule for.
export const PAST_CROPS = ['corn', 'soybean', 'wheat', 'barley', 'oat', 'rye', 'canola', 'buckwheat', 'sod', 'other'];
export const PAST_LABEL = {
  corn: 'Corn', soybean: 'Soybean', wheat: 'Wheat', barley: 'Barley', oat: 'Oats', rye: 'Rye', canola: 'Canola',
  buckwheat: 'Buckwheat', sod: 'Hay or pasture', other: 'Other crop or fallow',
};

// The window of years shown: the five years before the plan starts.
export const windowYears = startYear => Array.from({ length: YEARS }, (_, i) => startYear - YEARS + i);

// Satellite years from risk.json `history` ({prior, years: [first, last]}), as {year: crop}.
export function satelliteYears(history) {
  if (!history?.prior?.length) return {};
  const [first] = history.years;
  return Object.fromEntries(history.prior.map((c, i) => [first + i, PAST_CROPS.includes(c) ? c : 'other']));
}

// The rows the form shows: for each year, the crop, where it comes from, and the satellite share.
// entries: the farmer's {year: crop}; shares: field.json crops.per_year[y].share where known.
export function rows(startYear, sat, entries = {}, shares = {}) {
  return windowYears(startYear).map(y => {
    const mine = entries[y], s = sat[y];
    return {
      year: y,
      crop: mine ?? s ?? null,
      from: mine != null ? (mine === s ? 'confirmed' : 'farmer') : s != null ? 'satellite' : 'none',
      satellite: s ?? null,
      share: shares[y] ?? null,
    };
  });
}

// True when the farmer's years change what the engine starts from.
export function changesStart(sat, entries = {}, lastHay = null) {
  return Object.entries(entries).some(([y, c]) => sat[y] !== c) || lastHay != null;
}

/**
 * The engine's start from the satellite record and the farmer's entries. Prior crops: the record's
 * older years, then the five years as shown (farmer first, satellite otherwise; a year with neither
 * is left out). Years since sod: from the latest hay or pasture year among the shown years, the
 * record, and the farmer's "last hay year"; with none known, from the first known year (a lower
 * bound, as the bake does). Returns null when no year is known at all.
 */
export function engineStart(startYear, sat, entries = {}, lastHay = null) {
  const win = new Set(windowYears(startYear));
  const merged = { ...Object.fromEntries(Object.entries(sat).map(([y, c]) => [Number(y), c])),
    ...Object.fromEntries(Object.entries(entries).map(([y, c]) => [Number(y), c])) };
  const years = Object.keys(merged).map(Number).filter(y => y < startYear).sort((a, b) => a - b);
  if (!years.length) return null;
  const prior = years.map(y => merged[y]);
  const sodYears = years.filter(y => merged[y] === 'sod');
  if (lastHay != null && Number.isInteger(lastHay) && lastHay < startYear) sodYears.push(lastHay);
  const last = sodYears.length ? Math.max(...sodYears) : null;
  return {
    prior, yearsSinceSod: last != null ? startYear - last : startYear - years[0] + 1,
    sodKnown: last != null, fromFarmer: Object.keys(entries).some(y => win.has(Number(y))) || lastHay != null,
  };
}

export function loadHistory(storage, fieldKey) {
  try {
    const v = JSON.parse(storage?.getItem(histKey(fieldKey)) ?? 'null');
    if (!v || typeof v !== 'object') return { entries: {}, lastHay: null };
    const entries = Object.fromEntries(Object.entries(v.entries ?? {}).filter(([y, c]) => /^\d{4}$/.test(y) && PAST_CROPS.includes(c)));
    return { entries, lastHay: Number.isInteger(v.lastHay) ? v.lastHay : null };
  } catch { return { entries: {}, lastHay: null }; }
}

// Returns false when the browser blocks storage: the history then lasts for this visit only.
export function saveHistory(storage, fieldKey, h) {
  try { storage.setItem(histKey(fieldKey), JSON.stringify(h)); return true; } catch { return false; }
}

// Lines for the agronomist record: each year with where it comes from.
export function historyLines(rowList, lastHay, sodKnown) {
  const src = { satellite: 'satellite map', farmer: 'entered by the farmer', confirmed: 'satellite map, confirmed by the farmer', none: 'not known' };
  return [
    ...rowList.map(r => `  ${r.year}: ${r.crop ? PAST_LABEL[r.crop] : '?'} (${src[r.from]}${r.from === 'farmer' && r.satellite ? `; the satellite map said ${PAST_LABEL[r.satellite]}` : ''})`),
    ...(lastHay != null ? [`  Last hay or pasture year, entered by the farmer: ${lastHay}`] : []),
    ...(sodKnown ? [] : ['  No hay or pasture year known: years since sod is a lower bound']),
  ];
}
