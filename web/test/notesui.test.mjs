import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as m from '../js/memory.js';
import * as mu from '../js/memoryui.js';
import { createMapNotes } from '../js/mapnotes.js';
import { resultHTML } from '../js/ui.js';
import { formatAnswer } from '../js/classify.js';
import { tableHTML } from '../js/swui.js';
import { rank, climatology, rotationMetrics } from '../js/soilwater.js';
import { riskView, ROTATION_NAMES } from '../js/risk.js';

const at = { row: 5, col: 5 };
const T = new Date('2026-11-15T00:00:00Z');

test('the log panel offers four kinds, needs a cover level, and escapes the position text', () => {
  const html = mu.logHTML({ log: { kind: 'cover', cover: null, suggested: false }, position: '<b>x</b>' });
  for (const k of ['cover', 'water', 'rill', 'insect']) assert.match(html, new RegExp(`data-log="kind:${k}"`));
  assert.match(html, /data-log="save" disabled/);
  assert.match(mu.logHTML({ log: { kind: 'cover', cover: 'low' }, position: '' }), /data-log="save">/);
  assert.match(mu.logHTML({ log: { kind: 'insect', cover: null }, position: '' }), /id="find-count"/);
  assert.ok(html.includes('&lt;b&gt;') && !html.includes('<b>x'));
  assert.match(mu.logHTML({ log: { kind: 'water', suggested: true }, position: '' }), /Suggested by the photo check: Standing water/);
  assert.ok(!html.includes('style="'));
});

test('the memory list gives every row its own delete, escapes values, and shows exports only with finds', () => {
  const n = m.makeNote('water', at, 'pocket', { rain_mm: 1, rain_basis: '<i>' }, { time: T });
  const items = m.memoryItems({ notes: [n], finds: [], weather: null, smap: null, zoneOfFind: () => '' });
  const html = mu.memoryHTML({ items, notes: 1, finds: 0 });
  assert.match(html, /data-del="note:0"/);
  assert.match(html, /data-del="all"/);
  assert.ok(!/Export finds/.test(html));
  assert.ok(html.includes('&lt;i&gt;') && !html.includes('<i>'));
  assert.equal(mu.memoryHTML({ items: [], notes: 0, finds: 0 }), '');
});

test('the map bar toggles, lists the three note kinds and asks for a cover level', () => {
  assert.match(mu.mapBarHTML({ mode: null, kind: 'cover', cover: null }), /data-map="toggle" aria-pressed="false"/);
  assert.ok(!/data-map="kind/.test(mu.mapBarHTML({ mode: null, kind: 'cover', cover: null })));
  const on = mu.mapBarHTML({ mode: 'add', kind: 'cover', cover: 'low' });
  for (const k of ['cover', 'water', 'rill']) assert.match(on, new RegExp(`data-map="kind:${k}"`));
  assert.match(on, /data-map="cover:high"/);
  assert.ok(!/data-map="cover/.test(mu.mapBarHTML({ mode: 'add', kind: 'rill', cover: null })));
});

test('the selected pin shows kind, date, zone and NASA week with move and delete', () => {
  const item = { type: 'note', idx: 0, time: T.toISOString(), what: 'Standing water', zone: 'low wet pocket', ctx: 'NASA GPM rain 4 mm in 7 days (that week)' };
  const html = mu.pinDetailHTML({ item, effect: m.effectText('water'), moving: true });
  for (const x of ['Standing water', '2026-11-15', 'low wet pocket', 'NASA GPM rain 4 mm', 'data-pin="move" aria-pressed="true"', 'data-pin="delete"', 'Click the field to place']) assert.ok(html.includes(x), x);
});

test('the photo answer shows the same label and percent as the model line', () => {
  for (const d of [{ name: 'Wireworm', prob: 0.97123, pest: true, unclear: false, top: [{ name: 'Wireworm', prob: 0.97123 }] },
    { name: 'Ground beetle', prob: 0.5, pest: false, unclear: true, top: [{ name: 'Ground beetle', prob: 0.5 }] }]) {
    const line = formatAnswer(d), pct = line.match(/\d+\.\d %/)[0];
    const html = resultHTML({ kind: 'result', decision: d, abstain: 0.6, effect: { note: 'x' }, thumb: null });
    assert.ok(html.includes(d.name) && html.includes(pct), `${d.name} ${pct}`);
  }
});

// --- map notes against a fake page: no DOM, the scene and storage are stubs ---
function harness(over = {}) {
  const log = { status: [], saved: 0, pick: [] };
  const state = { notes: [], finds: [], zone: 'upland' };
  const el = { innerHTML: '', querySelector: () => null };
  const ctx = {
    el, state, scene: { setPickMode: v => log.pick.push(v) },
    data: () => ({ field: JSON.parse(readFileSync(new URL('../data/field.json', import.meta.url))), weather: null, smap: null }),
    zoneOf: c => (c.row > 100 ? 'pocket' : 'upland'), store: { setItem: () => { log.saved++; } },
    items: () => m.memoryItems({ notes: state.notes, finds: state.finds, weather: null, smap: null, zoneOfFind: () => 'upland' }),
    remove: (t, i) => { state[t === 'note' ? 'notes' : 'finds'].splice(i, 1); }, refresh: () => mn.render(),
    status: t => log.status.push(t), photoPending: () => false, ...over,
  };
  const mn = createMapNotes(ctx);
  const click = (attr, v) => mn.onClick({ target: { closest: s => (s === `[${attr.split('=')[0]}]` ? { dataset: { [attr.split('=')[0].replace('data-', '')]: v } } : null) } });
  return { mn, state, el, log, click };
}

test('add mode drops a note of the chosen kind where the field is clicked, with no photo', () => {
  const h = harness();
  assert.equal(h.mn.onPick(3, 4), false, 'off by default: the click is left to the photo pin');
  h.click('data-map', 'toggle');
  assert.match(h.el.innerHTML, /data-map="kind:water"/);
  assert.equal(h.mn.onPick(3, 4), true);
  assert.equal(h.state.notes.length, 0, 'a cover note waits for its level');
  assert.match(h.log.status.at(-1), /Choose the cover level/);
  h.click('data-map', 'cover:low');
  h.mn.onPick(3, 4);
  assert.deepEqual([h.state.notes[0].kind, h.state.notes[0].cover, h.state.notes[0].row, h.state.notes[0].col, h.state.notes[0].zone], ['cover', 'low', 3, 4, 'upland']);
  h.click('data-map', 'kind:water'); h.mn.onPick(2, 4);   // upland cell: standing water still counts as the wet pocket
  assert.deepEqual([h.state.notes[1].kind, h.state.notes[1].zone, h.state.zone], ['water', 'pocket', 'pocket']);
  h.click('data-map', 'kind:rill'); h.mn.onPick(7, 7);
  assert.equal(h.state.notes[2].kind, 'rill');
  assert.equal(h.log.saved, 3);
  assert.equal(h.mn.sel, 'note:2');
  assert.match(h.el.innerHTML, /Selected pin/);
});

test('a pin can be selected, moved, and deleted', () => {
  const h = harness();
  h.state.notes.push(m.makeNote('rill', at, 'upland', {}, { time: T }));
  h.mn.onPin('note:0');
  assert.match(h.el.innerHTML, /Water channel/);
  h.click('data-pin', 'move');
  assert.match(h.el.innerHTML, /Click the field to place/);
  assert.equal(h.mn.onPick(110, 9), true);
  assert.deepEqual([h.state.notes[0].row, h.state.notes[0].col, h.state.notes[0].zone, h.state.notes[0].time], [110, 9, 'pocket', T.toISOString()]);
  assert.equal(h.mn.onPick(1, 1), false, 'moving is one click');
  h.click('data-pin', 'delete');
  assert.equal(h.state.notes.length, 0);
  assert.equal(h.mn.sel, null);
  assert.ok(!/Selected pin/.test(h.el.innerHTML));
});

test('moving a find rewrites its lat/lon from the clicked cell and marks it as a pin position', () => {
  const h = harness();
  h.state.finds.push({ time: T.toISOString(), lat: 45.5, lon: -73.76, accuracy_m: 5, source: 'device', label: 'Wireworm', confidence: 0.9, answered_or_unclear: 'answered', count: null });
  h.mn.onPin('find:0'); h.click('data-pin', 'move'); h.mn.onPick(20, 30);
  const f = h.state.finds[0];
  assert.equal(f.source, 'pin');
  assert.equal(f.accuracy_m, null);
  assert.notEqual(f.lat, 45.5);
});

test('the field shows a crosshair while a mode is on or a photo waits', () => {
  const h = harness();
  h.mn.render(); assert.equal(h.log.pick.at(-1), false);
  h.click('data-map', 'toggle'); assert.equal(h.log.pick.at(-1), true);
  const p = harness({ photoPending: () => true }); p.mn.render(); assert.equal(p.log.pick.at(-1), true);
});

test('the rotation table shows each score and what the notes did to it', () => {
  const J = f => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
  const risk = J('risk'), crops = J('crops'), view = riskView(risk, 'upland', []);
  const clim = climatology(J('weather'), crops.crops, J('field').site.lat, crops.heavy_rain_mm);
  const byId = Object.fromEntries(view.rows.map(r => [r.rotation, rotationMetrics(risk.rotations[r.rotation], clim, crops, r, 'fall_plow')]));
  const list = view.rows.map(r => ({ id: r.rotation, metrics: byId[r.rotation] })), five = ['pests', 'water', 'soil', 'nitrogen', 'organic'];
  const names = Object.fromEntries(Object.keys(byId).map(id => [id, ROTATION_NAMES[id] ?? id]));
  const w = m.noteEffects([m.makeNote('cover', at, 'upland', {}, { cover: 'low' }), m.makeNote('rill', at, 'upland')]).weights;
  const impact = Object.fromEntries(m.notesImpact(list, five, w).map(r => [r.id, r]));
  const html = tableHTML(rank(list, five, w), byId, names, null, impact);
  assert.match(html, /Score, 0 to 1/);
  assert.match(html, /from notes/);
  assert.match(html, /moved from/);
  assert.ok(!/from notes/.test(tableHTML(rank(list, five), byId, names, null, null)));
  const text = mu.impactHTML({ fx: m.noteEffects([m.makeNote('cover', at, 'upland', {}, { cover: 'low' })]), chosen: five,
    impact: m.notesImpact(list, five, { soil: 2 }), names, cover: Object.fromEntries(Object.entries(byId).map(([id, v]) => [id, v.total.c])) });
  assert.match(text, /The scores moved|The order changed/);
  assert.match(text, /a rule, not a measurement/);
  assert.equal(mu.impactHTML({ fx: m.noteEffects([]), chosen: five, impact: [], names, cover: {} }), '');
});
