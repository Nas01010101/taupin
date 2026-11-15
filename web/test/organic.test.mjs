import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { soilgridsURL, parseSoilgrids, fetchSoilgrids, zoneOM, riskZone, zoneLabel, organicHTML } from '../js/organic.js';

const J = p => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const sgFx = J('./fixtures/soilgrids_soc.json');
const eus = J('../data/fields/eustache/field.json'), park = J('../data/field.json');

test('SoilGrids URL asks soc at three depths with the mean and the 5-95 % band', () => {
  const u = soilgridsURL(45.65, -74.03);
  assert.match(u, /lon=-74\.0300&lat=45\.6500&property=soc/);
  for (const d of ['0-5cm', '5-15cm', '15-30cm', 'mean', 'Q0.05', 'Q0.95']) assert.ok(u.includes(d));
});

test('SoilGrids dg/kg to %, 0-30 cm weighted by thickness, OM = OC x 1.724', () => {
  const sg = parseSoilgrids(sgFx);
  assert.equal(sg.rows.length, 3);
  assert.equal(sg.rows[0].oc, 8.91);
  assert.ok(Math.abs(sg.oc30 - (5 * 8.91 + 10 * 4.51 + 15 * 3.69) / 30) < 1e-9);
  assert.ok(Math.abs(sg.om30 - 1.724 * sg.oc30) < 1e-9);
  assert.equal(parseSoilgrids({}), null);
});

test('fetchSoilgrids reports a non-OK answer', async () => {
  await assert.rejects(fetchSoilgrids(1, 2, async () => ({ ok: false, status: 503 })), /503/);
  const sg = await fetchSoilgrids(1, 2, async () => ({ ok: true, json: async () => sgFx }));
  assert.equal(sg.rows.length, 3);
});

test('survey OM picks the soil case; under half covered falls back to SoilGrids', () => {
  const om = zoneOM(eus.organic, 'pocket', null);
  assert.equal(om.from, 'soil survey');
  assert.equal(om.om, eus.organic.pocket_om_pct);
  assert.equal(riskZone('pocket', om), 'upland');              // 8.1 % is under the RAP 10 %
  assert.equal(riskZone('upland', { om: 12.5 }), 'pocket');
  assert.equal(riskZone('pocket', null), 'pocket');            // nothing measured: keep the user's zone
  // The park survey has carbon for 4.4 of 36 ha only.
  assert.equal(zoneOM(park.organic, 'upland', null), null);
  assert.equal(zoneOM(park.organic, 'upland', parseSoilgrids(sgFx)).from, 'SoilGrids 0-30 cm');
  assert.match(zoneLabel('pocket', om), /^Low wet pocket: organic matter 8\.1 % from the soil survey, under/);
});

test('card shows survey units, SoilGrids 0-30 cm and escapes text', () => {
  const units = eus.layers.find(l => l.key === 'soil').classes;
  const h = organicHTML(eus.organic, units, parseSoilgrids(sgFx));
  assert.match(h, /Soil survey:<\/b> 7\.1 %/);
  assert.match(h, /SoilGrids at the parcel centre:<\/b> \d\.\d % organic matter, 0-30 cm\./);
  assert.match(h, /organic carbon x 1\.72\./);
  assert.match(h, /judge feedback/);
  assert.ok(!organicHTML(null, [{ symbol: 'X', area_ha: 1, om_pct: 1, components: [{ name: '<b>', oc_pct: 1 }] }], null).includes('<td><b>'));
  assert.match(organicHTML(null, [], null, { status: 'SoilGrids did not answer' }), /did not answer/);
});

test('organic matter ramp: fixed 0-20 % scale with the RAP factor in the middle', async () => {
  const { span, legend, colorOf } = await import('../js/layers.js');
  const l = park.layers.find(x => x.key === 'om');
  assert.deepEqual(span(l), [0, 20]);
  assert.deepEqual(legend(l).map(r => r.label), ['0', '10 (RAP factor)', '20 or more']);
  assert.deepEqual(colorOf(l, 51.4), colorOf(l, 20));   // muck clamps to the darkest brown
});
