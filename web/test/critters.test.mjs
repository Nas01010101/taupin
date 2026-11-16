import { test } from 'node:test';
import assert from 'node:assert/strict';
import { critterPose, crittersFor } from '../js/critters.js';

test('only pest classes get animals', () => {
  assert.equal(crittersFor('wireworm').shape, 'worm');
  assert.equal(crittersFor('click_beetle').shape, 'beetle');
  for (const id of ['earthworm', 'ground_beetle', 'millipede', 'other', undefined]) assert.equal(crittersFor(id), null);
});

test('animals stay near the pin and move over time', () => {
  for (let i = 0; i < 5; i++) for (let t = 0; t < 30; t += 0.7) {
    const p = critterPose(i, 5, t, { r: 22 });
    assert.ok(Math.hypot(p.dx, p.dz) <= 22 * 1.18 + 1e-9);
    assert.ok(Number.isFinite(p.heading));
  }
  const a = critterPose(0, 4, 0), b = critterPose(0, 4, 1);
  assert.ok(Math.hypot(a.dx - b.dx, a.dz - b.dz) > 1);
});

test('a trailing segment sits behind the head on the same path', () => {
  const head = critterPose(1, 3, 5), tail = critterPose(1, 3, 5, { lag: 0.3 }), past = critterPose(1, 3, 4.7);
  assert.ok(Math.abs(tail.dx - past.dx) < 1e-9 && Math.abs(tail.dz - past.dz) < 1e-9);
  assert.ok(Math.hypot(head.dx - tail.dx, head.dz - tail.dz) > 0.5);
});
