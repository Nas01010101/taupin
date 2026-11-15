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

// The field a visit opens on, so a farmer is not dropped on the park each time: ?field= first
// ('demo' asks for the park), then the last field picked on this device, then the baked field
// nearest a position this device fetched (within nearKm), then the first baked field.
// null means the demo park.
export function startField(fields, search, { last = null, site = null, nearKm = 50 } = {}) {
  const asked = new URLSearchParams(search).get('field');
  if (asked === 'demo') return null;
  if (fields.some(f => f.id === asked)) return asked;
  if (last === 'demo') return null;
  if (fields.some(f => f.id === last)) return last;
  const n = site && nearest(fields, site, nearKm);
  return n ? n.field.id : fields[0]?.id ?? null;
}
