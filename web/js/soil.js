// Soil at a point for a field built in the browser. In the United States, USDA NRCS Soil Data
// Access (SSURGO, keyless, open to browsers) gives the main component of the map unit under the
// point and its surface horizon: texture, organic matter, sand and clay. Canada has no browser-open
// point service yet, so there the farmer still ticks the box. No imports, so node --test can load it.

export const SDA_URL = 'https://sdmdataaccess.sc.egov.usda.gov/Tabular/post.rest';

export function sdaQuery(lat, lon) {
  const pt = `point(${(+lon).toFixed(5)} ${(+lat).toFixed(5)})`;
  return 'SELECT TOP 1 mu.muname, c.compname, c.comppct_r, tg.texdesc, ch.om_r, ch.sandtotal_r, ch.claytotal_r '
    + 'FROM mapunit mu INNER JOIN component c ON c.mukey = mu.mukey INNER JOIN chorizon ch ON ch.cokey = c.cokey '
    + "INNER JOIN chtexturegrp tg ON tg.chkey = ch.chkey AND tg.rvindicator = 'Yes' "
    + `WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${pt}')) AND ch.hzdept_r = 0 `
    + 'ORDER BY c.comppct_r DESC';
}

// Sand, loamy sand and sandy loam count as light soil (the field rank's light-soil input);
// anything with clay in its texture name, and loams, do not.
export const isLight = tex => /sand/i.test(tex) && !/clay/i.test(tex);

// The SDA answer (JSON+COLUMNNAME) as {name, component, texture, om, sand, clay, light, source}, or null.
export function parseSDA(json) {
  const t = json?.Table;
  if (!Array.isArray(t) || t.length < 2) return null;
  const row = Object.fromEntries(t[0].map((k, i) => [k, t[1][i]]));
  const num = v => (v == null || v === '' ? null : +v);
  return { name: row.muname, component: row.compname, texture: row.texdesc, om: num(row.om_r), sand: num(row.sandtotal_r),
    clay: num(row.claytotal_r), light: isLight(row.texdesc ?? ''), source: 'USDA NRCS SSURGO via Soil Data Access' };
}

// Soil under (lat, lon), or null outside SSURGO coverage. Never throws: soil is a preset, not a need.
export async function soilAt(lat, lon, fetchFn = fetch) {
  try {
    const r = await fetchFn(SDA_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'JSON+COLUMNNAME', query: sdaQuery(lat, lon) }) });
    return r.ok ? parseSDA(await r.json()) : null;
  } catch { return null; }
}
