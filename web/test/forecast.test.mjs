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

test('trap calendar: ready by the early date, three counts a week apart, the count decides next year', async () => {
  const { trapPlan } = await import('../js/risk.js');
  assert.equal(trapPlan(null), null);
  const p = trapPlan({ year: 2027, doy: [126, 134, 145] });   // day 134 of 2001 = 14 May
  assert.equal(p.install, '14 May');
  assert.equal(p.earliest, '6 May');
  assert.deepEqual(p.counts, ['21 May', '28 May', '4 Jun']);
  assert.equal(p.decides, 2028);
});

test('trap calendar from the demo forecast has real dates', async () => {
  const { trapPlan } = await import('../js/risk.js');
  const soil = JSON.parse(fs.readFileSync(new URL('../data/soil.json', import.meta.url)));
  const p = trapPlan(trapForecast(soil, 2026).trap_12C.rows[0]);
  for (const d of [p.earliest, p.install, p.latest, ...p.counts]) assert.match(d, /^\d{1,2} (Apr|May|Jun|Jul)$/);
});

import { rangeCheck } from '../js/forecast.js';
import { trapHTML } from '../js/ui.js';
import { trapWindow } from '../js/risk.js';

test('rangeCheck tests each miss against the range from the misses before it only', () => {
  // Ranges from [0,1,2,3,4] (0.4..3.6) and then [0..5] (0.5..4.5): 5 is outside, 2 is inside.
  assert.deepEqual(rangeCheck([0, 1, 2, 3, 4, 5, 2]), { inside: 1, n: 2 });
  assert.deepEqual(rangeCheck([1, 2, 3]), { inside: 0, n: 0 });   // fewer than 5 earlier misses
});

test('demo field: the trap-date range holds on misses it was not built from, close to its 80 %', () => {
  const t = trapForecast(soil, 2026).trap_12C;
  assert.deepEqual([t.check.inside, t.check.n], [61, 70]);
  assert.deepEqual(t.check.byHorizon.map(c => `${c.inside}/${c.n}`), ['16/16', '12/15', '12/14', '11/13', '10/12']);
  const share = t.check.inside / t.check.n;
  assert.ok(share >= 0.7 && share <= 0.9, `held ${share}`);   // the bar in docs/PREDICTIONS.md
  assert.match(trapHTML(trapWindow(soil, 2026), soil, []), /the range held 61 of 70 times \(87 %\)/);


test('leap years do not shift the forecast: the same calendar date every year forecasts that date exactly', () => {
  const per_year = {};
  for (let y = 2000; y <= 2025; y++) per_year[y] = { trap_12C: `${y}-05-14` };   // seven leap years among them
  const r = trapForecast({ per_year }, 2026).trap_12C.rows[0];
  assert.deepEqual(r.doy, [134, 134, 134]);   // with the calendar day of year, leap years would read 135
  assert.deepEqual([r.date, r.lo, r.hi], ['14 May', '14 May', '14 May']);
});
