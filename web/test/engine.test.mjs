import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { riskMatrix, planRotation, PARK_ZONES } from '../js/engine.js';

const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const risk = J('../data/risk.json');

test('with the park defaults the browser engine reproduces risk.json exactly, trace text included', () => {
  assert.deepEqual(riskMatrix({ rotations: risk.rotations, sources: risk.sources, startYear: risk.start_year }), risk);
});

test('a corn-corn history with a threshold trap count matches engine.py line for line', () => {
  // web/test/fixtures/engine_history_ref.json: engine.plan_rotation(..., years_since_sod=16,
  // prior=[soybean, wheat, soybean, corn, corn], traps={2026: 3.0}) for every rotation.
  const ref = J('./fixtures/engine_history_ref.json');
  for (const [k, crops] of Object.entries(risk.rotations))
    assert.deepEqual(planRotation(crops, PARK_ZONES.upland.field, { yearsSinceSod: 16, prior: ['soybean', 'wheat', 'soybean', 'corn', 'corn'], traps: { 2026: 3 } }, risk.sources), ref[k], k);
});

test('history changes the table: third corn year is rootworm HIGH; sod gone 16 years drops the grass factor', () => {
  const m = riskMatrix({ rotations: risk.rotations, sources: risk.sources, history: { prior: ['soybean', 'corn', 'corn'], years_since_sod: 16 } });
  const y = m.zones.upland.scenarios.baseline.A_continuous_corn[0];
  assert.equal(y.corn_rootworm, 'HIGH'); assert.equal(y.wireworm, 'LOW');
  assert.ok(m.history && !risk.history);
});
