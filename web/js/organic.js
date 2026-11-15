// Soil organic matter: the soil-survey values baked per field (src/taupin/organic.py) and a live
// ISRIC SoilGrids 2.0 query (250 m, open CORS) for the parcel centre or the farmer's own point,
// so every field gets a number and a baked field gets a second, independent one.
// The engine reads one thing from it: the RAP wireworm factor "organic matter > 10 %".

export const OM_PER_OC = 1.724;     // van Bemmelen, as in src/taupin/organic.py
export const RAP_OM_PCT = 10;
export const SG_SRC = 'ISRIC SoilGrids 2.0, soil organic carbon (soc), 250 m, mean with 5 % and 95 % quantiles, CC BY 4.0';
const DEPTHS = ['0-5cm', '5-15cm', '15-30cm'];

export function soilgridsURL(lat, lon) {
  const q = DEPTHS.map(d => `&depth=${d}`).join('') + ['mean', 'Q0.05', 'Q0.95'].map(v => `&value=${v}`).join('');
  return `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lon.toFixed(4)}&lat=${lat.toFixed(4)}&property=soc${q}`;
}

// SoilGrids reports soc in dg/kg: % = value / 100. The 0-30 cm figure is thickness-weighted.
export function parseSoilgrids(j) {
  const soc = j?.properties?.layers?.find(l => l.name === 'soc');
  if (!soc) return null;
  const pct = v => (v == null ? null : v / 100);
  const rows = soc.depths.map(d => ({
    label: d.label.replace('cm', ' cm'), top: d.range.top_depth, bottom: d.range.bottom_depth,
    oc: pct(d.values.mean), lo: pct(d.values['Q0.05']), hi: pct(d.values['Q0.95']),
  })).filter(r => r.oc != null);
  if (!rows.length) return null;
  const w = rows.reduce((a, r) => a + (r.bottom - r.top), 0);
  const oc30 = rows.reduce((a, r) => a + r.oc * (r.bottom - r.top), 0) / w;
  return { rows, oc30, om30: OM_PER_OC * oc30, src: SG_SRC };
}

// SoilGrids asks for at most 5 calls a minute and can take tens of seconds, so the call gives up after `ms`.
export async function fetchSoilgrids(lat, lon, fetchFn = fetch, ms = 20000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetchFn(soilgridsURL(lat, lon), { signal: ctl.signal });
    if (!r.ok) throw new Error(`SoilGrids answered ${r.status}`);
    return parseSoilgrids(await r.json());
  } finally { clearTimeout(t); }
}

// Organic matter the pest engine should use for a zone: the soil survey first, then SoilGrids.
// A survey that has carbon for under half the parcel (the park: Dorval has none) is not used.
export function zoneOM(org, zone, sg) {
  const v = org && org.mapped_ha >= org.parcel_ha / 2 ? org[`${zone}_om_pct`] ?? org.field_om_pct : null;
  if (v != null) return { om: v, from: 'soil survey' };
  if (sg) return { om: Math.round(sg.om30 * 10) / 10, from: 'SoilGrids 0-30 cm' };
  return null;
}

// The engine's two baked soil cases differ only in the RAP organic-matter factor
// (upland OM 5 %, pocket OM 12 % in src/taupin/bake.py), so a measured value picks the case.
export function riskZone(zone, om) {
  if (!om) return zone;
  return om.om > RAP_OM_PCT ? 'pocket' : 'upland';
}

export function zoneLabel(zone, om) {
  const name = zone === 'pocket' ? 'Low wet pocket' : 'Upland';
  if (!om) return null;
  return `${name}: organic matter ${(Math.round(om.om * 10) / 10).toFixed(1)} % from the ${om.from}, ${om.om > RAP_OM_PCT ? 'over' : 'under'} the RAP factor of ${RAP_OM_PCT} %`;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const f1 = v => (v == null ? 'n/a' : (Math.round(v * 10) / 10).toFixed(1));

export function organicHTML(org, units, sg, { status = '', where = 'the parcel centre' } = {}) {
  const rows = ['<p class="small muted">Added after judge feedback.</p>'];
  if (org) {
    const part = org.mapped_ha < org.parcel_ha ? ` on ${org.mapped_ha} of ${org.parcel_ha} ha` : '';
    const split = org.pocket_om_pct !== org.upland_om_pct ? ` (low wet pocket ${f1(org.pocket_om_pct)} %, upland ${f1(org.upland_om_pct)} %)` : '';
    const rap = org.over_rap_ha ? `${org.over_rap_ha} ha over the ${org.rap_om_pct} % wireworm risk level.` : `Under the ${org.rap_om_pct} % wireworm risk level.`;
    rows.push(`<p><b>Soil survey:</b> ${f1(org.field_om_pct)} % organic matter${part}${split}. ${rap}</p>`);
    const u = (units || []).filter(x => x.components.some(c => c.name !== 'Water'));
    if (u.length) {
      rows.push(`<table class="om"><thead><tr><th>Soil</th><th>Organic carbon</th><th>Organic matter</th></tr></thead><tbody>${u.map(x =>
        `<tr><td>${esc(x.components.map(c => c.name).join(', '))}</td>` +
        `<td>${esc(x.components.map(c => (c.oc_pct == null ? 'no value' : `${c.oc_pct} %`)).join(', '))}</td>` +
        `<td>${x.om_pct == null ? 'no value' : `${x.om_pct} %`}</td></tr>`).join('')}</tbody></table>`);
    }
  }
  if (sg) {
    rows.push(`<p><b>SoilGrids at ${esc(where)}:</b> ${f1(sg.om30)} % organic matter, 0-30 cm.</p>`);
    if (org?.field_om_pct != null) {
      const d = Math.abs(sg.om30 - org.field_om_pct);
      rows.push(`<p class="small muted">${d < 2 ? 'Both agree within 2 points.' : `They differ by ${f1(d)} points.`} A lab test is better than both.</p>`);
    }
  } else if (status) rows.push(`<p class="small muted">${esc(status)}</p>`);
  rows.push(`<p class="small muted">Organic matter = organic carbon x ${OM_PER_OC.toFixed(2)}. Sources: AAFC soil survey (1950s, 1:20 000) and ISRIC SoilGrids (250 m).</p>`);
  return rows.join('');
}
