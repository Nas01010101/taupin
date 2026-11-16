import test from 'node:test';
import assert from 'node:assert/strict';
import { isLight, parseSDA, sdaQuery, soilAt } from '../js/soil.js';

test('light soil is sand, loamy sand or sandy loam', () => {
  for (const t of ['Sand', 'Loamy sand', 'Sandy loam', 'Loamy fine sand', 'Fine sandy loam']) assert.equal(isLight(t), true, t);
  for (const t of ['Loam', 'Clay loam', 'Sandy clay loam', 'Silty clay', 'Muck', '']) assert.equal(isLight(t), false, t);
});

test('parses the Soil Data Access answer', () => {
  const s = parseSDA({ Table: [['muname', 'compname', 'comppct_r', 'texdesc', 'om_r', 'sandtotal_r', 'claytotal_r'],
    ['Clarion loam, 2 to 6 percent slopes', 'Clarion', '85', 'Loam', '3.5', '45', '21']] });
  assert.equal(s.texture, 'Loam'); assert.equal(s.om, 3.5); assert.equal(s.sand, 45); assert.equal(s.clay, 21); assert.equal(s.light, false);
  assert.equal(parseSDA({}), null); assert.equal(parseSDA({ Table: [['muname']] }), null);
});

test('query puts lon before lat in the WKT point', () => {
  assert.match(sdaQuery(42.03, -93.62), /point\(-93\.62000 42\.03000\)/);
});

test('soilAt never throws', async () => {
  assert.equal(await soilAt(45, -73, async () => { throw new TypeError('Failed to fetch'); }), null);
  assert.equal(await soilAt(45, -73, async () => ({ ok: true, json: async () => ({}) })), null);
});
