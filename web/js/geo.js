// Coordinates for a field built in the browser (build.js): the local metre grid around the point
// the farmer clicked, Canada Atlas Lambert (EPSG:3979, the NRCan HRDEM lidar mosaic) and web map
// tiles (terrain tiles, crop map pixels). Pure functions, no imports, so node --test can load it.

const RAD = Math.PI / 180;

// ---------------------------------------------------------------- local field grid
// Metres per degree at latitude lat on the WGS84 ellipsoid (series to cos 4 phi): over a 600 m
// square the flat east-north grid is off by well under a centimetre.
export function metresPerDegree(lat) {
  const p = lat * RAD;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p),
    lon: 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p),
  };
}

// A north-up square of size x size cells of res metres centred on (lat, lon). Row 0 is the north
// edge, column 0 the west edge, like the baked fields. Cell centres map to lat/lon and back.
export function fieldGrid(lat, lon, { side = 600, res = 4 } = {}) {
  const size = Math.round(side / res), m = metresPerDegree(lat), half = (size * res) / 2;
  const latLonOf = (row, col) => ({
    lat: lat + (half - (row + 0.5) * res) / m.lat,
    lon: lon + ((col + 0.5) * res - half) / m.lon,
  });
  const cellOf = (la, lo) => ({ row: (half - (la - lat) * m.lat) / res - 0.5, col: ((lo - lon) * m.lon + half) / res - 0.5 });
  const nw = latLonOf(-0.5, -0.5), se = latLonOf(size - 0.5, size - 0.5);
  return { lat, lon, size, res, latLonOf, cellOf, nw: [nw.lat, nw.lon], se: [se.lat, se.lon],
    bbox: [nw.lon, se.lat, se.lon, nw.lat] };   // west, south, east, north
}

// ---------------------------------------------------------------- EPSG:3979
// Lambert Conformal Conic, two standard parallels (Snyder 1987, eq. 15-1 to 15-11), on GRS80:
// standard parallels 49 and 77 N, origin 49 N 95 W, no false easting or northing.
// Coordinates are taken as NAD83(CSRS); GPS (WGS84) differs by about 1 m, ignored against 4 m cells.
const A = 6378137, F = 1 / 298.257222101, E = Math.sqrt(2 * F - F * F);
const mOf = p => Math.cos(p) / Math.sqrt(1 - (E * Math.sin(p)) ** 2);
const tOf = p => Math.tan(Math.PI / 4 - p / 2) / ((1 - E * Math.sin(p)) / (1 + E * Math.sin(p))) ** (E / 2);
const P1 = 49 * RAD, P2 = 77 * RAD, P0 = 49 * RAD, L0 = -95 * RAD;
const N_ = (Math.log(mOf(P1)) - Math.log(mOf(P2))) / (Math.log(tOf(P1)) - Math.log(tOf(P2)));
const F_ = mOf(P1) / (N_ * tOf(P1) ** N_);
const R0 = A * F_ * tOf(P0) ** N_;

export function toLambert(lat, lon) {
  const r = A * F_ * tOf(lat * RAD) ** N_, th = N_ * (lon * RAD - L0);
  return [r * Math.sin(th), R0 - r * Math.cos(th)];
}

export function fromLambert(x, y) {
  const r = Math.sign(N_) * Math.hypot(x, R0 - y), t = (r / (A * F_)) ** (1 / N_);
  const th = Math.atan2(Math.sign(N_) * x, Math.sign(N_) * (R0 - y));
  let p = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 12; i++) p = Math.PI / 2 - 2 * Math.atan(t * ((1 - E * Math.sin(p)) / (1 + E * Math.sin(p))) ** (E / 2));
  return { lat: p / RAD, lon: (th / N_ + L0) / RAD };
}

// ---------------------------------------------------------------- web map tiles (EPSG:3857)
// Fractional tile x, y of a point at zoom z (OpenStreetMap slippy-map numbering).
export function tileXY(lat, lon, z) {
  const n = 2 ** z, s = Math.sin(lat * RAD);
  return { x: ((lon + 180) / 360) * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}

// Ground size of one tile pixel in metres (256 px tiles).
export const tilePixelM = (lat, z) => (40075016.686 * Math.cos(lat * RAD)) / (256 * 2 ** z);

// Terrain tiles ("terrarium" encoding): height m = R * 256 + G + B / 256 - 32768.
export const terrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;
