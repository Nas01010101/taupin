// Build a 3D field and its trap plan in the browser from one click: the 600 m square around the
// point, from open data read directly by the page (no server, no install):
//   terrain and trees  NRCan HRDEM lidar mosaic, 1 m, read at 4 m from its cloud-optimized GeoTIFFs
//                      (cog.js); where it has no coverage, AWS Terrain Tiles (no trees then)
//   crops              AAFC Annual Crop Inventory, 30 m, 2011 to 2025 (Canada)
// Then the same steps as the Python bake (src/taupin/layers.py): hillshade, slope, wetness index,
// treetops, the farmed patch the farmer clicked, scouting zones and ten RAP trap points, and the
// field's crop history. The result has the shape of a baked field.json; each layer carries its
// bytes in `buffer`, so scene.js draws it without any file. Network access goes through fetchFn
// and image decoding through decodePNG, so node --test can run it on canned data.
import { fieldGrid, toLambert, tileXY, terrarium } from './geo.js';
import { openCOG } from './cog.js';
import { hillshade, slopeDeg, wetnessIndex, treetops, boxMean, TREE_MIN_M } from './terrain.js';
import { scoutingZones, placeTraps, minSpacingM, RAP_MIN_TRAPS, RAP_SPACING_M } from './zones.js';
import { ACI_YEARS, aciURL, aciName, groupOf, isFarm, majority, summary, engineHistory } from './aci.js';

export const SIDE_M = 600, RES_M = 4, CROP_N = 20;   // 150 x 150 cells of 4 m; crop map 20 x 20 of 30 m
const STAC = 'https://datacube.services.geo.ca/stac/api/search';
const TERRAIN_TILE = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const EDGE_M = 15, POCKET_PCT = 15, MIN_FIELD_HA = 1;
export const SRC = {
  hrdem: 'NRCan HRDEM lidar mosaic (DTM and DSM), 1 m, read at 4 m in the browser (Open Government Licence - Canada)',
  tiles: 'AWS Terrain Tiles (Mapzen/Tilezen: USGS 3DEP, NRCan CDEM, SRTM and others), about 3 m per pixel here; no tree heights',
  aci: 'AAFC Annual Crop Inventory, 30 m (Open Government Licence - Canada)',
  rap: 'RAP Grandes cultures, Méthode standard de dépistage des vers fil-de-fer (Agri-Réseau doc. 115269, 16 April 2025)',
};

// In the browser: PNG bytes -> {width, height, data: RGBA}, with no colour management, so the
// raw class codes and terrain encodings come through unchanged.
export async function decodePNGBrowser(buf) {
  const bmp = await createImageBitmap(new Blob([buf], { type: 'image/png' }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  return { width: bmp.width, height: bmp.height, data: g.getImageData(0, 0, bmp.width, bmp.height).data };
}

// Quantise like src/taupin/layers.py encode(): over the data range, the top code is no data.
export function encode(a, dtype = 'u1', classes = false) {
  const top = dtype === 'u1' ? 255 : 65535;
  let lo = Infinity, hi = -Infinity;
  for (const v of a) if (Number.isFinite(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (lo === Infinity) { lo = 0; hi = 0; }
  let scale = (hi - lo) / (top - 1) || 1;
  if (classes) { lo = 0; scale = 1; }
  const q = dtype === 'u1' ? new Uint8Array(a.length) : new Uint16Array(a.length);
  for (let i = 0; i < a.length; i++) q[i] = Number.isFinite(a[i]) ? Math.min(top - 1, Math.max(0, Math.round((a[i] - lo) / scale))) : top;
  return { buffer: q.buffer, encoding: { dtype, offset: Math.round(lo * 1e6) / 1e6, scale: Number(scale.toPrecision(8)), nodata: top }, range: [Math.round(lo * 100) / 100, Math.round(hi * 100) / 100] };
}

// Bilinear sample of grid g (w x h, NaN = no data) at fractional pixel (x, y) of pixel centres;
// a missing neighbour falls back to the nearest valid one.
function bilinear(g, w, h, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const at = (c, r) => (c >= 0 && c < w && r >= 0 && r < h ? g[r * w + c] : NaN);
  const v = [at(x0, y0), at(x0 + 1, y0), at(x0, y0 + 1), at(x0 + 1, y0 + 1)];
  if (v.every(Number.isFinite)) return v[0] * (1 - fx) * (1 - fy) + v[1] * fx * (1 - fy) + v[2] * (1 - fx) * fy + v[3] * fx * fy;
  const near = at(Math.round(x), Math.round(y));
  return Number.isFinite(near) ? near : v.find(Number.isFinite) ?? NaN;
}

// Holes (no data) filled from the nearest valid cells, ring by ring.
export function fillHoles(a, n) {
  const out = Float64Array.from(a);
  for (let pass = 0; pass < n && out.some(v => !Number.isFinite(v)); pass++) {
    const prev = Float64Array.from(out);
    for (let i = 0; i < n * n; i++) {
      if (Number.isFinite(prev[i])) continue;
      const r = Math.floor(i / n), c = i % n;
      let s = 0, k = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc, v = rr >= 0 && rr < n && cc >= 0 && cc < n ? prev[rr * n + cc] : NaN;
        if (Number.isFinite(v)) { s += v; k++; }
      }
      if (k) out[i] = s / k;
    }
  }
  return out;
}

// HRDEM lidar: DTM and DSM on the field grid, or null where the mosaic has no coverage.
async function lidar(grid, fetchFn, step) {
  step('Looking for lidar (NRCan HRDEM)…');
  const [w, s, e, nn] = grid.bbox;
  const r = await fetchFn(`${STAC}?collections=hrdem-mosaic-1m&bbox=${w},${s},${e},${nn}&limit=4`);
  if (!r.ok) return null;
  const items = (await r.json()).features ?? [];
  const n = grid.size, xy = [];
  for (let i = 0; i < n * n; i++) { const p = grid.latLonOf(Math.floor(i / n), i % n); xy.push(toLambert(p.lat, p.lon)); }
  const xs = xy.map(p => p[0]), ys = xy.map(p => p[1]), stats = { bytes: 0, tiles: 0 };
  for (const item of items) {
    if (!item.assets?.dtm || !item.assets?.dsm) continue;
    const read = async key => {
      const c = await openCOG(item.assets[key].href, { fetchFn });
      let li = 0;   // the level nearest 4 m, not coarser
      c.levels.forEach((l, i) => { if (l.res[0] <= RES_M + 1e-6 && l.res[0] > c.levels[li].res[0]) li = i; });
      const res = c.levels[li].res[0], [ox, oy] = c.origin;
      const c0 = Math.floor((Math.min(...xs) - ox) / res) - 2, c1 = Math.ceil((Math.max(...xs) - ox) / res) + 2;
      const r0 = Math.floor((oy - Math.max(...ys)) / res) - 2, r1 = Math.ceil((oy - Math.min(...ys)) / res) + 2;
      const win = await c.readWindow(li, c0, r0, c1, r1, stats), ww = c1 - c0, hh = r1 - r0;
      return Float64Array.from(xy, ([x, y]) => bilinear(win, ww, hh, (x - ox) / res - 0.5 - c0, (oy - y) / res - 0.5 - r0));
    };
    step('Reading lidar terrain and tree heights…');
    const [dtm, dsm] = await Promise.all([read('dtm'), read('dsm')]);
    const missing = dtm.reduce((k, v) => k + !Number.isFinite(v), 0) / dtm.length;
    if (missing < 0.2) return { dtm, dsm, source: `${SRC.hrdem}; tile ${item.id}`, bytes: stats.bytes, missing };
  }
  return null;
}

// Terrain tiles (global): heights only.
async function terrainTiles(grid, fetchFn, decodePNG, step, z = 15) {
  step('No lidar here: reading terrain tiles…');
  const n = grid.size, pts = Array.from({ length: n * n }, (_, i) => grid.latLonOf(Math.floor(i / n), i % n));
  const t = pts.map(p => tileXY(p.lat, p.lon, z)), need = new Map();
  for (const { x, y } of t) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const tx = Math.floor(x + dx / 256), ty = Math.floor(y + dy / 256);
    need.set(`${tx}/${ty}`, [tx, ty]);
  }
  const tiles = new Map();
  let bytes = 0;
  await Promise.all([...need.values()].map(async ([tx, ty]) => {
    const r = await fetchFn(TERRAIN_TILE.replace('{z}', z).replace('{x}', tx).replace('{y}', ty));
    if (!r.ok) return;
    const buf = await r.arrayBuffer(); bytes += buf.byteLength;
    const img = await decodePNG(buf), h = new Float64Array(256 * 256);
    for (let i = 0; i < h.length; i++) h[i] = terrarium(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]);
    tiles.set(`${tx}/${ty}`, h);
  }));
  const at = (px, py) => { const tx = Math.floor(px / 256), ty = Math.floor(py / 256), h = tiles.get(`${tx}/${ty}`); return h ? h[(py - ty * 256) * 256 + (px - tx * 256)] : NaN; };
  const dtm = Float64Array.from(t, ({ x, y }) => {
    const px = x * 256 - 0.5, py = y * 256 - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    return at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) + at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy;
  });
  return { dtm, dsm: null, source: SRC.tiles, bytes, missing: 0 };
}

// Crop maps, one per year, 20 x 20 cells of 30 m over the square. {year: Uint8Array} (Canada only).
async function cropMaps(grid, fetchFn, decodePNG, step) {
  step('Reading the crop maps, 2011 to 2025 (AAFC)…');
  const maps = {};
  let bytes = 0;
  // A year the service does not answer within 20 s is skipped, so a slow AAFC never stalls the build.
  await Promise.all(ACI_YEARS.map(async y => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetchFn(aciURL(y, grid.bbox, CROP_N), { signal: ctl.signal });
      if (!r.ok || !String(r.headers?.get?.('content-type') ?? 'image/png').includes('png')) return;
      const buf = await r.arrayBuffer(); bytes += buf.byteLength;
      const img = await decodePNG(buf);
      if (img.width !== CROP_N || img.height !== CROP_N) return;
      // Class codes stop at 230; the service answers 253 (no data) outside Canada.
      const codes = Uint8Array.from({ length: CROP_N * CROP_N }, (_, i) => (img.data[i * 4] < 250 ? img.data[i * 4] : 0));
      if (codes.some(c => c > 0)) maps[y] = codes;
    } catch { /* that year is skipped */ } finally { clearTimeout(timer); }
  }));
  return { maps, bytes };
}

// 8-connected patch of `ok` cells containing (or nearest to) the centre cell.
function patchAt(ok, n, r0, c0) {
  let start = -1, bd = Infinity;
  for (let i = 0; i < n * n; i++) if (ok[i]) { const d = (Math.floor(i / n) - r0) ** 2 + (i % n - c0) ** 2; if (d < bd) { bd = d; start = i; } }
  const out = new Uint8Array(n * n);
  if (start < 0) return out;
  const stack = [start]; out[start] = 1;
  while (stack.length) {
    const i = stack.pop(), r = Math.floor(i / n), c = i % n;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc, j = rr * n + cc;
      if (rr >= 0 && rr < n && cc >= 0 && cc < n && ok[j] && !out[j]) { out[j] = 1; stack.push(j); }
    }
  }
  return out;
}

const pick = (a, n) => { const s = []; for (let i = 0; i < a.length; i++) if (a[i]) s.push(i); return s; };

export async function buildField(site, { fetchFn = fetch, decodePNG = decodePNGBrowser, onStep = () => {}, rotations, startYear = 2026, name } = {}) {
  const grid = fieldGrid(site.lat, site.lon, { side: SIDE_M, res: RES_M }), n = grid.size, res = RES_M;
  let terrain = null;
  try { terrain = await lidar(grid, fetchFn, onStep); } catch (e) { onStep(`Lidar not readable (${e.message}); using terrain tiles.`); }
  terrain ??= await terrainTiles(grid, fetchFn, decodePNG, onStep);
  const dtm = fillHoles(terrain.dtm, n);
  if (!dtm.every(Number.isFinite)) throw new Error('no terrain heights for this place');
  const dsm = terrain.dsm && fillHoles(terrain.dsm, n);
  const canopy = dsm ? Float64Array.from(dtm, (z, i) => Math.max(0, dsm[i] - z)) : null;
  onStep('Computing slope, wetness and trees…');
  const hill = hillshade(dtm, n, res), slope = slopeDeg(dtm, n, res), twi = wetnessIndex(dtm, n, res);

  const { maps, bytes: cropBytes } = await cropMaps(grid, fetchFn, decodePNG, onStep);
  const years = Object.keys(maps).map(Number).sort((a, b) => a - b), last = years[years.length - 1];
  const k30 = SIDE_M / CROP_N / res;   // 4 m cells per 30 m cell side (7.5)
  const crop30 = (codes, i) => codes[Math.min(CROP_N - 1, Math.floor(Math.floor(i / n) / k30)) * CROP_N + Math.min(CROP_N - 1, Math.floor((i % n) / k30))];

  // Where traps can go: farmed ground last year (or open ground without crop maps), under 2 m of
  // canopy, 15 m in from the square's edge; then the patch the farmer clicked.
  onStep('Finding the open ground in your field…');
  const edge = Math.ceil(EDGE_M / res), inside = i => { const r = Math.floor(i / n), c = i % n; return r >= edge && c >= edge && r < n - edge && c < n - edge; };
  const lowCanopy = i => !canopy || canopy[i] < TREE_MIN_M;
  const centre = Math.floor(n / 2), ci = centre * n + centre;
  const ok = Uint8Array.from({ length: n * n }, (_, i) => inside(i) && lowCanopy(i) && (last ? isFarm(crop30(maps[last], i)) : slope[i] < 12));
  let mask = last ? patchAt(Uint8Array.from(ok, (v, i) => v && crop30(maps[last], i) === crop30(maps[last], ci)), n, centre, centre) : new Uint8Array(n * n);
  let maskRule = 'the patch of last year\'s crop that you clicked';
  if (pick(mask).length * res * res / 1e4 < MIN_FIELD_HA) { mask = patchAt(ok, n, centre, centre); maskRule = last ? 'the farmed ground around the point you clicked' : 'the open ground around the point you clicked'; }
  if (pick(mask).length * res * res / 1e4 < MIN_FIELD_HA) { mask = ok; maskRule = last ? 'all farmed ground in the square' : 'all open ground in the square'; }
  const areaHa = pick(mask).length * res * res / 1e4;
  const twiS = boxMean(twi, n, 7), k = Math.max(1, Math.min(4, Math.floor(areaHa / 2)));
  const zones = scoutingZones([twiS, dtm, slope], mask, k);
  const traps = placeTraps(zones, n, res).map(t => ({ ...t, ...(({ lat, lon }) => ({ lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6 }))(grid.latLonOf(t.row, t.col)) }));
  if (!traps.length) throw new Error('no open ground in this square');

  // Crop history: each year's most common class over the clicked field's 30 m cells.
  const m30 = new Uint8Array(CROP_N * CROP_N), cnt30 = new Uint16Array(CROP_N * CROP_N);
  for (let i = 0; i < n * n; i++) { const j = Math.min(CROP_N - 1, Math.floor(Math.floor(i / n) / k30)) * CROP_N + Math.min(CROP_N - 1, Math.floor((i % n) / k30)); cnt30[j]++; if (mask[i]) m30[j]++; }
  const in30 = Uint8Array.from(m30, (v, j) => v * 2 >= cnt30[j]);
  const perYear = {};
  for (const y of years) { const m = majority(maps[y], in30); if (m) perYear[y] = m; }
  const crops = Object.keys(perYear).length && rotations ? {
    per_year: perYear, ...summary(perYear, rotations),
    source: `${SRC.aci}, ${years[0]} to ${last}; crop = most common class over your field's 30 m cells`,
  } : null;

  // Layers in the baked format.
  const lay = (key, arr, dtype, meta, classes = false, size = n) => { const e = encode(arr, dtype, classes); return { key, file: `layers/${key}.bin`, size, ...e, ...meta }; };
  const tsrc = terrain.source, layers = [
    lay('height', dtm, 'u2', { name: 'Terrain height', unit: 'm above sea level', native_res_m: terrain.dsm ? 1 : 3, grid_res_m: res, source: tsrc }),
    ...(canopy ? [lay('canopy', canopy, 'u1', { name: 'Canopy height', unit: 'm', native_res_m: 1, grid_res_m: res, source: tsrc, note: 'lidar DSM minus DTM' })] : []),
    lay('hillshade', hill, 'u1', { name: 'Hillshade', unit: '0 to 1', grid_res_m: res, source: tsrc, note: 'sun from the north-west at 45 degrees' }),
    lay('slope', slope, 'u1', { name: 'Slope', unit: 'degrees', grid_res_m: res, source: tsrc }),
    lay('twi', twi, 'u1', { name: 'Wetness index', unit: 'ln(m)', grid_res_m: res, source: tsrc, note: 'ln(a / tan b), Beven and Kirkby 1979; multiple flow directions (Freeman 1991) on the 3 x 3 smoothed DTM; flow from outside the square is not counted' }),
  ];
  const zoneInfo = [...new Set(zones)].filter(Boolean).sort((a, b) => a - b).map(z => {
    const cells = pick(zones.map(v => v === z));
    return { id: z, area_ha: Math.round(cells.length * res * res / 1e3) / 10, twi: Math.round(10 * cells.reduce((s, i) => s + twiS[i], 0) / cells.length) / 10, traps: traps.filter(t => t.zone === z).map(t => t.id) };
  });
  layers.push(lay('zones', Float64Array.from(zones, v => (v ? v : NaN)), 'u1', { name: 'Scouting zones', unit: 'zone', kind: 'classes', grid_res_m: res, classes: zoneInfo,
    source: 'k-means classes of wetness index (30 m mean), terrain height and slope over your field', note: 'classes for spreading traps; not a risk prediction' }, true));
  if (last) {
    const codes = maps[last], present = [...new Set(codes)].filter(c => c > 0).sort((a, b) => a - b);
    layers.push(lay('crop', Float64Array.from(codes, c => (c > 0 ? c : NaN)), 'u1', { name: `Crop ${last}`, unit: 'ACI class', kind: 'classes', native_res_m: 30, grid_res_m: 30,
      classes: present.map(c => ({ id: c, name: aciName(c), group: groupOf(c) })), source: SRC.aci, dates: [String(last), String(last)] }, true, CROP_N));
  }
  const sortedH = Array.from(dtm).sort((a, b) => a - b);
  const field = {
    site: { name: name ?? `Field at ${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}`, lat: site.lat, lon: site.lon, built: true },
    parcel: { size: n, res_m: res, area_ha: (SIDE_M * SIDE_M) / 1e4, nw: grid.nw, se: grid.se, crs: 'local east-north metres around the point' },
    layers,
    pocket: { height_max_m: Math.round(sortedH[Math.floor(sortedH.length * POCKET_PCT / 100)] * 1000) / 1000, rule: `lowest ${POCKET_PCT} % of the square's cells by terrain height` },
    trees: canopy ? treetops(canopy, n, { window: 3, max: 1500 }) : [],
    open: { area_ha: Math.round(areaHa * 10) / 10, rule: `${maskRule}: under ${TREE_MIN_M} m of canopy where lidar gives it, ${EDGE_M} m from the edge of the square (Taupin choices)` },
    ...(crops ? { crops } : {}),
    traps,
    trap_rules: { min_traps: RAP_MIN_TRAPS, spacing_m: RAP_SPACING_M, min_spacing_here_m: Math.round(minSpacingM(traps, res)), source: SRC.rap },
    sources: { terrain: tsrc, trees: canopy ? `canopy height = lidar DSM minus DTM; a crown at each 12 m local maximum above ${TREE_MIN_M + 1} m` : 'no tree heights without lidar',
      ...(last ? { crops: `${SRC.aci}, ${years[0]} to ${last}` } : {}), traps: SRC.rap },
  };
  return { field, history: crops ? engineHistory(perYear, startYear) : null,
    download: { terrain_bytes: terrain.bytes, crop_bytes: cropBytes, lidar: !!terrain.dsm, missing: terrain.missing } };
}

// Layers as base64 so a built field survives on this device (localStorage) and opens offline.
export function packField(field) {
  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
  return { ...field, layers: field.layers.map(({ buffer, ...l }) => ({ ...l, b64: b64(buffer) })) };
}
export function unpackField(packed) {
  const buf = s => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
  return { ...packed, layers: packed.layers.map(({ b64, ...l }) => ({ ...l, buffer: buf(b64) })) };
}
