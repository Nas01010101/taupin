// Offline copy of the app. Network first so a running server always wins, then the cache, so
// the installed app opens with no network. Bump CACHE when vendor/ or the shell changes.
const CACHE = 'taupin-v19';
const SHELL = [
  './', 'index.html', 'app.css', 'nasa.css', 'img/hero.jpg', 'manifest.webmanifest',
  'js/i18n.js', 'js/i18n-fr.js', 'js/i18n-fr-text.js', 'js/i18n-fr-pat.js', 'js/i18n-fr-pat2.js', 'js/i18n-fr-post.js',
  'js/app.js', 'js/scene.js', 'js/layers.js', 'js/model.js', 'js/classify.js', 'js/risk.js', 'js/fieldrisk.js', 'js/ui.js', 'js/scout.js', 'js/power.js', 'js/finds.js', 'js/demo.js', 'js/soilwater.js', 'js/swui.js', 'js/engine.js', 'js/custom.js', 'js/history.js', 'js/memory.js', 'js/memoryui.js', 'js/mapnotes.js', 'js/fields.js', 'js/organic.js', 'data/fields/index.json',
  'vendor/three/three.module.js', 'vendor/three/three.core.js', 'vendor/three/OrbitControls.js',
  'vendor/ort/ort.wasm.min.mjs', 'vendor/ort/ort-wasm-simd-threaded.mjs', 'vendor/ort/ort-wasm-simd-threaded.wasm',
  'data/field.json', 'data/risk.json', 'data/soil.json', 'data/gallery.json', 'data/risk_model.json', 'data/field_risk.json',
  'data/crops.json', 'data/rotations.json', 'data/weather.json', 'data/smap.json',
  'vendor/fonts/instrument-serif-latin-400-normal.woff2', 'vendor/fonts/inter-latin-400-normal.woff2', 'vendor/fonts/inter-latin-600-normal.woff2',
  'data/layers/height.bin', 'data/layers/canopy.bin', 'data/layers/hillshade.bin', 'data/layers/slope.bin',
  'data/layers/twi.bin', 'data/layers/ndvi.bin', 'data/layers/lst.bin', 'data/layers/soil.bin', 'data/layers/om.bin', 'data/layers/zones.bin',
  'icons/icon.svg', 'icons/logo.svg', 'icons/favicon-32.png', 'icons/icon-192.png',
];
// Optional files: cached when present (the model is not installed on every copy).
const OPTIONAL = ['js/sceneclass.js', 'data/scene_head.json', 'model/labels.json', 'model/taupin.onnx', 'model/metrics.json', 'model/MODEL_CARD.md'];

self.addEventListener('install', e => e.waitUntil((async () => {
  const c = await caches.open(CACHE);
  await c.addAll(SHELL);
  await Promise.all(OPTIONAL.map(u => fetch(u).then(r => r.ok && c.put(u, r)).catch(() => {})));
  const g = await c.match('data/gallery.json');
  if (g) await Promise.all((await g.clone().json()).items.map(it => c.add(it.file).catch(() => {})));
  self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    try {
      const r = await fetch(e.request);
      if (r.ok && !url.search) c.put(e.request, r.clone());
      return r;
    } catch {
      return (await c.match(e.request, { ignoreSearch: true })) ?? Response.error();
    }
  })());
});
