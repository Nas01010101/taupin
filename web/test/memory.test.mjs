import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as m from '../js/memory.js';
import { readFileSync } from 'node:fs';
import { rank, climatology, rotationMetrics } from '../js/soilwater.js';
import { riskView } from '../js/risk.js';

const store = () => { const d = {}; return { getItem: k => d[k] ?? null, setItem: (k, v) => { d[k] = String(v); } }; };
// 2001-01-01 onward, 1 mm every day except 5 mm on each 15 Nov.
const weather = (() => {
  const start = '2001-01-01', t0 = Date.parse(start), rain = [];
  for (let i = 0; i < 9131; i++) { const d = new Date(t0 + i * 864e5); rain.push(d.getUTCMonth() === 10 && d.getUTCDate() === 15 ? 5 : 1); }
  return { start, rain };
})();
const smap = { samples: { '2020-06-10': 0.25 }, compare: { climatology: { '11': { smap: 0.31 } } } };

test('week context uses the week itself inside the record', () => {
  const c = m.weekContext(weather, smap, new Date('2020-06-12T10:00:00Z'));
  assert.deepEqual([c.rain_mm, c.rain_basis, c.moisture, c.moisture_basis], [7, 'that week', 0.25, 'that fortnight']);
});
test('week context falls back to the usual value after the record ends', () => {
  const c = m.weekContext(weather, smap, new Date('2026-11-15T15:00:00Z'));
  assert.equal(c.rain_mm, 11);   // six days at 1 mm plus the 5 mm day, every year
  assert.match(c.rain_basis, /^usual for this week, 25 years$/);
  assert.deepEqual([c.moisture, c.moisture_basis], [0.31, 'usual for this month']);
});
test('week context is empty without data', () => {
  assert.deepEqual(m.weekContext(null, null, new Date('2026-11-15')), { rain_mm: null, rain_basis: null, moisture: null, moisture_basis: null });
});
test('notes round-trip through storage and bad rows are dropped', () => {
  const s = store(), n = m.makeNote('water', { row: 10, col: 20 }, 'pocket', { rain_mm: 3 }, { time: new Date('2026-11-15T15:00:00Z') });
  assert.equal(m.makeNote('frog', { row: 1, col: 1 }, 'upland'), null);
  assert.equal(m.makeNote('rill', { row: 1.5, col: 1 }, 'upland'), null);
  assert.equal(m.makeNote('cover', { row: 1, col: 1 }, 'upland'), null, 'a cover note needs its level');
  s.setItem(m.NOTES_KEY, JSON.stringify([n, { kind: 'frog', row: 1, col: 1 }, null]));
  assert.deepEqual(m.loadNotes(s), [n]);
  assert.ok(m.saveNotes(s, [n, n]));
  assert.equal(m.loadNotes(s).length, 2);
  assert.deepEqual(m.loadNotes(null), []);
});

const at = { row: 5, col: 5 };
const note = (kind, cover = null, extra = {}) => m.makeNote(kind, at, 'upland', {}, { cover, ...extra });

test('a bare-soil note saved by the first version loads as low ground cover', () => {
  const s = store();
  s.setItem(m.NOTES_KEY, JSON.stringify([{ kind: 'bare', row: 3, col: 4, zone: 'upland', time: '2026-11-01T00:00:00.000Z' }]));
  const [n] = m.loadNotes(s);
  assert.deepEqual([n.kind, n.cover], ['cover', 'low']);
});

test('note effects: low cover and a channel each add one to the soil-loss weight, once per kind', () => {
  assert.deepEqual(m.noteEffects([]), { wet: false, weights: {}, water: 0, rill: 0, cover: { low: 0, medium: 0, high: 0 } });
  const low = note('cover', 'low'), mid = note('cover', 'medium'), high = note('cover', 'high'), rill = note('rill'), w = note('water');
  assert.deepEqual(m.noteEffects([low, low, low]).weights, { soil: 2 });
  assert.deepEqual(m.noteEffects([rill, rill]).weights, { soil: 2 });
  assert.deepEqual(m.noteEffects([low, rill]).weights, { soil: 3 });
  assert.deepEqual(m.noteEffects([mid, high]).weights, {});
  const wet = m.noteEffects([w]);
  assert.deepEqual([wet.wet, wet.weights], [true, {}], 'standing water opens the wet pocket and never weights water shortfall');
  assert.ok(!('water' in m.noteEffects([w]).weights));
});

test('note marks use the cover level colour and a 20 m radius', () => {
  const [a, b, c] = m.noteMarks([note('water'), note('cover', 'low'), note('cover', 'high')], 2);
  assert.deepEqual(a, { row: 5, col: 5, rgb: m.NOTE_KINDS.water.rgb, radius: 10 });
  assert.deepEqual(b.rgb, m.COVER_LEVELS.low.rgb);
  assert.deepEqual(c.rgb, m.COVER_LEVELS.high.rgb);
  assert.notDeepEqual(b.rgb, c.rgb);
});

// Four rotations with the real USLE-like spread: A and C lowest cover factor, B and D higher.
const rots = [['A', 0.40, 3], ['B', 0.43, 1], ['C', 0.40, 9], ['D', 0.44, 0]].map(([id, c, water]) => ({ id, metrics: { total: { c, water } } }));

test('the impact table shows score and rank with and without the note weights', () => {
  const all = ['soil', 'water'];
  const rows = m.notesImpact(rots, all, { soil: 3 });
  assert.equal(rows.length, 4);
  for (const r of rows) assert.ok(r.score >= 0 && r.score <= 1 && r.was >= 0 && r.was <= 1);
  const base = rank(rots, all).map(r => r.id), heavy = rank(rots, all, { soil: 3 }).map(r => r.id);
  assert.deepEqual(rows.map(r => r.id), heavy);
  assert.deepEqual(rows.slice().sort((a, b) => a.wasRank - b.wasRank).map(r => r.id), base);
  assert.notDeepEqual(base, heavy, 'a heavier soil-loss weight changes the order here');
});

test('with all five priorities ticked a note still moves the scores', () => {
  const five = ['pests', 'water', 'soil', 'nitrogen', 'organic'];
  const rows = m.notesImpact(rots, five, { soil: 2 });
  assert.ok(rows.some(r => Math.abs(r.score - r.was) > 1e-9));
  // soil loss not ticked: the weight has nothing to act on
  assert.ok(m.notesImpact(rots, ['water'], { soil: 2 }).every(r => r.score === r.was));
});

test('effect text states each kind plainly and never ties standing water to water shortfall', () => {
  assert.match(m.effectText('water'), /water-shortfall priority is not changed/);
  assert.match(m.effectText('rill'), /soil-loss priority counts one more time/);
  assert.match(m.effectText('cover', 'low'), /soil-loss priority counts one more time/);
  assert.match(m.effectText('cover', 'high'), /not changed/);
  assert.match(m.effectText('cover'), /Choose the cover level/);
  const lines = m.ruleLines(m.noteEffects([note('water'), note('cover', 'low'), note('rill'), note('cover', 'high')]));
  assert.equal(lines.length, 4);
  assert.match(lines[0], /Water shortfall is not changed/);
});

test('a scene answer pre-selects a kind, and the buttons stay manual when it is missing or unclear', () => {
  const ok = { id: 'wireworm', unclear: false }, no = { id: 'other', unclear: false };
  assert.equal(m.sceneKind('standing_water'), 'water');
  assert.equal(m.sceneKind({ label: 'Ground cover' }), 'cover');
  assert.equal(m.sceneKind('water channel'), 'rill');
  assert.equal(m.sceneKind('nonsense'), null);
  assert.equal(m.suggestKind(ok, 'ground_cover'), 'cover');
  assert.equal(m.suggestKind(ok, 'other'), null);
  assert.equal(m.suggestKind(ok, null), 'insect');
  assert.equal(m.suggestKind({ ...ok, unclear: true }, null), null);
  assert.equal(m.suggestKind(no, null), null);
});

test('field memory lists notes and finds together, newest first, each with its zone and NASA week', () => {
  const n1 = m.makeNote('water', at, 'pocket', { rain_mm: 11, rain_basis: 'that week' }, { time: new Date('2026-11-14T00:00:00Z') });
  const n2 = m.makeNote('cover', { row: 9, col: 9 }, 'upland', {}, { cover: 'low', time: new Date('2026-11-15T00:00:00Z') });
  const find = { time: '2020-06-12T10:00:00.000Z', lat: 1, lon: 2, label: 'Wireworm', answered_or_unclear: 'answered', count: 2 };
  const items = m.memoryItems({ notes: [n1, n2], finds: [find], weather, smap, zoneOfFind: () => 'upland' });
  assert.deepEqual(items.map(i => `${i.type}:${i.idx}`), ['note:1', 'note:0', 'find:0']);
  assert.equal(items[0].what, 'Ground cover, low');
  assert.equal(items[1].zone, 'low wet pocket');
  assert.match(items[1].ctx, /NASA GPM rain 11 mm in 7 days \(that week\)/);
  assert.match(items[2].ctx, /rain 7 mm.*SMAP root-zone moisture 0.25/);
  assert.equal(items[2].what, 'Soil insect: Wireworm, 2 found');
});

test('on the baked field, low cover moves every score and a channel on top swaps two rotations, with all five priorities ticked', () => {
  const J = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
  const risk = J('risk'), crops = J('crops'), weather = J('weather'), view = riskView(risk, 'upland', []);
  const clim = climatology(weather, crops.crops, risk.site?.lat ?? J('field').site.lat, crops.heavy_rain_mm);
  const list = view.rows.map(r => ({ id: r.rotation, metrics: rotationMetrics(risk.rotations[r.rotation], clim, crops, r, 'fall_plow') }));
  const five = ['pests', 'water', 'soil', 'nitrogen', 'organic'];
  const low = m.notesImpact(list, five, m.noteEffects([note('cover', 'low')]).weights);
  assert.ok(low.some(r => Math.abs(r.score - r.was) > 0.005), 'scores move');
  const both = m.notesImpact(list, five, m.noteEffects([note('cover', 'low'), note('rill')]).weights);
  assert.ok(both.some(r => r.rank !== r.wasRank), 'the order changes');
  assert.ok(both.every(r => r.score >= 0 && r.score <= 1));
});
