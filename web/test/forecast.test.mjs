import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { forecast, backtest } from '../js/forecast.js';
import { trapForecast } from '../js/risk.js';
import { projectClimate, rotationMetrics } from '../js/soilwater.js';

const xs = Array.from({ length: 30 }, (_, i) => 1996 + i);

test('a steady trend is picked over the mean and extrapolated', () => {
  const f = forecast(xs, xs.map(x => 2 * (x - 1996)), [2026, 2030]);
  assert.equal(f.model, 'trend');
  assert.ok(Math.abs(f.rows[0].value - 60) < 1e-9 && Math.abs(f.rows[1].value - 68) < 1e-9);
});

test('noise: the lowest backtest error wins and the range brackets the forecast', () => {
  let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const f = forecast(xs, xs.map(() => 130 + 20 * (r() - 0.5)), [2026]);
  assert.equal(f.errors[f.model], Math.min(...Object.values(f.errors)));
  assert.ok(f.rows[0].lo < f.rows[0].value && f.rows[0].value < f.rows[0].hi);
});

test('backtest only scores years after the training origin', () => {
  const bt = backtest(xs, xs, { H: 5, minTrain: 10 });
  assert.equal(bt.mean[0].length, 20);   // origins 10..29, horizon 1
  assert.equal(bt.mean[4].length, 16);
});

test('no forecast for a year already in the history or with too few years', () => {
  assert.equal(forecast(xs, xs, [2025]), null);
  assert.equal(forecast(xs.slice(0, 10), xs.slice(0, 10), [2026]), null);
});

const soil = JSON.parse(fs.readFileSync(new URL('../data/soil.json', import.meta.url)));
const weather = JSON.parse(fs.readFileSync(new URL('../data/weather.json', import.meta.url)));
const crops = JSON.parse(fs.readFileSync(new URL('../data/crops.json', import.meta.url)));

test('demo field: trap date forecast for 2026-2030 in May with a backtested range', () => {
  const fc = trapForecast(soil, 2026);
  assert.deepEqual(fc.trap_12C.rows.map(r => r.year), [2026, 2027, 2028, 2029, 2030]);
  assert.match(fc.trap_12C.rows[0].date, / May$/);
  assert.ok(fc.crw_hatch.rows.every(r => r.n >= 15));
});

test('demo field: rotation year i uses the projection for 2026 + i', () => {
  const p = projectClimate(weather, crops.crops, 45.5, 2026, 5, crops.heavy_rain_mm);
  assert.deepEqual(p.targets, [2026, 2027, 2028, 2029, 2030]);
  assert.ok(p.crops[0].corn.deficitDry >= p.crops[0].corn.deficit);
  const clim = { crops: {}, byYear: p.crops };
  const m = rotationMetrics(['corn', 'soybean', 'wheat', 'corn', 'soybean'], clim, crops, null);
  assert.equal(m.years[3].deficit, p.crops[3].corn.deficit);
});

test('a field whose data already has this year forecasts from the next year', () => {
  const live = { per_year: { ...soil.per_year, 2026: soil.per_year[2025] } };
  assert.equal(trapForecast(live, 2026).trap_12C.rows[0].year, 2027);
});
