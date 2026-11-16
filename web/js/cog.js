// A small reader for cloud-optimized GeoTIFFs (COG): it asks the server for the file header and
// then only for the internal tiles that cover a window, with HTTP range requests, so a 600 m
// field out of a 309 GB lidar mosaic costs a few hundred kilobytes. Handles TIFF and BigTIFF,
// tiled, single band, uncompressed, LZW (TIFF flavour) or Deflate, 8 to 64-bit samples, the
// overview levels (reduced-resolution copies) and the GeoTIFF pixel scale and tie point.
// No imports, so node --test can run it against a fixture written by GDAL.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4, 16: 8, 17: 8, 18: 8 };
const T = { width: 256, height: 257, bits: 258, compression: 259, subfile: 254, predictor: 317, tileW: 322, tileH: 323,
  tileOffsets: 324, tileCounts: 325, sampleFormat: 339, samples: 277, pixelScale: 33550, tiepoint: 33922, nodata: 42113 };

// fetch(url, {headers: {Range}}) -> ArrayBuffer of bytes start..end (inclusive). A server that
// ignores Range and sends the whole file still works, sliced here.
async function rangeOf(fetchFn, url, start, end) {
  const r = await fetchFn(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const b = await r.arrayBuffer();
  return r.status === 206 ? b : b.slice(start, end + 1);
}

// TIFF LZW (MSB-first codes, 256 = clear, 257 = end, code width grows one code early).
export function lzwDecode(src, outLen) {
  const out = new Uint8Array(outLen), prefix = new Int32Array(4096), suffix = new Uint8Array(4096);
  const len = new Int32Array(4096), first = new Uint8Array(4096);
  for (let i = 0; i < 256; i++) { prefix[i] = -1; suffix[i] = i; len[i] = 1; first[i] = i; }
  const nbits = src.length * 8;
  let next = 258, width = 9, bit = 0, op = 0, old = -1;
  const get = () => {
    if (bit + width > nbits) return 257;
    let v = 0;
    for (let k = 0; k < width; k++, bit++) v = (v << 1) | ((src[bit >> 3] >> (7 - (bit & 7))) & 1);
    return v;
  };
  const emit = code => {
    const L = len[code];
    for (let k = L - 1, c = code; k >= 0; k--, c = prefix[c]) if (op + k < outLen) out[op + k] = suffix[c];
    op += L;
  };
  const add = (p, ch) => { if (next < 4096) { prefix[next] = p; suffix[next] = ch; len[next] = len[p] + 1; first[next] = first[p]; next++; } };
  for (;;) {
    let code = get();
    if (code === 257) break;
    if (code === 256) {
      next = 258; width = 9;
      code = get();
      if (code === 257) break;
      emit(code); old = code;
      continue;
    }
    if (old < 0) throw new Error('LZW: stream does not start with a clear code');
    if (code < next) { emit(code); add(old, first[code]); } else { add(old, first[old]); emit(next - 1); }
    old = code;
    if (next + 1 >= (1 << width) && width < 12) width++;
    if (op >= outLen) break;
  }
  return out;
}

async function inflate(bytes) {
  const s = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// Open a COG: header and IFDs (one per resolution level), without reading any pixel.
export async function openCOG(url, { fetchFn = fetch, headBytes = 65536 } = {}) {
  let head = await rangeOf(fetchFn, url, 0, headBytes - 1);
  let dv = new DataView(head);
  const le = dv.getUint16(0) === 0x4949, big = dv.getUint16(2, le) === 43;
  const ensure = async end => {   // the header region grows if an IFD lies past it
    if (end <= head.byteLength) return;
    let n = head.byteLength;
    while (n < end) n *= 2;
    head = await rangeOf(fetchFn, url, 0, n - 1); dv = new DataView(head);
  };
  const u64 = o => Number(dv.getBigUint64(o, le));
  const uint = (o, type) => (type === 3 ? dv.getUint16(o, le) : type === 16 || type === 18 ? u64(o) : dv.getUint32(o, le));
  const num = (o, type) => (type === 12 ? dv.getFloat64(o, le) : type === 11 ? dv.getFloat32(o, le) : uint(o, type));
  const inline = big ? 8 : 4, entry = big ? 20 : 12;
  const levels = [];
  let ifd = big ? u64(8) : dv.getUint32(4, le);
  while (ifd) {
    await ensure(ifd + 16);
    const n = big ? u64(ifd) : dv.getUint16(ifd, le), start = ifd + (big ? 8 : 2);
    await ensure(start + n * entry + 8);
    const tags = {};
    for (let i = 0; i < n; i++) {
      const e = start + i * entry, tag = dv.getUint16(e, le), type = dv.getUint16(e + 2, le);
      const count = big ? u64(e + 4) : dv.getUint32(e + 4, le), size = (TYPE_SIZE[type] ?? 1) * count;
      const pos = size <= inline ? e + (big ? 12 : 8) : (big ? u64(e + 12) : dv.getUint32(e + 8, le));
      tags[tag] = { type, count, pos, inHead: size <= inline };
    }
    const val = async (tag, all = false) => {
      const t = tags[tag];
      if (!t) return undefined;
      if (t.type === 2) { await ensure(t.pos + t.count); return new TextDecoder().decode(new Uint8Array(head, t.pos, t.count)).replace(/\0+$/, ''); }
      const sz = TYPE_SIZE[t.type];
      if (!all) { await ensure(t.pos + sz); return num(t.pos, t.type); }
      await ensure(t.pos + sz * t.count);
      return Array.from({ length: t.count }, (_, k) => num(t.pos + k * sz, t.type));
    };
    const lvl = {
      width: await val(T.width), height: await val(T.height), tileW: await val(T.tileW), tileH: await val(T.tileH),
      bits: (await val(T.bits)) ?? 1, compression: (await val(T.compression)) ?? 1, predictor: (await val(T.predictor)) ?? 1,
      sampleFormat: (await val(T.sampleFormat)) ?? 1, samples: (await val(T.samples)) ?? 1, subfile: (await val(T.subfile)) ?? 0,
      offsets: tags[T.tileOffsets], counts: tags[T.tileCounts],
    };
    if (!levels.length) {
      lvl.scale = await val(T.pixelScale, true); lvl.tie = await val(T.tiepoint, true);
      const nd = await val(T.nodata); lvl.nodata = nd === undefined ? null : Number(nd);
    }
    if (!(lvl.subfile & 4)) levels.push(lvl);   // skip transparency masks
    await ensure(start + n * entry + inline);
    ifd = big ? u64(start + n * entry) : dv.getUint32(start + n * entry, le);
  }
  const base = levels[0];
  if (!base.tileW) throw new Error('COG: the image is not tiled');
  if (base.samples !== 1) throw new Error('COG: only single-band images are read');
  const [sx, sy] = base.scale, [i0, j0, , X0, Y0] = base.tie;
  const origin = [X0 - i0 * sx, Y0 + j0 * sy];
  for (const l of levels) l.res = [sx * base.width / l.width, sy * base.height / l.height];

  // Byte offset and length of tile k of a level, read from the offset arrays by range request.
  const entries = async (t, k0, k1) => {
    const sz = TYPE_SIZE[t.type];
    if (t.inHead || t.pos + (k1 + 1) * sz <= head.byteLength) { await ensure(t.pos + (k1 + 1) * sz); return Array.from({ length: k1 - k0 + 1 }, (_, i) => uint(t.pos + (k0 + i) * sz, t.type)); }
    const b = new DataView(await rangeOf(fetchFn, url, t.pos + k0 * sz, t.pos + (k1 + 1) * sz - 1));
    return Array.from({ length: k1 - k0 + 1 }, (_, i) => (sz === 8 ? Number(b.getBigUint64(i * 8, le)) : sz === 2 ? b.getUint16(i * 2, le) : b.getUint32(i * 4, le)));
  };
  const bytesPer = base.bits / 8;
  const sample = (v, o) => {
    if (base.sampleFormat === 3) return base.bits === 64 ? v.getFloat64(o, le) : v.getFloat32(o, le);
    if (base.sampleFormat === 2) return base.bits === 8 ? v.getInt8(o) : base.bits === 16 ? v.getInt16(o, le) : v.getInt32(o, le);
    return base.bits === 8 ? v.getUint8(o) : base.bits === 16 ? v.getUint16(o, le) : v.getUint32(o, le);
  };

  // Pixels [c0, c1) x [r0, r1) of level `li` as a Float32Array, row-major, NaN for no data and
  // outside the image. Each covering tile is fetched once; `stats.bytes` counts what came down.
  async function readWindow(li, c0, r0, c1, r1, stats = { bytes: 0, tiles: 0 }) {
    const l = levels[li], w = c1 - c0, h = r1 - r0, out = new Float32Array(w * h).fill(NaN);
    const across = Math.ceil(l.width / l.tileW);
    const tx0 = Math.max(0, Math.floor(c0 / l.tileW)), tx1 = Math.min(across - 1, Math.floor((c1 - 1) / l.tileW));
    const ty0 = Math.max(0, Math.floor(r0 / l.tileH)), ty1 = Math.min(Math.ceil(l.height / l.tileH) - 1, Math.floor((r1 - 1) / l.tileH));
    const raw = l.tileW * l.tileH * bytesPer;
    for (let ty = ty0; ty <= ty1; ty++) {
      const k0 = ty * across + tx0, k1 = ty * across + tx1;
      const offs = await entries(l.offsets, k0, k1), cnts = await entries(l.counts, k0, k1);
      await Promise.all(offs.map(async (off, i) => {
        const tx = tx0 + i;
        if (!cnts[i]) return;   // sparse tile: no data
        let bytes = new Uint8Array(await rangeOf(fetchFn, url, off, off + cnts[i] - 1));
        stats.bytes += bytes.length; stats.tiles++;
        if (l.compression === 5) bytes = lzwDecode(bytes, raw);
        else if (l.compression === 8 || l.compression === 32946) bytes = await inflate(bytes);
        else if (l.compression !== 1) throw new Error(`COG: compression ${l.compression} is not supported`);
        if (l.predictor !== 1) throw new Error(`COG: predictor ${l.predictor} is not supported`);
        const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let y = 0; y < l.tileH; y++) {
          const r = ty * l.tileH + y - r0;
          if (r < 0 || r >= h || ty * l.tileH + y >= l.height) continue;   // edge tiles are padded
          for (let x = 0; x < l.tileW; x++) {
            const c = tx * l.tileW + x - c0;
            if (c < 0 || c >= w || tx * l.tileW + x >= l.width) continue;
            const s = sample(v, (y * l.tileW + x) * bytesPer);
            out[r * w + c] = s === base.nodata || Number.isNaN(s) ? NaN : s;
          }
        }
      }));
    }
    return out;
  }
  return { levels, origin, nodata: base.nodata, readWindow };
}
