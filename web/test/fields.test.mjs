import { test } from 'node:test';
import assert from 'node:assert/strict';
import { km, nearest, startField } from '../js/fields.js';

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

test('startField opens a farm field, not the park, unless asked', () => {
  assert.equal(startField(F, ''), 'laval');                                        // first visit
  assert.equal(startField(F, '?field=demo'), null);                                // park asked for
  assert.equal(startField(F, '?field=mirabel', { last: 'laval' }), 'mirabel');     // URL wins
  assert.equal(startField(F, '', { last: 'mirabel' }), 'mirabel');                 // last pick
  assert.equal(startField(F, '', { last: 'demo' }), null);
  assert.equal(startField(F, '', { last: 'gone', site: { lat: 45.70, lon: -73.97 } }), 'mirabel');  // nearest fetch
  assert.equal(startField(F, '', { site: { lat: 46.81, lon: -71.21 } }), 'laval');  // far away: first field
  assert.equal(startField(F, '?field=../x'), 'laval');                           // unknown id ignored
  assert.equal(startField([], ''), null);
});
