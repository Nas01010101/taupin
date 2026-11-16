// HTML for step 6: the farmer's priorities, the soil and water table, and one card per rotation
// (why, evidence, benefits against the current rotation, information gaps, risks). Pure functions
// of the computed metrics; every file-derived string goes through esc().
import { esc } from './ui.js';
import { PRIORITIES, versus, gaps, conflicts } from './soilwater.js';

export const TILLAGE = { fall_plow: 'Fall plough', spring_plow: 'Spring plough', mulch: 'Mulch tillage', no_till: 'No-till' };
const CROP = { corn: 'Corn', soybean: 'Soybean', wheat: 'Wheat', barley: 'Barley', oat: 'Oats', canola: 'Canola', buckwheat: 'Buckwheat' };
const day = doy => new Date(Date.UTC(2025, 0, doy)).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function controlsHTML({ names, current, chosen, tillage }) {
  const pri = Object.entries(PRIORITIES).map(([k, p]) =>
    `<label class="chk"><input type="checkbox" name="pri" value="${esc(k)}"${chosen.includes(k) ? ' checked' : ''}> ${esc(p.label)}</label>`).join('');
  const opt = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}"${k === sel ? ' selected' : ''}>${esc(v)}</option>`).join('');
  return `<fieldset class="pri"><legend>What matters on this farm</legend>${pri}</fieldset>
<div class="sw-sel"><label>Current rotation <select id="sw-current">${opt(names, current)}</select></label>
<label>Tillage <select id="sw-tillage">${opt(TILLAGE, tillage)}</select></label></div>`;
}

const fmt = (v, d = 0) => (v == null ? '?' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('en-US'));
const signed = v => (v == null ? '?' : v > 0 ? `${fmt(v)} short` : `${fmt(-v)} spare`);

// The score cell: 0 to 1 over the ticked priorities. With field notes it also says how far the notes moved it.
// impact: id -> { was, wasRank } from notesImpact(), or null.
function scoreCell(r, impact) {
  const w = impact?.[r.id], d = w && r.score != null && w.was != null ? r.score - w.was : 0;
  const parts = [d && Math.abs(d) >= 0.005 ? `${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(2)} from notes` : '',
    w && w.wasRank !== r.rank ? `moved from ${w.wasRank}` : '', r.complete ? '' : 'a priority has no value'].filter(Boolean);
  return `<td>${esc(fmt(r.score, 2))}${parts.map(p => `<span class="delta">${esc(p)}</span>`).join('')}</td>`;
}

// One row per rotation, in rank order. A "?" cell names how many of the five years lack a value.
export function tableHTML(ranked, byId, names, current, impact = null) {
  const cols = [
    ['water', 'Dry-year water, mm a year', m => signed(m.total.water)],
    ['bareHeavy', 'Heavy rain on bare soil, days in 5 years', m => fmt(m.total.bareHeavy, 1)],
    ['c', 'USLE cover factor', m => fmt(m.total.c, 2)],
    ['n', 'Nitrogen to buy, kg N/ha in 5 years', m => fmt(m.total.n)],
    ['residue', 'Crop residue, t/ha a year', m => fmt(m.total.residue, 1)],
    ['pest', 'Pest points in 5 years', m => fmt(m.total.pest)],
  ];
  const head = `<tr><th scope="col">Rotation</th><th scope="col">Score, 0 to 1</th>${cols.map(([, l]) => `<th scope="col">${esc(l)}</th>`).join('')}</tr>`;
  const rows = ranked.map(r => {
    const m = byId[r.id];
    const cells = cols.map(([k, , f]) => {
      const u = m.unknown[k === 'water' ? 'water' : k];
      return `<td${u ? ` title="${u} of 5 years have no sourced value"` : ''}>${esc(f(m))}${u ? `<sup>${u}</sup>` : ''}</td>`;
    }).join('');
    return `<tr${r.id === current ? ' class="cur"' : ''}><th scope="row">${r.rank}. ${esc(names[r.id])}${r.id === current ? ' <span class="tag">current</span>' : ''}</th>${scoreCell(r, impact)}${cells}</tr>`;
  }).join('');
  return `<table class="sw"><caption class="sr">Soil and water over five years, best rotation first</caption><thead>${head}</thead><tbody>${rows}</tbody></table>`;
}

const li = xs => xs.map(x => `<li>${esc(x)}</li>`).join('');

// One card per rotation, in rank order.
export function cardsHTML(ranked, byId, { names, texts, current, cropData, sequences, chosen, prior = [] }) {
  const cur = byId[current];
  return ranked.map(r => {
    const m = byId[r.id], t = texts[r.id] ?? {}, isCur = r.id === current;
    const vs = isCur ? [] : versus(m, cur);
    const good = vs.filter(x => x.good).map(x => x.text), bad = vs.filter(x => !x.good).map(x => x.text);
    const unranked = chosen.filter(k => r.parts[k] == null).map(k => PRIORITIES[k].label.toLowerCase());
    const gapList = [...(t.gaps ?? []), ...gaps(sequences[r.id], cropData),
      ...(unranked.length ? [`Ranked after the fully scored rotations: no value for ${unranked.join(', ')} in at least one year`] : [])];
    const seq = sequences[r.id].map((c, i) => `<li><span>Year ${i + 1}</span>${esc(CROP[c] ?? c)}</li>`).join('');
    return `<article class="rot${isCur ? ' cur' : ''}">
<h3>${r.rank}. ${esc(names[r.id])}${isCur ? ' <span class="tag">current</span>' : ''}</h3>
<ol class="seq">${seq}</ol>
<p><b>Why it is here.</b> ${esc(t.why ?? '')}</p>
<h4>Evidence</h4><ul>${li(t.evidence ?? [])}</ul>
<h4>${isCur ? 'Benefits' : 'Against the current rotation'}</h4>
${isCur ? '<p class="muted">The rotation the others are compared with.</p>'
    : `${good.length ? `<ul class="good">${li(good)}</ul>` : ''}${bad.length ? `<ul class="bad">${li(bad)}</ul>` : ''}${vs.length ? '' : '<p class="muted">No difference on the computed columns.</p>'}`}
<h4>Information gaps</h4><ul>${li(gapList)}</ul>
<h4>Risks</h4><ul>${li([...conflicts(sequences[r.id], cropData, prior), ...(t.risks ?? [])])}</ul>
</article>`;
  }).join('');
}

// How the water columns were computed, with the per-crop climatology they rest on.
export function climateHTML(clim, cropData, weather, where) {
  if (!clim) return '<p class="small">No daily weather for this field, so the water columns are empty.</p>';
  const rows = Object.entries(clim.crops).map(([id, c]) => {
    const name = cropData.crops[id].name;
    if (!c) return `<tr><th scope="row">${esc(name)}</th><td colspan="5">Not computed: no sourced crop coefficient or sowing rule</td></tr>`;
    return `<tr><th scope="row">${esc(name)}</th><td>${day(c.plant)}</td><td>${day(c.harvest)}</td><td>${fmt(c.need)}</td><td>${fmt(c.rain)}</td><td>${esc(signed(c.deficitDry))}</td></tr>`;
  }).join('');
  return `<p class="small">Daily rain from NASA GPM IMERG and air temperature from NASA POWER, ${clim.years[0]} to ${clim.years[1]} (${clim.n} years)${where ? ` at ${esc(where)}` : ''}.
Water need is FAO-56 Hargreaves reference evapotranspiration times the crop coefficient, from the sowing day (10-day mean air temperature rule) to harvest.
The dry year is the 1-in-5 worst shortfall of rain against need.
${clim.proj?.targets?.length ? `The rotation table uses projections for ${clim.proj.targets[0]} to ${clim.proj.targets[clim.proj.targets.length - 1]}, one per rotation year, from the model with the smallest backtest miss (${esc([...new Set(Object.values(clim.proj.models))].join(', ') || 'none')}); the table below is the ${clim.years[0]} to ${clim.years[1]} history they rest on.` : ''} Soil water stored at sowing and irrigation are not counted.
Heavy rain is a day with ${fmt(cropData.heavy_rain_mm)} mm or more, April to November, before about 10 % crop cover or after harvest.</p>
<div class="table-wrap"><table class="sw small"><thead><tr><th scope="col">Crop</th><th scope="col">Sown about</th><th scope="col">Harvest about</th><th scope="col">Need, mm</th><th scope="col">Rain, median mm</th><th scope="col">Dry year</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

// Two small charts, one per dataset with its own axis: SMAP and POWER soil wetness by month.
function spark(vals, label, unit, d) {
  const W = 260, H = 90, pl = 34, pb = 18, lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const x = i => pl + i * (W - pl - 6) / 11, y = v => 6 + (H - pb - 6) * (1 - (v - lo) / span);
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const months = 'JFMAMJJASOND'.split('').map((m, i) => `<text x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="middle">${m}</text>`).join('');
  return `<figure class="spark"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)} by month, ${vals.map(v => v.toFixed(d)).join(', ')}">
<text x="${pl - 4}" y="${y(hi) + 4}" text-anchor="end">${hi.toFixed(d)}</text><text x="${pl - 4}" y="${y(lo) + 4}" text-anchor="end">${lo.toFixed(d)}</text>
<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2"/>${months}</svg>
<figcaption>${esc(label)}, ${esc(unit)}</figcaption></figure>`;
}

export function smapHTML(smap, weather) {
  if (!smap?.compare) return '';
  const c = smap.compare, ms = Object.keys(c.climatology).sort();
  const rainYears = {};
  if (weather) weather.rain.forEach((v, i) => { if (v != null) { const y = new Date(Date.parse(weather.start) + i * 864e5).getUTCFullYear(); rainYears[y] = (rainYears[y] ?? 0) + v; } });
  const full = Object.entries(rainYears).filter(([y]) => +y <= 2025).map(([, v]) => v);
  const annual = full.length ? full.reduce((a, b) => a + b, 0) / full.length : null;
  const dry = c.driest.map(d => `${d.month} (${d.below_usual.toFixed(3)} m3/m3 below that month's mean)`).join(', ');
  return `<h3>NASA soil moisture and rain at the demo field</h3>
<div class="sparks">${spark(ms.map(m => c.climatology[m].smap), 'SMAP L4 root-zone soil moisture', 'm3/m3', 3)}${spark(ms.map(m => c.climatology[m].gwetroot), 'POWER root-zone wetness (GWETROOT)', '0 dry to 1 saturated', 2)}</div>
<p class="small">Monthly means, ${c.months} months from April 2015. The month-to-month departures from the usual of the two datasets correlate at r = ${c.anomaly_r.toFixed(2)},
so the POWER wetness input of the field ranking follows the satellite-constrained SMAP analysis. Driest months in SMAP: ${esc(dry)}.
${annual ? `GPM IMERG rain at this point averages ${Math.round(annual).toLocaleString('en-US')} mm a year (${full.length} years).` : ''}</p>`;
}

// "Build your own rotation": one crop per year, a name, and the rotations already built. `draft` is
// the five crops shown in the pickers; `presets` maps preset ids to their names and sequences.
export function builderHTML({ startYear, crops, draft, customs, presets, max, status = '' }) {
  const full = customs.length >= max;
  const pick = (i) => `<label class="build-year">${startYear + i}<select data-build-year="${i}">${crops.map(c =>
    `<option value="${esc(c.id)}"${c.id === draft[i] ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>`;
  const from = Object.entries(presets).map(([id, p]) => `<option value="${esc(id)}">${esc(p.name)}</option>`).join('');
  // One element per crop name, so the language layer translates each name on its own.
  const list = customs.map(r => `<li><b>${esc(r.name)}</b>: ${r.crops.map(c => `<span>${esc(crops.find(x => x.id === c)?.name ?? c)}</span>`).join(', ')}
    <button type="button" class="ghost" data-build-remove="${esc(r.id)}" aria-label="Remove ${esc(r.name)}">Remove</button></li>`).join('');
  return `<details class="build"${customs.length && !status ? '' : ' open'}><summary>Build your own rotation</summary>
<p class="small">Pick a crop for each year. Your rotation joins the table and the cards below, scored by the same pest rules and the same soil and water data. It is kept in this browser only. Crops appear here once they have sourced soil and water values.</p>
<div class="build-row"><label>Start from <select data-build-from><option value="">-</option>${from}</select></label></div>
<div class="build-row">${Array.from({ length: draft.length }, (_, i) => pick(i)).join('')}</div>
<div class="build-row"><label>Name <input id="build-name" maxlength="40" placeholder="My rotation"></label>
<button type="button" data-build-add${full ? ' disabled' : ''}>Add to the comparison</button></div>
<p class="small" role="status" id="build-status">${esc(status || (full ? `Up to ${max} of your own rotations: remove one to add another.` : ''))}</p>
${customs.length ? `<ul class="build-list">${list}</ul>` : ''}</details>`;
}
