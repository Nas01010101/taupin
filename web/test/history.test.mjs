import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { changesStart, engineStart, historyLines, loadHistory, rows, satelliteYears, saveHistory, windowYears } from '../js/history.js';
import { makeRules, scenariosFor } from '../js/engine.js';
import { recordText } from '../js/scout.js';

const json = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const FIELDS = ['laval', 'mirabel', 'eustache'];

test('each farm\'s pest table equals the browser engine from the start it was baked with', () => {
  for (const f of FIELDS) {
    const risk = json(`fields/${f}/risk.json`), R = makeRules(risk);
    for (const zone of Object.keys(risk.zones)) {
      for (const [id, crops] of Object.entries(risk.rotations)) {
        const got = scenariosFor(risk, R, zone, crops);
        for (const s of ['baseline', 'trap_threshold']) assert.deepEqual(got[s], risk.zones[zone].scenarios[s][id], `${f} ${zone} ${id} ${s}`);
      }
    }
  }
});

test('the satellite years and the start they give equal the bake', () => {
  const risk = json('fields/laval/risk.json'), sat = satelliteYears(risk.history);
  assert.deepEqual(windowYears(2026), [2021, 2022, 2023, 2024, 2025]);
  assert.equal(sat[2025], 'corn');
  const s = engineStart(2026, sat);
  assert.deepEqual(s.prior, risk.rules.default_prior);
  assert.equal(s.yearsSinceSod, risk.rules.default_years_since_sod);
  assert.equal(changesStart(sat, { 2025: 'corn' }), false);   // confirming a year changes nothing
  assert.equal(changesStart(sat, { 2025: 'soybean' }), true);
  assert.equal(changesStart(sat, {}, 2019), true);
});

test('a corrected year changes the levels: Laval 2025 soybean, not corn, takes 2026 corn rootworm from HIGH to LOW', () => {
  const risk = json('fields/laval/risk.json'), R = makeRules(risk), sat = satelliteYears(risk.history);
  const corn = risk.rotations.A_continuous_corn;
  const baked = scenariosFor(risk, R, 'upland', corn).baseline[0];
  const mine = scenariosFor(risk, R, 'upland', corn, engineStart(2026, sat, { 2025: 'soybean' })).baseline[0];
  assert.deepEqual([baked.corn_rootworm, mine.corn_rootworm], ['HIGH', 'LOW']);
});

test('hay entered by the farmer counts for wireworm; a last hay year before the window too', () => {
  const sat = satelliteYears(json('fields/laval/risk.json').history);
  assert.equal(engineStart(2026, sat, { 2024: 'sod' }).yearsSinceSod, 2);
  assert.equal(engineStart(2026, sat, {}, 2019).yearsSinceSod, 7);
  const none = engineStart(2026, sat);
  assert.equal(none.sodKnown, false);
  assert.equal(none.yearsSinceSod, 2026 - 2011 + 1);
  // No satellite record (the park): only the farmer's years, a lower bound from the first one.
  assert.equal(engineStart(2026, {}), null);
  assert.deepEqual(engineStart(2026, {}, { 2024: 'corn', 2025: 'corn' }), { prior: ['corn', 'corn'], yearsSinceSod: 3, sodKnown: false, fromFarmer: true });
});

test('rows say where each year comes from, and the record lists them', () => {
  const sat = { 2023: 'corn', 2024: 'corn', 2025: 'corn' };
  const r = rows(2026, sat, { 2024: 'corn', 2025: 'soybean' }, { 2023: 0.6 });
  assert.deepEqual(r.map(x => x.from), ['none', 'none', 'satellite', 'confirmed', 'farmer']);
  assert.equal(r[2].share, 0.6);
  const lines = historyLines(r, 2019, true);
  assert.match(lines[4], /^ {2}2025: Soybean \(entered by the farmer; the satellite map said Corn\)$/);
  assert.match(lines.at(-1), /2019$/);
  assert.match(historyLines(r, null, false).at(-1), /lower bound/);
  const field = json('field.json');
  const text = recordText({ date: '2026-05-01', field, window: { mean12: '14 May', span: [1995, 2025], last12: '8 May', lastYear: 2025 }, sheet: { counts: {}, dates: [], genus: 'hypnoidus' }, history: lines });
  assert.match(text, /Crop history behind the pest levels\n {2}2021/);
  assert.doesNotMatch(recordText({ date: '2026-05-01', field, window: { mean12: '14 May', span: [1995, 2025], last12: '8 May', lastYear: 2025 }, sheet: { counts: {}, dates: [], genus: 'hypnoidus' } }), /Crop history behind/);
});

test('the history is kept per field on the device and survives bad storage', () => {
  const m = new Map(), store = { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  assert.ok(saveHistory(store, 'laval', { entries: { 2025: 'soybean', 1999: 'nope' }, lastHay: 2019 }));
  assert.deepEqual(loadHistory(store, 'laval'), { entries: { 2025: 'soybean' }, lastHay: 2019 });
  assert.deepEqual(loadHistory(store, 'mirabel'), { entries: {}, lastHay: null });
  assert.deepEqual(loadHistory({ getItem: () => '{oops' }, 'laval'), { entries: {}, lastHay: null });
  assert.equal(saveHistory({ setItem: () => { throw new Error('blocked'); } }, 'laval', {}), false);
});

test('the history text reads in French', async () => {
  const { translate } = await import('../js/i18n.js');
  const fr = s => translate(s).replace(/\s/g, ' ');
  assert.equal(fr('Check your crop history'), 'Vérifier votre historique de cultures');
  assert.match(fr('2025: Soybean (entered by the farmer; the satellite map said Corn)'), /^2025 ?: Soya \(entré par l[’']agriculteur; la carte satellite indiquait Maïs\)$/);
  assert.match(fr('satellite map, 62 %'), /^carte satellite, 62 %$/);
});

test('the crops the farmer can enter have soil and water values, except rye, hay or pasture and "other"', async () => {
  const { PAST_CROPS } = await import('../js/history.js');
  const crops = json('crops.json');
  assert.deepEqual(PAST_CROPS.filter(c => !crops.crops[c]), ['rye', 'sod', 'other']);
});
