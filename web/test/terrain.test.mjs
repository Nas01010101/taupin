import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { slopeDeg, hillshade, wetnessIndex, treetops } from '../js/terrain.js';

// Reference values computed by src/taupin/terrain.py on the same synthetic DTM (pit, ridge, flat).
const R = JSON.parse(readFileSync(new URL('./fixtures/terrain_ref.json', import.meta.url), 'utf8'));
const z = Float64Array.from(R.z), close = (a, b, tol, what) => {
  let worst = 0;
  for (let i = 0; i < b.length; i++) worst = Math.max(worst, Math.abs(a[i] - b[i]));
  assert.ok(worst < tol, `${what}: worst difference ${worst}`);
};

test('slope and hillshade match terrain.py', () => {
  close(slopeDeg(z, R.n, R.res), R.slope, 1e-4, 'slope');
  close(hillshade(z, R.n, R.res), R.hill, 1e-6, 'hillshade');
});

test('wetness index (fill, multiple flow directions) matches terrain.py', () => {
  close(wetnessIndex(z, R.n, R.res), R.twi, 1e-5, 'twi');
});

test('treetops: one crown per window, at least 3 m', () => {
  assert.deepEqual(treetops(Float64Array.from(R.chm), R.n, { window: 3 }), R.tops);
});
