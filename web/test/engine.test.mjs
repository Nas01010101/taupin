import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeRules, planRotation, pyFloat, scenariosFor } from '../js/engine.js';

const json = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const risk = json('../data/risk.json'), fx = json('./fixtures/engine_parity.json');
const R = makeRules(risk);

test('python float formatting', () => {
  assert.equal(pyFloat(3), '3.0');
  assert.equal(pyFloat(4.25), '4.25');
  assert.equal(pyFloat(0), '0.0');
});

test('the port reproduces every preset rotation of risk.json, both zones and both scenarios', () => {
  for (const zone of Object.keys(risk.zones)) {
    for (const [id, crops] of Object.entries(risk.rotations)) {
      const got = scenariosFor(risk, R, zone, crops);
      for (const scen of ['baseline', 'trap_threshold']) assert.deepEqual(got[scen], risk.zones[zone].scenarios[scen][id], `${zone} ${id} ${scen}`);
    }
  }
});

test('the port matches the engine on every 5-year sequence of the crops with data', () => {
  const compact = rows => rows.map(r => `${r.wireworm[0]}/${r.corn_rootworm[0]}/${r.prescription_supportable ? 1 : 0}`).join(' ');
  assert.equal(fx.exhaustive.length, 2 * 4 ** 5);
  for (const c of fx.exhaustive) {
    assert.equal(compact(planRotation(R, c.crops, risk.zones[c.zone].field, { startYear: fx.start_year })), c.levels, `${c.zone} ${c.crops}`);
  }
});

test('the port matches the engine, traces included, on seeded soils, histories and trap means', () => {
  assert.equal(fx.random.length, 80);
  for (const c of fx.random) {
    const traps = Object.fromEntries(Object.entries(c.traps).map(([y, v]) => [Number(y), v]));
    const got = planRotation(R, c.crops, c.field, { startYear: fx.start_year, yearsSinceSod: c.years_since_sod, prior: c.prior, traps });
    assert.deepEqual(got, c.expected, JSON.stringify(c.crops));
  }
});
