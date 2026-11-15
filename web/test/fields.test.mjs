import { test } from 'node:test';
import assert from 'node:assert/strict';
import { km, nearest, fieldParam } from '../js/fields.js';

const F = [{ id: 'laval', lat: 45.6917, lon: -73.5504 }, { id: 'mirabel', lat: 45.706, lon: -73.9829 }];

test('km matches a known distance', () => {
  // Montreal to Quebec City is about 233 km great-circle.
  assert.ok(Math.abs(km({ lat: 45.5017, lon: -73.5673 }, { lat: 46.8139, lon: -71.2080 }) - 233) < 3);
});

test('nearest picks the closest field inside the radius', () => {
  assert.equal(nearest(F, { lat: 45.70, lon: -73.56 }).field.id, 'laval');
  assert.equal(nearest(F, { lat: 45.70, lon: -73.97 }).field.id, 'mirabel');
});

test('nearest returns null outside the radius', () => {
  assert.equal(nearest(F, { lat: 46.81, lon: -71.21 }), null);
});

test('fieldParam accepts only baked ids', () => {
  assert.equal(fieldParam(F, '?field=laval&lang=fr'), 'laval');
  assert.equal(fieldParam(F, '?field=../x'), null);
  assert.equal(fieldParam(F, ''), null);
});
