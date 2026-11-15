// The Quebec fields baked by src/taupin/layers.py (data/fields/index.json) and the one nearest a
// position. No imports, so node tests can load it.

const R = 6371;   // km, mean Earth radius
export function km(a, b) {
  const r = d => d * Math.PI / 180, dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// {field, km} for the closest baked field within maxKm of site, or null.
export function nearest(fields, site, maxKm = 10) {
  let best = null;
  for (const f of fields) {
    const d = km(site, f);
    if (d <= maxKm && (!best || d < best.km)) best = { field: f, km: d };
  }
  return best;
}

// The id in ?field= when it names a baked field, else null (the demo park).
export function fieldParam(fields, search) {
  const id = new URLSearchParams(search).get('field');
  return fields.some(f => f.id === id) ? id : null;
}
