// Bakes web/data/regions.json: the NASA POWER trap week, field rank and GPM IMERG rain for farm
// regions across North America, with the same code the page runs for typed coordinates.
// Run: node scripts/regions.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchField } from '../web/js/power.js';
import { fieldRanking } from '../web/js/fieldrisk.js';

export const REGIONS = [
  { id: 'qc', name: 'Montérégie, Quebec', lat: 45.63, lon: -72.96 },
  { id: 'on', name: 'Chatham-Kent, Ontario', lat: 42.40, lon: -82.18 },
  { id: 'pe', name: 'Prince Edward Island', lat: 46.35, lon: -63.30 },
  { id: 'sk', name: 'Saskatoon, Saskatchewan', lat: 52.13, lon: -106.67 },
  { id: 'ia', name: 'Story County, Iowa', lat: 42.03, lon: -93.62 },
  { id: 'id', name: 'Magic Valley, Idaho', lat: 42.56, lon: -114.46 },
];

const read = f => JSON.parse(readFileSync(new URL(`../web/data/${f}`, import.meta.url)));
const demo = { soil: read('soil.json'), fieldRisk: read('field_risk.json'), weather: read('weather.json') };
const model = read('risk_model.json');

const out = [];
for (const r of REGIONS) {
  const f = await fetchField({ lat: r.lat, lon: r.lon }, demo);
  const year = Math.max(...Object.keys(f.fr.per_year).map(Number));
  const rk = fieldRanking(model, f.fr, { year });
  const rain = f.weather ? f.weather.rain : [];
  const years = {};
  rain.forEach((v, i) => { const y = new Date(Date.parse(f.weather.start) + i * 864e5).getUTCFullYear(); if (v != null) years[y] = (years[y] ?? 0) + v; });
  const tot = Object.values(years);
  out.push({ ...r, trap_week: f.soil.trap_12C_mean, trap_years: f.soil.years,
    trend_days_per_decade: f.soil.trap_12C_trend_days_per_decade,
    rank_year: year, rank: rk.rank, outside_training: rk.outside,
    rain_mm_year: tot.length ? [Math.round(Math.min(...tot)), Math.round(Math.max(...tot))] : null });
  console.log(r.id, out.at(-1).trap_week, rk.rank, rk.outside.join('|'), out.at(-1).rain_mm_year);
}
writeFileSync(new URL('../web/data/regions.json', import.meta.url), JSON.stringify({ source: 'NASA POWER (TSOIL1, GWETROOT, IMERG_PRECTOT), fetched ' + new Date().toISOString().slice(0, 10), regions: out }, null, 1) + '\n');
