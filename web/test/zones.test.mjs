import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, depth, placeTraps, scoutingZones, minSpacingM, kmeans } from '../js/zones.js';

test('allocate and depth give what zones.py gives', () => {
  // Values printed by src/taupin/zones.py for the same inputs.
  assert.deepEqual(allocate({ 1: 500, 2: 300, 3: 150, 4: 50 }, 10), { 1: 4, 2: 3, 3: 2, 4: 1 });
  assert.deepEqual(allocate({ 1: 10, 2: 10, 3: 10 }, 10), { 1: 4, 2: 3, 3: 3 });
  assert.deepEqual(allocate({ 5: 1 }, 10), { 5: 10 });
  const m = new Uint8Array(49); for (let r = 1; r < 6; r++) for (let c = 1; c < 6; c++) m[r * 7 + c] = 1;
  assert.deepEqual(Array.from(depth(m, 7).slice(21, 28)), [0, 1, 2, 3, 2, 1, 0]);
});

test('k-means is deterministic and separates two clear groups', () => {
  const x = [[0, 0], [0.1, 0], [0, 0.2], [5, 5], [5.1, 5], [5, 5.2]];
  const a = kmeans(x, 2), b = kmeans(x, 2);
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.ok(a[0] === a[1] && a[1] === a[2] && a[3] === a[4] && a[4] === a[5] && a[0] !== a[3]);
});

test('ten traps on a field: inside it, 25 m apart, at least one per zone, lettered A to J', () => {
  const n = 150, res = 4, mask = new Uint8Array(n * n), f1 = new Float64Array(n * n), f2 = new Float64Array(n * n);
  for (let r = 20; r < 130; r++) for (let c = 30; c < 120; c++) mask[r * n + c] = 1;   // 440 m x 360 m field
  for (let i = 0; i < n * n; i++) { f1[i] = Math.floor(i / n) / n; f2[i] = (i % n) / n; }
  const z = scoutingZones([f1, f2], mask, 4), t = placeTraps(z, n, res);
  assert.equal(t.length, 10);
  assert.deepEqual(t.map(x => x.id).join(''), 'ABCDEFGHIJ');
  assert.ok(t.every(x => mask[x.row * n + x.col]));
  assert.ok(minSpacingM(t, res) >= 25);
  assert.deepEqual([...new Set(t.map(x => x.zone))].sort(), [1, 2, 3, 4]);
  assert.ok(z.every((v, i) => (v > 0) === (mask[i] === 1)));
});
