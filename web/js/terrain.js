// Terrain layers for a field built in the browser, ported from src/taupin/terrain.py: gradients,
// slope, hillshade, the topographic wetness index (priority-flood fill, Freeman multiple flow
// directions) and treetops. Grids are Float64Array/Float32Array, row-major, north-up, n x n.
// No imports, so node --test can load it.

const NBRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const MFD_P = 1.1, TAN_MIN = 0.001;
export const TREE_MIN_M = 2.0;   // canopy above 2 m counts as tree or shrub (Taupin choice)

// numpy.gradient on rows and columns (central differences inside, one-sided at the edge), then
// dz/dx (east) and dz/dy (north): row 0 is the north edge.
export function gradients(z, n, res) {
  const gx = new Float64Array(n * n), gy = new Float64Array(n * n);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const i = r * n + c;
    const dc = c === 0 ? (z[i + 1] - z[i]) / res : c === n - 1 ? (z[i] - z[i - 1]) / res : (z[i + 1] - z[i - 1]) / (2 * res);
    const dr = r === 0 ? (z[i + n] - z[i]) / res : r === n - 1 ? (z[i] - z[i - n]) / res : (z[i + n] - z[i - n]) / (2 * res);
    gx[i] = dc; gy[i] = -dr;
  }
  return { gx, gy };
}

export function slopeDeg(z, n, res) {
  const { gx, gy } = gradients(z, n, res), out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = Math.atan(Math.hypot(gx[i], gy[i])) * 180 / Math.PI;
  return out;
}

// Cosine of the angle between the surface normal and a sun from the north-west at 45 degrees, 0..1.
export function hillshade(z, n, res, azimuth = 315, altitude = 45) {
  const { gx, gy } = gradients(z, n, res), az = azimuth * Math.PI / 180, zen = (90 - altitude) * Math.PI / 180;
  const lx = Math.sin(zen) * Math.sin(az), ly = Math.sin(zen) * Math.cos(az), lz = Math.cos(zen), out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = Math.min(1, Math.max(0, (-gx[i] * lx - gy[i] * ly + lz) / Math.sqrt(1 + gx[i] ** 2 + gy[i] ** 2)));
  return out;
}

// k x k moving mean with edge padding (k odd).
export function boxMean(a, n, k) {
  const p = k >> 1, out = new Float64Array(n * n), cl = v => (v < 0 ? 0 : v >= n ? n - 1 : v);
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    let s = 0;
    for (let dr = -p; dr <= p; dr++) for (let dc = -p; dc <= p; dc++) s += a[cl(r + dr) * n + cl(c + dc)];
    out[r * n + c] = s / (k * k);
  }
  return out;
}

// Binary min-heap of [value, index]; ties go to the lower index, as Python's heapq orders the
// (value, row, col) tuples of terrain.py, so the fill comes out identical.
function heap() {
  const v = [], idx = [];
  const lt = (a, b) => v[a] < v[b] || (v[a] === v[b] && idx[a] < idx[b]);
  const swap = (a, b) => { [v[a], v[b]] = [v[b], v[a]]; [idx[a], idx[b]] = [idx[b], idx[a]]; };
  const up = i => { while (i) { const p = (i - 1) >> 1; if (!lt(i, p)) break; swap(i, p); i = p; } };
  const down = i => { for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < v.length && lt(l, m)) m = l; if (r < v.length && lt(r, m)) m = r; if (m === i) return; swap(m, i); i = m; } };
  return {
    get size() { return v.length; },
    push(val, i) { v.push(val); idx.push(i); up(v.length - 1); },
    pop() { const top = [v[0], idx[0]], lv = v.pop(), li = idx.pop(); if (v.length) { v[0] = lv; idx[0] = li; down(0); } return top; },
  };
}

// Priority-flood fill from the grid edge (Barnes et al. 2014, +epsilon): every cell drains.
export function fillDepressions(z, n, eps = 1e-4) {
  const out = Float64Array.from(z), done = new Uint8Array(n * n), h = heap();
  for (let r = 0; r < n; r++) for (const c of [0, n - 1]) { const i = r * n + c; if (!done[i]) { h.push(out[i], i); done[i] = 1; } }
  for (let c = 1; c < n - 1; c++) for (const r of [0, n - 1]) { const i = r * n + c; if (!done[i]) { h.push(out[i], i); done[i] = 1; } }
  while (h.size) {
    const [zc, i] = h.pop(), r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of NBRS) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      const j = nr * n + nc;
      if (done[j]) continue;
      done[j] = 1;
      out[j] = Math.max(out[j], zc + eps);
      h.push(out[j], j);
    }
  }
  return out;
}

// Upslope contributing area (m^2) with Freeman multiple flow directions; nothing leaves the grid edge.
export function mfdAccumulation(z, n, res) {
  const acc = new Float64Array(n * n).fill(res * res), order = Array.from({ length: n * n }, (_, i) => i);
  order.sort((a, b) => z[b] - z[a] || a - b);
  const w = new Float64Array(8);
  for (const i of order) {
    const r = Math.floor(i / n), c = i % n;
    let tot = 0;
    for (let k = 0; k < 8; k++) {
      const [dr, dc] = NBRS[k], nr = r + dr, nc = c + dc;
      w[k] = 0;
      if (nr < 0 || nr >= n || nc < 0 || nc >= n) continue;
      const drop = (z[i] - z[nr * n + nc]) / (res * Math.hypot(dr, dc));
      if (drop > 0) { w[k] = drop ** MFD_P; tot += w[k]; }
    }
    if (!tot) continue;
    for (let k = 0; k < 8; k++) if (w[k]) acc[(r + NBRS[k][0]) * n + c + NBRS[k][1]] += acc[i] * w[k] / tot;
  }
  return acc;
}

// ln(a / tan b) (Beven and Kirkby 1979) on the 3 x 3 smoothed DTM.
export function wetnessIndex(dtm, n, res) {
  const z = boxMean(dtm, n, 3), acc = mfdAccumulation(fillDepressions(z, n), n, res), { gx, gy } = gradients(z, n, res);
  const out = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) out[i] = Math.log(acc[i] / res / Math.max(Math.hypot(gx[i], gy[i]), TAN_MIN));
  return out;
}

// [row, col, height m] of local canopy maxima at least minH tall: one crown per window.
export function treetops(chm, n, { minH = TREE_MIN_M + 1, window = 3, max = 2000 } = {}) {
  const p = window >> 1, out = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const h = chm[r * n + c];
    if (!(h >= minH)) continue;
    let peak = true;
    for (let dr = -p; dr <= p && peak; dr++) for (let dc = -p; dc <= p; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && chm[rr * n + cc] > h) { peak = false; break; }
    }
    if (peak) out.push([r, c, Math.round(h * 10) / 10]);
  }
  return out.length > max ? out.sort((a, b) => b[2] - a[2]).slice(0, max) : out;
}
