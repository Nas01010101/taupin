// Scouting zones and bait-trap points for a field built in the browser, ported from
// src/taupin/zones.py. Zones are k-means classes of the field's own layers: they spread the traps
// over the field's variability and are not a risk prediction. Trap rules from the RAP bait-trap
// protocol (Agri-Reseau doc. 115269): at least 10 traps, spread evenly, about 25 m apart,
// lettered A to J. No imports, so node --test can load it.

export const RAP_MIN_TRAPS = 10, RAP_SPACING_M = 25;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// Small seeded generator (mulberry32): the same field gives the same zones every time.
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Labels 0..k-1 for rows of x (array of equal-length number arrays); k-means++ start, fixed seed.
export function kmeans(x, k, { iters = 60, seed = 0 } = {}) {
  const rand = rng(seed), d2 = (a, b) => a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0);
  const cent = [x[Math.floor(rand() * x.length)].slice()];
  while (cent.length < k) {
    const d = x.map(p => Math.min(...cent.map(c => d2(p, c)))), tot = d.reduce((a, b) => a + b, 0);
    let t = rand() * tot, i = 0;
    while (i < x.length - 1 && t > d[i]) { t -= d[i]; i++; }
    cent.push(x[tot ? i : Math.floor(rand() * x.length)].slice());
  }
  let lab = new Int32Array(x.length).fill(-1);
  for (let it = 0; it < iters; it++) {
    const next = Int32Array.from(x, p => { let b = 0, bd = Infinity; cent.forEach((c, j) => { const v = d2(p, c); if (v < bd) { bd = v; b = j; } }); return b; });
    if (next.every((v, i) => v === lab[i])) break;
    lab = next;
    for (let j = 0; j < k; j++) {
      const m = x.filter((_, i) => lab[i] === j);
      if (m.length) cent[j] = m[0].map((_, q) => m.reduce((s, p) => s + p[q], 0) / m.length);
    }
  }
  return lab;
}

// Zone id per cell (1..k, 0 outside mask). Features are standardised over the masked cells;
// zones are numbered by rising mean of the first feature (the wetness index).
export function scoutingZones(features, mask, k) {
  const cells = [];
  for (let i = 0; i < mask.length; i++) if (mask[i]) cells.push(i);
  const out = new Uint8Array(mask.length);
  if (!cells.length) return out;
  k = Math.max(1, Math.min(k, cells.length));
  const cols = features.map(f => {
    const v = cells.map(i => f[i]), m = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) || 1;
    return v.map(x => (x - m) / sd);
  });
  const x = cells.map((_, r) => cols.map(c => c[r])), lab = kmeans(x, k);
  const mean = Array.from({ length: k }, (_, j) => {
    const v = cells.filter((_, r) => lab[r] === j).map(i => features[0][i]);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : Infinity;
  });
  const order = mean.map((m, j) => [m, j]).sort((a, b) => a[0] - b[0]), rank = new Array(k);
  order.forEach(([, j], r) => { rank[j] = r + 1; });
  cells.forEach((i, r) => { out[i] = rank[lab[r]]; });
  return out;
}

// n traps over zones in proportion to area (largest remainder), at least one per zone.
export function allocate(areas, n) {
  const zs = Object.keys(areas).map(Number).sort((a, b) => a - b);
  if (n < zs.length) throw new Error(`${n} traps cannot cover ${zs.length} zones`);
  const out = Object.fromEntries(zs.map(z => [z, 1])), left = n - zs.length, total = zs.reduce((s, z) => s + areas[z], 0);
  const quota = Object.fromEntries(zs.map(z => [z, left * areas[z] / total]));
  for (const z of zs) out[z] += Math.floor(quota[z]);
  const rem = n - zs.reduce((s, z) => s + out[z], 0);
  zs.slice().sort((a, b) => (quota[b] - Math.floor(quota[b])) - (quota[a] - Math.floor(quota[a])) || a - b).slice(0, rem).forEach(z => { out[z] += 1; });
  return out;
}

// Cells from the mask edge (3 x 3 erosions survived, up to cap): high in the heart of a patch.
export function depth(mask, n, cap = 15) {
  const out = new Int32Array(n * n);
  let cur = Uint8Array.from(mask);
  for (let it = 0; it < cap; it++) {
    let any = false;
    const next = new Uint8Array(n * n);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = r * n + c;
      if (!cur[i]) continue;
      out[i]++;
      let all = r > 0 && r < n - 1 && c > 0 && c < n - 1;
      for (let dr = -1; dr <= 1 && all; dr++) for (let dc = -1; dc <= 1; dc++) if (!cur[(r + dr) * n + c + dc]) { all = false; break; }
      if (all) { next[i] = 1; any = true; }
    }
    cur = next;
    if (!any) break;
  }
  return out;
}

// Trap cells: per zone, the deepest cells of its patches, each at least spacingM from the traps
// already placed; a zone with no room hands its trap to the largest zone with room. Lettered
// along a nearest-neighbour walk from the trap nearest the north-west corner.
export function placeTraps(zones, n, res, { count = RAP_MIN_TRAPS, spacingM = RAP_SPACING_M } = {}) {
  const ids = [...new Set(zones)].filter(Boolean).sort((a, b) => a - b);
  if (!ids.length) return [];
  const areas = Object.fromEntries(ids.map(z => [z, zones.reduce((s, v) => s + (v === z), 0)]));
  const alloc = allocate(areas, Math.max(count, ids.length));
  const deep = Object.fromEntries(ids.map(z => [z, depth(zones.map(v => (v === z ? 1 : 0)), n)]));
  const chosen = [];
  const best = z => {
    let bi = -1, bs = -1;
    const d = deep[z];
    for (let i = 0; i < n * n; i++) {
      if (!(d[i] > 0) || d[i] <= bs) continue;
      const r = Math.floor(i / n), c = i % n;
      if (chosen.some(t => Math.hypot(t.r - r, t.c - c) * res < spacingM)) continue;
      bi = i; bs = d[i];
    }
    return bi < 0 ? null : { r: Math.floor(bi / n), c: bi % n };
  };
  const bySize = ids.slice().sort((a, b) => alloc[b] - alloc[a] || a - b);
  for (const z of bySize) for (let k = 0; k < alloc[z]; k++) {
    for (const zz of [z, ...bySize]) {
      const rc = best(zz);
      if (rc) { chosen.push({ ...rc, z: zz }); break; }
    }
  }
  const left = chosen.slice().sort((a, b) => a.r + a.c - (b.r + b.c)), walk = left.length ? [left.shift()] : [];
  while (left.length) {
    const { r, c } = walk[walk.length - 1];
    left.sort((a, b) => (a.r - r) ** 2 + (a.c - c) ** 2 - ((b.r - r) ** 2 + (b.c - c) ** 2));
    walk.push(left.shift());
  }
  return walk.map((t, i) => ({ id: LETTERS[i], row: t.r, col: t.c, zone: t.z }));
}

export function minSpacingM(traps, res) {
  let m = Infinity;
  for (let i = 0; i < traps.length; i++) for (let j = i + 1; j < traps.length; j++)
    m = Math.min(m, Math.hypot(traps[i].row - traps[j].row, traps[i].col - traps[j].col) * res);
  return m;
}
