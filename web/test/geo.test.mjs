import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toLambert, fromLambert, fieldGrid, metresPerDegree, tileXY, tilePixelM, terrarium } from '../js/geo.js';

// Reference values from PROJ (rasterio.warp.transform EPSG:4617 NAD83(CSRS) -> EPSG:3979). From
// WGS84 PROJ also shifts the datum, about 1 m here; the app ignores that against 4 m cells.
const REF = [
  [45.6917, -73.5504, 1662457.201, -87329.694], [45.5013, -73.7651, 1653478.493, -113199.246],
  [52.13, -106.67, -785968.527, 418510.536], [46.35, -63.3, 2366309.41, 305942.823],
  [60.0, -135.0, -2029330.323, 1864279.107], [42.03, -93.62, 118034.78, -785359.948],
];

test('Canada Atlas Lambert (EPSG:3979) matches PROJ to the millimetre, both ways', () => {
  for (const [lat, lon, x, y] of REF) {
    const [px, py] = toLambert(lat, lon);
    assert.ok(Math.abs(px - x) < 0.005 && Math.abs(py - y) < 0.005, `${lat},${lon}: ${px},${py}`);
    const back = fromLambert(x, y);
    assert.ok(Math.abs(back.lat - lat) < 1e-8 && Math.abs(back.lon - lon) < 1e-8, `${lat},${lon} back`);
  }
});

test('field grid: north-up, centred on the click, cells round-trip', () => {
  const g = fieldGrid(45.6917, -73.5504, { side: 600, res: 4 });
  assert.equal(g.size, 150);
  const m = metresPerDegree(45.6917);
  assert.ok(Math.abs((g.nw[0] - g.se[0]) * m.lat - 600) < 1e-6 && Math.abs((g.se[1] - g.nw[1]) * m.lon - 600) < 1e-6);
  const c = g.latLonOf(74.5, 74.5);   // the centre of the grid is the clicked point
  assert.ok(Math.abs(c.lat - 45.6917) < 1e-9 && Math.abs(c.lon + 73.5504) < 1e-9);
  const rc = g.cellOf(g.latLonOf(10, 120).lat, g.latLonOf(10, 120).lon);
  assert.ok(Math.abs(rc.row - 10) < 1e-6 && Math.abs(rc.col - 120) < 1e-6);
  assert.ok(g.latLonOf(0, 0).lat > g.latLonOf(149, 0).lat && g.latLonOf(0, 149).lon > g.latLonOf(0, 0).lon);
});

test('web map tiles and terrarium heights', () => {
  const t = tileXY(45.6917, -73.5504, 15);
  assert.equal(Math.floor(t.x), 9689); assert.equal(Math.floor(t.y), 11697);   // 9689.28, 11697.89 computed independently
  assert.ok(Math.abs(tilePixelM(0, 0) - 156543.03) < 0.01);
  assert.equal(terrarium(128, 0, 0), 0); assert.equal(terrarium(128, 25, 128), 25.5);
});
