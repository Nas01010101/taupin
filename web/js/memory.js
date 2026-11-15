// Field memory: dated notes on what a photo shows (standing water, ground cover, a water channel),
// each stored with the NASA rain and soil moisture of its week. Kept in this browser's
// localStorage and never sent anywhere. Pure functions except load/save, which take the storage
// object. Soil insect finds live in finds.js; memoryItems() merges both into one list.
import { rank } from './soilwater.js';

export const NOTES_KEY = 'taupin-notes';
export const MAX_NOTES = 500;
export const NOTE_RADIUS_M = 20;   // ground tinted around a note

// The farmer picks a level by looking at the ground; there is no percentage to enter.
export const COVER_LEVELS = {
  low: { label: 'Low', hint: 'mostly bare soil', rgb: [176, 106, 48], color: 0xb06a30 },
  medium: { label: 'Medium', hint: 'patchy cover', rgb: [158, 142, 72], color: 0x9e8e48 },
  high: { label: 'High', hint: 'soil mostly covered', rgb: [96, 138, 66], color: 0x608a42 },
};
export const NOTE_KINDS = {
  cover: { label: 'Ground cover', rgb: COVER_LEVELS.medium.rgb, color: COVER_LEVELS.medium.color },
  water: { label: 'Standing water', rgb: [44, 110, 155], color: 0x2c6e9b },
  rill: { label: 'Water channel', rgb: [96, 58, 34], color: 0x603a22 },
};
// The four things a photo can be logged as, in the order the buttons show them.
export const KIND_LABELS = { cover: NOTE_KINDS.cover.label, water: NOTE_KINDS.water.label, rill: NOTE_KINDS.rill.label, insect: 'Soil insect' };
export const noteLook = n => (n.kind === 'cover' && COVER_LEVELS[n.cover]) || NOTE_KINDS[n.kind];

const DAY = 864e5;
const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
const sum = xs => xs.reduce((a, b) => a + b, 0);

// NASA context for the 7 days ending on `time`. Inside the baked record it is that week's own
// value; after the record ends it is the usual value for that week of the year, and says so.
export function weekContext(weather, smap, time) {
  const out = { rain_mm: null, rain_basis: null, moisture: null, moisture_basis: null };
  const t = Date.UTC(time.getUTCFullYear(), time.getUTCMonth(), time.getUTCDate());
  if (weather?.rain?.length) {
    const t0 = Date.parse(weather.start), n = weather.rain.length, end = Math.round((t - t0) / DAY);
    const week = e => { const xs = weather.rain.slice(e - 6, e + 1); return e >= 6 && e < n && xs.every(v => v != null) ? sum(xs) : null; };
    const own = week(end);
    if (own != null) { out.rain_mm = r1(own); out.rain_basis = 'that week'; } else {
      const y0 = new Date(t0).getUTCFullYear(), y1 = new Date(t0 + (n - 1) * DAY).getUTCFullYear(), vals = [];
      for (let y = y0; y <= y1; y++) {
        const v = week(Math.round((Date.UTC(y, time.getUTCMonth(), time.getUTCDate()) - t0) / DAY));
        if (v != null) vals.push(v);
      }
      if (vals.length) { out.rain_mm = r1(sum(vals) / vals.length); out.rain_basis = `usual for this week, ${vals.length} years`; }
    }
  }
  const near = Object.entries(smap?.samples ?? {}).map(([d, v]) => [Math.abs(Date.parse(d) - t), v]).sort((a, b) => a[0] - b[0])[0];
  if (near && near[0] <= 16 * DAY) { out.moisture = r3(near[1]); out.moisture_basis = 'that fortnight'; } else {
    const m = smap?.compare?.climatology?.[String(time.getUTCMonth() + 1).padStart(2, '0')]?.smap;
    if (m != null) { out.moisture = r3(m); out.moisture_basis = 'usual for this month'; }
  }
  return out;
}

// One note. cell = { row, col } on the field grid, zone = 'upland' | 'pocket'. A ground-cover
// note needs its level.
export function makeNote(kind, cell, zone, context = {}, { time = new Date(), pos = null, cover = null } = {}) {
  if (!NOTE_KINDS[kind] || !cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.col)) return null;
  if (kind === 'cover' && !COVER_LEVELS[cover]) return null;
  return { kind, ...(kind === 'cover' ? { cover } : {}), row: cell.row, col: cell.col, zone: zone === 'pocket' ? 'pocket' : 'upland',
    time: time.toISOString(), lat: pos?.lat ?? null, lon: pos?.lon ?? null, ...context };
}

// 'bare' was the first version's name for a ground-cover note at the low level.
const migrate = n => (n?.kind === 'bare' ? { ...n, kind: 'cover', cover: 'low' } : n);
export function loadNotes(storage) {
  try {
    const list = JSON.parse(storage.getItem(NOTES_KEY));
    return Array.isArray(list) ? list.map(migrate).filter(n => n && NOTE_KINDS[n.kind] && Number.isInteger(n.row) && Number.isInteger(n.col)
      && (n.kind !== 'cover' || COVER_LEVELS[n.cover])) : [];
  } catch { return []; }
}
export function saveNotes(storage, notes) {
  try { storage.setItem(NOTES_KEY, JSON.stringify(notes.slice(-MAX_NOTES))); return true; } catch { return false; }
}

// Tinted patches for the 3D field: one disc per note, radius in grid cells.
export const noteMarks = (notes, resM) => notes.map(n => ({ row: n.row, col: n.col, rgb: noteLook(n).rgb, radius: Math.round(NOTE_RADIUS_M / resM) }));

// What the notes change in the rotation comparison. The rule is a judgement, not a measurement:
//  - standing water: the ground counts as a low wet pocket, so the pest table opens on it. It
//    never touches the water-shortfall priority, which is crop need against rain, not wet ground.
//  - low ground cover, and a water channel: each adds one to the weight of the soil-loss
//    priority (counted once per kind, however many notes). The priority reads the USLE cover
//    factor, so the rotations with more cover gain.
//  - medium or high ground cover: listed, no change.
export function noteEffects(notes) {
  const count = k => notes.filter(n => n.kind === k).length;
  const cover = { low: 0, medium: 0, high: 0 };
  for (const n of notes) if (n.kind === 'cover') cover[n.cover]++;
  const water = count('water'), rill = count('rill'), soil = 1 + (cover.low ? 1 : 0) + (rill ? 1 : 0);
  return { wet: water > 0, weights: soil > 1 ? { soil } : {}, water, rill, cover };
}

// Plain-words effect of one kind, shown before the farmer logs it.
export function effectText(kind, cover = null) {
  if (kind === 'water') return 'Marks a wet zone with that week\'s NASA rain. The pest table opens on the low wet pocket. The water-shortfall priority is not changed.';
  if (kind === 'rill') return 'Marks a hotspot. The soil-loss priority counts one more time, so rotations with a lower USLE cover factor (more cover) rank higher.';
  if (kind === 'cover') return cover === 'low' ? 'Marks bare ground. The soil-loss priority counts one more time, so rotations with a lower USLE cover factor (more cover) rank higher.'
    : cover ? 'Listed with its cover level. The rotation ranking is not changed.' : 'Choose the cover level.';
  if (kind === 'insect') return 'Pins the insect with its place and date. A pest photo opens the pest table for this visit; a beneficial insect is listed as soil life.';
  return '';
}

// The "what your notes changed" lines, one per rule that applies.
export function ruleLines(fx) {
  const s = n => (n === 1 ? '' : 's'), c = fx.cover, out = [];
  if (fx.water) out.push(`${fx.water} standing-water note${s(fx.water)}: that ground counts as a low wet pocket and the pest table opens on it. Water shortfall is not changed.`);
  if (c.low) out.push(`${c.low} low-cover note${s(c.low)}: the soil-loss priority counts one more time.`);
  if (fx.rill) out.push(`${fx.rill} water-channel note${s(fx.rill)}: the soil-loss priority counts one more time.`);
  const keep = c.medium + c.high;
  if (keep) out.push(`${keep} medium or high cover note${s(keep)}: listed, and the ranking is not changed.`);
  return out;
}

// Score and rank of every rotation with and without the note weights. Rows come back in the
// order they rank with the notes; was / wasRank are the values without them.
export function notesImpact(rotations, chosen, weights) {
  const base = Object.fromEntries(rank(rotations, chosen).map(r => [r.id, r]));
  return rank(rotations, chosen, weights).map(r => ({ id: r.id, score: r.score, rank: r.rank, was: base[r.id].score, wasRank: base[r.id].rank }));
}

// A photo kind to pre-select. `scene` is the answer of web/js/sceneclass.js when that module is
// installed (a label, or { label | kind | class | name }); `decision` is the insect model's answer.
const SCENE_ALIASES = { insect: 'insect', standing_water: 'water', water: 'water', ground_cover: 'cover', cover: 'cover', residue: 'cover',
  water_channel: 'rill', rill: 'rill', channel: 'rill', other: 'other' };
export function sceneKind(scene) {
  const raw = typeof scene === 'string' ? scene : scene?.label ?? scene?.kind ?? scene?.class ?? scene?.name;
  return SCENE_ALIASES[String(raw ?? '').toLowerCase().trim().replace(/[^a-z]+/g, '_')] ?? null;
}
export function suggestKind(decision, scene) {
  const s = sceneKind(scene);
  if (s) return s === 'other' ? null : s;
  return decision && !decision.unclear && decision.id !== 'other' ? 'insect' : null;
}

// ---- one list for notes and insect finds ----
const ctxText = c => [
  c.rain_mm != null ? `NASA GPM rain ${c.rain_mm} mm in 7 days (${c.rain_basis})` : '',
  c.moisture != null ? `SMAP root-zone moisture ${c.moisture} m3/m3 (${c.moisture_basis})` : '',
].filter(Boolean).join('; ');
export const noteLabel = n => `${NOTE_KINDS[n.kind].label}${n.kind === 'cover' ? `, ${n.cover}` : ''}`;
export const findLabel = f => `Soil insect: ${f.answered_or_unclear === 'unclear' ? `unclear (best guess ${f.label})` : f.label}${f.count != null ? `, ${f.count} found` : ''}`;

// Newest first. zoneOfFind(find) gives the zone text of a find, which has only a lat/lon.
export function memoryItems({ notes, finds, weather, smap, zoneOfFind }) {
  const t = x => Date.parse(x) || 0;
  return [
    ...notes.map((n, idx) => ({ type: 'note', idx, time: n.time, what: noteLabel(n), zone: n.zone === 'pocket' ? 'low wet pocket' : 'upland', ctx: ctxText(n) })),
    ...finds.map((f, idx) => ({ type: 'find', idx, time: f.time, what: findLabel(f), zone: zoneOfFind(f),
      ctx: ctxText(weekContext(weather, smap, new Date(f.time))) })),
  ].sort((a, b) => t(b.time) - t(a.time));
}
