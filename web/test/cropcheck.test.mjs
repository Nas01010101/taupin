import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { treeShare, cropStatus } from '../js/cropcheck.js';
import { decode } from '../js/layers.js';

test('tree share skips no-data cells', () => {
  assert.equal(treeShare(new Float32Array([0, 5, NaN, 1])), 1 / 3);
  assert.equal(treeShare(new Float32Array([NaN])), null);
});

test('half or more under trees is not an active crop field', () => {
  assert.equal(cropStatus(0.49, 36, 1.3).active, true);
  assert.equal(cropStatus(0.5, 36, 1.3).active, false);
  assert.equal(cropStatus(null, 36), null);
});

test('the demo park square reads not active, 68 % trees', () => {
  const field = JSON.parse(readFileSync(new URL('../data/field.json', import.meta.url)));
  const l = field.layers.find(x => x.key === 'canopy');
  const buf = readFileSync(new URL('../data/' + l.file, import.meta.url));
  const s = cropStatus(treeShare(decode(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), l.encoding)), field.parcel.area_ha, field.open.area_ha);
  assert.equal(s.active, false);
  assert.equal(s.treePct, 68);
});

test('treeShare is null without lidar canopy', () => {
  assert.equal(treeShare(undefined), null);
});
