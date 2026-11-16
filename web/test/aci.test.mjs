import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { summary, cycle, majority, engineHistory, aciURL, groupOf, isFarm } from '../js/aci.js';

const risk = JSON.parse(readFileSync(new URL('../data/risk.json', import.meta.url), 'utf8'));
const hist = (groups, start = 2021) => Object.fromEntries(groups.map((g, i) => [start + i, { group: g }]));

test('rotation matching by cycle, recent-year tie-break, no preset on a weak match', () => {
  assert.deepEqual(cycle(['corn', 'soybean', 'corn', 'soybean', 'corn']), ['corn', 'soybean']);
  const laval = summary(hist(['corn', 'corn', 'soybean', 'corn', 'corn']), risk.rotations);
  assert.equal(laval.rotation, 'A_continuous_corn'); assert.deepEqual(laval.rotation_ties, ['G_corn_corn_soy_wheat']);
  const g = summary(hist(['corn', 'corn', 'corn', 'wheat']), risk.rotations);
  assert.equal(g.rotation, 'G_corn_corn_soy_wheat');
  const hay = summary(hist(['forage', 'soybean', 'soybean', 'forage', 'soybean']), risk.rotations);
  assert.equal(hay.rotation, null); assert.equal(hay.forage_years_last5, 2); assert.equal(hay.rotation_match, '2 of 5');
});

test('yearly crop: majority of farmed cells; town or forest is no crop year', () => {
  assert.deepEqual(majority([147, 147, 158, 34], [1, 1, 1, 1]), { code: 147, name: 'Corn', group: 'corn', share: 0.5 });
  assert.equal(majority([34, 34, 147], [1, 1, 1]), null);
  assert.equal(majority([147, 220], [0, 1]), null);
  assert.ok(isFarm(122) && !isFarm(220) && groupOf(136) === 'oat');
});

test('engine history: hay counts as sod; no hay gives a lower bound', () => {
  assert.deepEqual(engineHistory(hist(['forage', 'corn', 'soybean']), 2026).prior, ['sod', 'corn', 'soybean']);
  assert.equal(engineHistory(hist(['forage', 'corn', 'soybean']), 2026).years_since_sod, 5);
  const none = engineHistory(hist(['corn', 'soybean']), 2026);
  assert.equal(none.years_since_sod, 6); assert.equal(none.sod_in_record, false);
  assert.equal(engineHistory({}, 2026), null);
});

test('crop map URL asks for raw class codes as a PNG', () => {
  const u = new URL(aciURL(2024, [-73.6, 45.6, -73.5, 45.7], 20));
  assert.match(u.pathname, /annual_crop_inventory\/2024\/ImageServer\/exportImage$/);
  assert.equal(u.searchParams.get('renderingRule'), '{"rasterFunction":"None"}');
  assert.equal(u.searchParams.get('size'), '20,20'); assert.equal(u.searchParams.get('format'), 'png');
});
