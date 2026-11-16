import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openCOG, lzwDecode } from '../js/cog.js';

// Fixture written by GDAL (COG driver): 96 x 80 float32, BigTIFF, LZW, 32 px tiles, overviews 2
// and 4, origin (1000, 2000) at 2 m, value = row * 1000 + col, pixel (5, 7) is no data.
const FILE = readFileSync(new URL('./fixtures/cog_lzw.tif', import.meta.url));
function rangeFetch(log = []) {
  return async (url, { headers } = {}) => {
    const [, a, b] = /bytes=(\d+)-(\d+)/.exec(headers.Range);
    log.push([+a, +b]);
    const s = FILE.subarray(+a, Math.min(+b + 1, FILE.length));
    return { ok: true, status: 206, arrayBuffer: async () => s.buffer.slice(s.byteOffset, s.byteOffset + s.byteLength) };
  };
}

test('COG header: levels, tiles, georeferencing and no-data value', async () => {
  const c = await openCOG('x.tif', { fetchFn: rangeFetch() });
  assert.deepEqual(c.levels.map(l => [l.width, l.height]), [[96, 80], [48, 40], [24, 20]]);
  assert.deepEqual(c.levels.map(l => l.res[0]), [2, 4, 8]);
  assert.deepEqual(c.origin, [1000, 2000]);
  assert.equal(c.nodata, -32767);
  assert.equal(c.levels[0].tileW, 32); assert.equal(c.levels[0].compression, 5);
});

test('window across four tiles at full resolution, with the no-data pixel', async () => {
  const log = [], c = await openCOG('x.tif', { fetchFn: rangeFetch(log) });
  const stats = { bytes: 0, tiles: 0 }, w = await c.readWindow(0, 2, 3, 40, 37, stats);   // cols 2..39, rows 3..36
  assert.equal(w.length, 38 * 34);
  for (const [r, col] of [[3, 2], [3, 39], [36, 2], [36, 39], [20, 31], [20, 32], [31, 31], [32, 32]])
    assert.equal(w[(r - 3) * 38 + (col - 2)], r * 1000 + col, `${r},${col}`);
  assert.ok(Number.isNaN(w[(5 - 3) * 38 + (7 - 2)]));
  assert.equal(stats.tiles, 4);
  assert.ok(stats.bytes < FILE.length / 2, 'only the covering tiles are downloaded');
});

test('overview level and windows that run off the image', async () => {
  const c = await openCOG('x.tif', { fetchFn: rangeFetch() });
  const o = await c.readWindow(1, 0, 0, 48, 40);
  assert.equal(o[3 * 48 + 4], 6008);   // nearest overview: row 6, col 8 of the full image
  const off = await c.readWindow(0, 90, 75, 100, 85);   // 6 x 5 inside, the rest outside
  assert.equal(off[0], 75 * 1000 + 90); assert.ok(Number.isNaN(off[9])); assert.ok(Number.isNaN(off[9 * 10]));
});

test('TIFF LZW: literal codes, a repeated string and the KwKwK case', () => {
  // Codes (9 bits, MSB first): clear, 'A', 'B', 258 ("AB"), 260 ("BAB"... KwKwK = "ABA"), end.
  const codes = [256, 65, 66, 258, 260, 257];
  const bits = codes.map(c => c.toString(2).padStart(9, '0')).join('');
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i] === '1') bytes[i >> 3] |= 0x80 >> (i & 7);
  assert.equal(new TextDecoder().decode(lzwDecode(bytes, 7)), 'ABABABA');
});
