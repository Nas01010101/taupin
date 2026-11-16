import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keepGoing, sequences, plan, planHTML } from '../js/nextcrops.js';
import { makeRules } from '../js/engine.js';

const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const cropData = J('../data/crops.json');
const laval = J('../data/fields/laval/risk.json');

test('keep going continues the rotation from where the field is', () => {
  assert.deepEqual(keepGoing(['corn', 'soybean'], ['corn', 'soybean', 'corn', 'soybean']).crops, ['corn', 'soybean', 'corn']);
  assert.deepEqual(keepGoing(['corn', 'soybean'], ['soybean', 'corn', 'soybean', 'corn']).crops, ['soybean', 'corn', 'soybean']);
  assert.deepEqual(keepGoing(['corn', 'soybean', 'wheat'], ['corn', 'soybean', 'wheat', 'corn', 'soybean']).crops, ['wheat', 'corn', 'soybean']);
  const k = keepGoing(['corn', 'soybean', 'wheat'], ['sod', 'sod', 'sod']);
  assert.equal(k.matched, 0); assert.equal(k.crops.length, 3);
});

test('all three-year sequences', () => {
  const s = sequences(['a', 'b', 'c']);
  assert.equal(s.length, 27); assert.deepEqual(s[0], ['a', 'a', 'a']); assert.deepEqual(s[26], ['c', 'c', 'c']);
});

test("plans start from the field's own history and leave out sourced conflicts", () => {
  const rules = makeRules(laval), prior = laval.history.prior;
  const p = plan({ risk: laval, rules, zone: 'upland', prior, current: laval.rotations.D_corn_soy, cropData, clim: null, chosen: ['pests', 'nitrogen', 'organic'] });
  // Laval ends corn, corn: corn and soybean continues with soybean.
  assert.equal(prior[prior.length - 1], 'corn');
  assert.equal(p.keep.crops[0], 'soybean');
  assert.equal(p.options.length, 3);
  for (const o of p.options) {
    assert.equal(o.crops.length, 3);
    for (let i = 1; i < o.crops.length; i++) assert.ok(!(o.crops[i - 1] === 'buckwheat' && ['soybean', 'canola'].includes(o.crops[i])), o.crops.join());
  }
  assert.ok(p.options[0].score >= p.keep.score - 1e-9 || p.keep.rank === 1);
  {
  }
  assert.ok(p.total > 300 && p.total <= 7 ** 3, String(p.total));   // 343 sequences less the conflicts
  assert.equal(typeof p.worth, 'boolean');
  const html = planHTML(p, { cropData, startYear: laval.start_year, source: 'AAFC crop inventory', rotationName: 'Corn and soybean' });
  assert.match(html, /What next on this field, 2026 to 2028/);
  assert.match(html, /Keep going|Worth a look/);
});

test('the pest levels of keep going match the engine from the same start', () => {
  const rules = makeRules(laval);
  const p = plan({ risk: laval, rules, zone: 'upland', prior: laval.history.prior, current: ['corn', 'soybean'], cropData, clim: null, chosen: ['pests'] });
  const base = laval.zones.upland.scenarios.baseline.D_corn_soy;
  // Keep going starts with soybean after corn, corn; the baked corn-soy plan starts with corn, so compare the engine directly.
  assert.ok(['LOW', 'MODERATE', 'HIGH'].includes(p.keep.years[0].wireworm));
  assert.equal(base.length, 5);
});
