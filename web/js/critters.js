// Small animals that crawl around the pin of a photo the model answered as a soil pest, so the
// 3D field shows what was found and where. Pure motion math here; scene.js builds the meshes.

// Class id from the photo model -> look. Only the classes the risk engine treats as pests (and
// white grub, shown to the agronomist) get animals; beneficial and unclear answers get none.
export const CRITTER_KINDS = {
  wireworm: { shape: 'worm', color: 0xd98a2b },
  click_beetle: { shape: 'beetle', color: 0x4a3020 },
  corn_rootworm: { shape: 'worm', color: 0xf0e6cc },
  white_grub: { shape: 'grub', color: 0xf3ecdc },
};

export const crittersFor = id => CRITTER_KINDS[id] ?? null;

// Animal i of n around a pin at time t (s): an offset in world units from the pin foot and a
// heading (radians, 0 = +x). Each one circles at its own radius and speed with a slow wobble,
// so a group never moves in lockstep. lag shifts along the same path for trailing segments.
export function critterPose(i, n, t, { r = 22, lag = 0 } = {}) {
  const seed = Math.sin((i + 1) * 12.9898) * 43758.5453 % 1;
  const dir = i % 2 ? -1 : 1;
  const rad = r * (0.55 + 0.45 * Math.abs(seed));
  const w = dir * (0.35 + 0.25 * Math.abs(seed)) * 22 / rad;          // about the same ground speed at every radius
  const a = (i / n) * 2 * Math.PI + w * (t - lag);
  const wob = 0.18 * rad * Math.sin(1.7 * (t - lag) + i * 2.1);
  const R = rad + wob;
  const dx = R * Math.cos(a), dz = R * Math.sin(a);
  return { dx, dz, heading: a + dir * Math.PI / 2 };
}
