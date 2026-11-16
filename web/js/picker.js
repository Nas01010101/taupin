// "Pick your field on a map": an OpenStreetMap view with last year's AAFC crop map on top, so the
// farmer sees their fields by colour and taps one. Leaflet (vendor/leaflet, 150 kB) loads only
// when the map opens. The tap shows the 600 m square that build.js will model.
import { fieldGrid } from './geo.js';
import { ACI_URL } from './aci.js';

let leaflet = null;
function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  leaflet ??= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/leaflet/leaflet.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'vendor/leaflet/leaflet.js';
    s.onload = () => resolve(globalThis.L);
    s.onerror = () => { leaflet = null; reject(new Error('the map library did not load')); };
    document.head.append(s);
  });
  return leaflet;
}

// The coloured crop map (AAFC's own colours) for the visible area, Canada only.
const cropOverlayURL = (b, w, h, year) => `${ACI_URL.replace('{year}', year)}?${new URLSearchParams({
  bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].join(','), bboxSR: '4326', imageSR: '4326',
  size: `${w},${h}`, format: 'png32', transparent: 'true', f: 'image' })}`;

// el: container with #pick-map; center {lat, lon}; onPick(site) on each tap.
export async function openPicker(el, { center, onPick, cropYear = 2025 }) {
  const L = await loadLeaflet();
  el.hidden = false;
  if (el._map) { el._map.invalidateSize(); return el._map; }
  const map = L.map(el.querySelector('#pick-map'), { zoomControl: true, attributionControl: true })
    .setView([center.lat, center.lon], center.zoom ?? 15);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  let crops = null;
  const refresh = () => {
    if (crops) { map.removeLayer(crops); crops = null; }
    if (map.getZoom() < 12) return;
    const size = map.getSize(), b = map.getBounds();
    crops = L.imageOverlay(cropOverlayURL(b, Math.min(1024, size.x), Math.min(1024, size.y), cropYear), b,
      { opacity: 0.45, interactive: false, attribution: `Crops ${cropYear}: AAFC Annual Crop Inventory` }).addTo(map);
  };
  map.on('moveend', refresh); refresh();
  let square = null, dot = null;
  map.on('click', e => {
    const site = { lat: Math.round(e.latlng.lat * 1e5) / 1e5, lon: Math.round(e.latlng.lng * 1e5) / 1e5 }, g = fieldGrid(site.lat, site.lon);
    square?.remove(); dot?.remove();
    square = L.rectangle([[g.se[0], g.nw[1]], [g.nw[0], g.se[1]]], { color: '#e3a93f', weight: 2, fill: false }).addTo(map);
    dot = L.circleMarker([site.lat, site.lon], { radius: 6, color: '#fff', weight: 2, fillColor: '#e3a93f', fillOpacity: 1 }).addTo(map);
    onPick(site);
  });
  el._map = map;
  return map;
}

export function centerPicker(el, site, zoom = 15) { el._map?.setView([site.lat, site.lon], zoom); }
