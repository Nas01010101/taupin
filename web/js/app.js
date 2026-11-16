// Wires the page: loads the baked data, builds the 3D field, loads the model if installed,
// classifies dropped photos in the browser and redraws the risk panel from the evidence.
import * as ort from '../vendor/ort/ort.wasm.min.mjs';
import { createScene } from './scene.js';
import { VIEWS } from './layers.js';
import { loadModel, classifyPixels } from './model.js';
import { effectFor, riskView, trapWindow, trapPlan, ROTATION_NAMES } from './risk.js';
import { climatology, projectClimate, rotationMetrics, rank } from './soilwater.js';
import * as sw from './swui.js';
import { fieldRanking } from './fieldrisk.js';
import { parseCoords, coordText, fetchField } from './power.js';
import { formatAnswer, preprocess } from './classify.js';
import * as scout from './scout.js';
import * as finds from './finds.js';
import * as memory from './memory.js';
import * as memoryui from './memoryui.js';
import { createMapNotes } from './mapnotes.js';
import * as ui from './ui.js';
import { nearest, startField, km } from './fields.js';
import { buildField, packField, unpackField } from './build.js';
import { soilAt } from './soil.js';
import { riskMatrix } from './engine.js';
import { openPicker, centerPicker } from './picker.js';

const $ = s => document.querySelector(s);
const getJSON = async p => { const r = await fetch(p); if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`); return r.json(); };
const PIN = { wireworm: 0xe3a93f, rootworm: 0xb3361f, beneficial: 0x4f9a5a, none: 0x8a8f8c, unscored: 0x8a8f8c, unclear: 0xf2f2f2 };

const state = { sw: { chosen: ['pests', 'water', 'soil', 'nitrogen', 'organic'], current: null, tillage: 'fall_plow' }, zone: 'upland', sel: null, rankYear: null, forage: 0, evidence: [], current: { kind: 'idle' }, model: { status: 'loading' } };
let D, scene, mn;

// The count sheet lives in this browser only (localStorage); nothing is sent anywhere.
const SHEET_KEY = 'taupin-counts';
function loadSheet() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SHEET_KEY)) ?? {}; } catch { /* private window or bad JSON: start empty */ }
  return { counts: saved.counts ?? {}, dates: saved.dates ?? [], genus: saved.genus in scout.THRESHOLDS ? saved.genus : null };
}
const sheet = loadSheet();
const DEMO_RUN = new URLSearchParams(location.search).has('demo');   // the recorded demo always uses the baked field
const store = (() => { try { return localStorage; } catch { return null; } })();   // null when site data is blocked
state.cur = null; state.log = null;   // the photo being logged, and what the farmer picked for it
state.finds = DEMO_RUN ? [] : finds.loadFinds(store);   // saved finds stay on this device
state.notes = DEMO_RUN ? [] : memory.loadNotes(store);   // field notes stay on this device too
const today = () => new Date().toLocaleDateString('en-CA');   // YYYY-MM-DD in local time

// The demo square has no light soil; for another field the farmer ticks the box.
const rankNow = () => fieldRanking(D.model, D.fieldRisk, { year: state.rankYear, forageYears: state.forage, lightSoil: state.own && state.light ? 1 : 0 });

function recordNow() {
  const r = rankNow();
  return scout.recordText({ date: today(), field: D.field, window: trapWindow(D.soil, D.risk.start_year), sheet, own: state.own && coordText(state.own),
    rank: r && { text: ui.RANK_TEXT[r.rank], year: r.year, n: D.model.metrics.n },
    photos: state.evidence.map(e => `${formatAnswer(e.decision)}, ${e.zoneLabel}`), finds: state.finds });
}

function renderCounts() {
  $('#count-result').innerHTML = ui.countResultHTML(scout.liftSummary(D.field.traps, sheet), D.field.trap_rules.min_traps);
  $('#record').textContent = recordNow();
}

function saveFile(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const FILES = {
  gpx: () => ['taupin-traps.gpx', scout.trapsGPX(D.field), 'application/gpx+xml'],
  csv: () => ['taupin-traps.csv', scout.trapsCSV(D.field, sheet), 'text/csv'],
  geojson: () => ['taupin-traps.geojson', scout.trapsGeoJSON(D.field, sheet), 'application/geo+json'],
  record: () => [`taupin-record-${today()}.txt`, recordNow(), 'text/plain'],
};

function zoneOf(cell) { return cell && scene.isPocket(cell.row, cell.col) ? 'pocket' : 'upland'; }

function renderModelStatus() {
  const m = state.model, el = $('#model-status');
  const text = { loading: 'Loading the photo check…', ready: 'Photo check ready', missing: 'Photo check not installed', error: 'Photo check failed to load' }[m.status];
  el.textContent = text; el.dataset.status = m.status;
  if (m.reason) el.title = m.reason;
  $('#model-metrics').innerHTML = m.status !== 'ready' ? ''
    : D?.metrics ? ui.metricsHTML(D.metrics) : 'No model/metrics.json next to the model, so no accuracy is shown.';
}

// The soil map units under this parcel (Dorval clay loam and muck) are neither sand
// nor sandy loam, so the model's light-soil input is 0 everywhere here.
const LIGHT_SOIL_NOTE = 'Soil map units in this parcel are clay loam and muck, so the sand or sandy loam input is no everywhere and the rank is the same across the parcel.';

const OWN_SOIL_NOTE = 'The app has no soil map for this place: tick the box if the field is sand or sandy loam.';
// A built field in the United States brings its surface soil from USDA SSURGO (soil.js).
const soilNote = () => {
  const s = D.fieldId === MINE ? loadBuilt()?.soilAt : null;
  return s ? `Soil under the tapped point (USDA SSURGO): ${s.texture.toLowerCase()} (${s.name}), organic matter ${s.om ?? '?'} %, sand ${s.sand ?? '?'} %, clay ${s.clay ?? '?'} %. The box is preset from it; change it if your field differs.` : OWN_SOIL_NOTE;
};
const OWN_KEY = 'taupin-own', FIELD_KEY = 'taupin-field';   // FIELD_KEY: the last field picked here
// BUILT_KEY: the field the farmer built by tapping the map (build.js), kept on this device.
const BUILT_KEY = 'taupin-built', MINE = 'mine';
function loadBuilt() { try { const r = JSON.parse(localStorage.getItem(BUILT_KEY)); return r?.field ? r : null; } catch { return null; } }

// A baked field near the typed position: say so, with a link that opens it.
function nearHint(site) {
  const n = site && nearest(D.fields, site);
  if (!n || n.field.id === D.fieldId) return '';
  return ` A baked 3D field, ${n.field.name}, is ${n.km.toFixed(1)} km away: open it with the Quebec fields buttons above.`;
}

// Swap the baked dates and ranking inputs for another field's (or back, with null) and redraw.
function useField(own, note = '') {
  state.own = own && own.site;
  D.soil = own ? own.soil : D.demo.soil; D.fieldRisk = own ? own.fr : D.demo.fieldRisk;
  D.weather = own?.weather ?? D.demo.weather;
  const years = Object.keys(D.fieldRisk.per_year).sort();
  state.rankYear = years[years.length - 1];
  $('#rank-year').innerHTML = years.map(y => `<option${y === state.rankYear ? ' selected' : ''}>${ui.esc(y)}</option>`).join('');
  $('#rank-light-wrap').hidden = !own;
  $('#own-reset').hidden = !own || !!D.fieldId;   // a baked field leaves by the field buttons
  $('#own-status').textContent = note || (own
    ? `Showing ${coordText(own.site)}, fetched ${own.fetched}. NASA POWER is modelled on a grid of about 50 km, so neighbouring fields get the same values. `
      + (own.soil.always_warm ? 'The soil here is already at 12 °C on 1 March, so the date rule, written for Quebec springs, says nothing useful. ' : '')
      + (own.weather ? 'The rotation water columns use this field\'s GPM IMERG rain. ' : 'NASA POWER sent no IMERG rain, so the rotation water columns are the demo field\'s. ')
      + (D.fieldId ? `The 3D field and trap points are ${D.field.site.name}, ${D.field.site.built ? 'built on this device from lidar and crop maps' : 'baked from lidar, satellite and crop maps'}.` : 'The 3D field, the trap points and the pest levels are still the demo square.')
      + nearHint(own.site)
    : `Showing ${D.fieldId ? '' : 'the demo field, '}${D.field.site.name}.`);
  renderPanel(); renderRank();
}

// Water climatology per weather series; recomputed only when the field changes.
const climCache = new WeakMap();
function climNow() {
  if (!D.weather) return null;
  if (!climCache.has(D.weather)) {
    const lat = D.weather.site?.lat ?? D.field.site.lat, c = climatology(D.weather, D.crops.crops, lat, D.crops.heavy_rain_mm);
    // Rotation year i is start_year + i, so its water columns use that year's projection.
    const proj = projectClimate(D.weather, D.crops.crops, lat, D.risk.start_year, 5, D.crops.heavy_rain_mm);
    climCache.set(D.weather, { ...c, byYear: proj.crops, proj });
  }
  return climCache.get(D.weather);
}

function renderSoilWater(view) {
  const clim = climNow(), o = state.sw, ids = view.rows.map(r => r.rotation);
  const byId = Object.fromEntries(view.rows.map(r => [r.rotation, rotationMetrics(D.risk.rotations[r.rotation], clim ?? { crops: {} }, D.crops, r, o.tillage)]));
  const rots = ids.map(id => ({ id, metrics: byId[id] })), fx = memory.noteEffects(state.notes);
  const ranked = rank(rots, o.chosen, fx.weights);
  const names = Object.fromEntries(ids.map(id => [id, ROTATION_NAMES[id] ?? id]));
  // What the notes did: score and rank of each rotation with and without the note weights.
  const impact = fx.weights.soil ? memory.notesImpact(rots, o.chosen, fx.weights) : [];
  $('#sw-notes').innerHTML = memoryui.impactHTML({ fx, chosen: o.chosen, impact, names, cover: Object.fromEntries(ids.map(id => [id, byId[id].total.c])) });
  $('#sw-table').innerHTML = sw.tableHTML(ranked, byId, names, o.current, impact.length && o.chosen.includes('soil') ? Object.fromEntries(impact.map(r => [r.id, r])) : null);
  $('#sw-cards').innerHTML = sw.cardsHTML(ranked, byId, { names, texts: D.rotations.rotations, current: o.current, cropData: D.crops, sequences: D.risk.rotations, chosen: o.chosen });
  $('#sw-how').innerHTML = sw.climateHTML(clim, D.crops, D.weather, state.own ? coordText(state.own) : D.field.site.name);
}

async function loadOwn(site) {
  if (!site) { $('#own-status').textContent = 'Enter a latitude from -90 to 90 and a longitude from -180 to 180, as decimal degrees (west is negative).'; return; }
  $('#own-lat').value = site.lat; $('#own-lon').value = site.lon;
  $('#own-status').textContent = 'Asking NASA POWER…';
  try {
    const own = { ...await fetchField(site, D.demo), fetched: today() };
    try { localStorage.setItem(OWN_KEY, JSON.stringify(own)); } catch { /* storage blocked: the field lasts for this visit */ }
    useField(own);
  } catch (e) {
    $('#own-status').textContent = `No dates for ${coordText(site)}: ${e instanceof TypeError ? 'NASA POWER could not be reached' : e.message}. The page still shows ${state.own ? coordText(state.own) : D.fieldId ? `${D.field.site.name} with the demo park's NASA dates` : 'the demo field'}.`;
  }
}

// ---- Pick a field on the map and build it here (picker.js, build.js)
let pickSite = null;
async function openFieldMap() {
  const c = state.own ?? D.field.site;
  $('#pick-status').textContent = 'Loading the map…';
  try {
    await openPicker($('#pick'), { center: { lat: c.lat, lon: c.lon, zoom: 15 }, onPick: s => {
      pickSite = s; $('#pick-build').disabled = false;
      $('#pick-status').textContent = `Picked ${coordText(s)}. Build the 3D field here: about 2 MB to download once, then it stays on this device.`;
    } });
    $('#pick-open').hidden = true;
    if (!pickSite) $('#pick-status').textContent = 'Tap inside your field.';
  } catch (e) { $('#pick-status').textContent = `The map could not load (${e.message}). Type the coordinates below instead.`; }
}

async function buildHere() {
  if (!pickSite) return;
  const btn = $('#pick-build'), st = $('#pick-status');
  btn.disabled = true;
  try {
    const b = await buildField(pickSite, { rotations: D.risk.rotations, startYear: D.risk.start_year, onStep: s => { st.textContent = s; } });
    st.textContent = 'Looking up the soil (USDA, United States only)…';
    const rec = { field: packField(b.field), history: b.history, built: today(), download: b.download, soilAt: await soilAt(pickSite.lat, pickSite.lon) };
    try { localStorage.setItem(BUILT_KEY, JSON.stringify(rec)); localStorage.setItem(FIELD_KEY, MINE); } catch {
      st.textContent = 'This browser blocks site storage, so the field cannot be kept. Allow site data for this page and build again.';
      btn.disabled = false; return;
    }
    st.textContent = `Built: ${b.field.open.area_ha} ha to scout, ${b.field.traps.length} traps. Opening your field…`;
    const q = new URLSearchParams(location.search); q.set('field', MINE); location.search = q.toString();
  } catch (e) {
    console.error(e);
    st.textContent = `Could not build a field here: ${/fetch|network/i.test(e.message) ? 'a data service could not be reached; try again with a network' : e.message}.`;
    btn.disabled = false;
  }
}

function renderRank() {
  const r = rankNow();
  $('#h-rank').textContent = r ? `Which fields to trap first: ${ui.RANK_TEXT[r.rank].toLowerCase()} third for ${r.year}` : 'Which fields to trap first';
  $('#rank').innerHTML = ui.fieldRankHTML(r, D.model, { lightSoilNote: state.own ? soilNote() : LIGHT_SOIL_NOTE });
  $('#record').textContent = recordNow();
}

function renderPanel() {
  const view = riskView(D.risk, state.zone, state.evidence);
  $('#zone-upland').setAttribute('aria-pressed', state.zone === 'upland');
  $('#zone-pocket').setAttribute('aria-pressed', state.zone === 'pocket');
  $('#risk-summary').innerHTML = ui.riskSummaryHTML(view);
  $('#risk-table').innerHTML = ui.riskTableHTML(view, state.sel);
  $('#trace').innerHTML = ui.traceHTML(view, state.sel);
  renderSoilWater(view);
  const tw = trapWindow(D.soil, D.risk.start_year), next = tw.fc.trap_12C?.rows[0];
  $('#h-trap').textContent = next ? `2. Trap week ${next.year}: set bait traps around ${next.date}` : `2. Trap week: set bait traps around ${tw.mean12}`;
  $('#trap-lede').textContent = `The week the top 10 cm of soil reaches 12 °C${next ? `, likely between ${next.lo} and ${next.hi}` : ''}. Forecast from NASA POWER, ${tw.span[0]}-${tw.span[1]}${state.own ? ` at ${coordText(state.own)}` : ''}.`;
  tw.plan = trapPlan(next);
  $('#trap').innerHTML = ui.trapHTML(tw, D.soil, state.evidence);
  $('#evidence').innerHTML = ui.evidenceHTML(state.evidence);
  $('#result').innerHTML = ui.resultHTML(state.current);
  $('#record').textContent = recordNow();
  document.body.classList.toggle('has-ww', view.ww);
  renderMemory();
}

async function pixelsOf(blob) {
  // from-image applies the EXIF orientation, matching ImageOps.exif_transpose in taupin classify.
  const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext('2d');
  g.drawImage(bmp, 0, 0);
  const data = g.getImageData(0, 0, bmp.width, bmp.height).data;
  const t = document.createElement('canvas'), s = 256, k = s / Math.min(bmp.width, bmp.height);
  t.width = t.height = s;
  t.getContext('2d').drawImage(bmp, (s - bmp.width * k) / 2, (s - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  return { data, w: bmp.width, h: bmp.height, thumb: t.toDataURL('image/jpeg', 0.85) };
}

// SCENE CLASSIFIER CALL SITE (the only one). web/js/sceneclass.js and data/scene_head.json are optional:
// when both load and the photo model has its `embedding` output, the head names the scene (insect,
// standing water, ground cover, water channel or other) and memory.suggestKind turns it into a
// pre-selected button. Otherwise, or on any error, the buttons stay manual.
let sceneHead;
async function sceneAnswer(px) {
  try {
    const sc = await import('./sceneclass.js'), { ort, session, labels } = state.model, n = labels.input_size;
    if (!session.outputNames.includes('embedding')) return null;
    sceneHead ??= await sc.loadSceneHead();
    const x = new ort.Tensor('float32', preprocess(px.data, px.w, px.h, labels), [1, 3, n, n]);
    const r = sc.classifyScene(sceneHead, (await session.run({ [session.inputNames[0]]: x })).embedding.data);
    return r.unclear ? null : r.kind;
  } catch { return null; }
}

// Classify a photo, pin it on the field and offer the log panel. An insect answer joins the pest
// evidence; an unclear one is pinned but not counted.
export async function ingest(blob, name, cell = null, { dropMs = 700 } = {}) {
  if (state.model.status !== 'ready') { state.current = { kind: state.model.status === 'loading' ? 'loading' : 'missing', name }; renderPanel(); return null; }
  state.current = { kind: 'loading', name }; state.cur = state.log = null; rebuildPins(); renderPanel();
  try {
    const px = await pixelsOf(blob);
    const decision = await classifyPixels(state.model, px.data, px.w, px.h);
    const effect = effectFor(decision);
    // The photo's own GPS puts the pin there when it falls inside the square; otherwise the centre.
    const gps = DEMO_RUN ? null : finds.exifGPS(await blob.arrayBuffer());
    const where = cell ?? (gps && finds.cellOf(D.field, gps.lat, gps.lon)) ?? { row: Math.floor(scene.size / 2), col: Math.floor(scene.size / 2) };
    const entry = { decision, effect, thumb: px.thumb, cell: where, name, gps, moved: false };
    state.current = { kind: 'result', decision, effect, thumb: px.thumb, abstain: Number(state.model.labels.abstain_below ?? 0) };
    entry.pin = scene.addPin({ row: where.row, col: where.col, thumb: px.thumb, color: PIN[effect.kind], drop: dropMs ? 0 : 1 });
    if (dropMs) animateDrop(entry.pin, dropMs);
    if (!decision.unclear) state.evidence.push(entry);
    state.cur = entry; place(entry, where); mn.stop();   // the map clicks now place this photo's pin
    const kind = memory.suggestKind(decision, await sceneAnswer(px));
    state.log = { kind, cover: null, suggested: !!kind };
    renderPanel();
    return entry;
  } catch (e) {
    state.current = { kind: 'error', message: e.message }; renderPanel();
    return null;
  }
}

function animateDrop(pin, ms) {
  const t0 = performance.now();
  const step = now => { const k = (now - t0) / ms; scene.setDrop(pin, k); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

function place(entry, cell) {
  entry.cell = cell;
  entry.zone = zoneOf(cell);
  entry.zoneLabel = entry.zone === 'pocket' ? 'low wet pocket' : 'upland';
  state.zone = entry.zone;
  Object.assign(state.current, { cell, zoneLabel: entry.zoneLabel });
}

function rebuildPins() {
  scene.clearPins();
  const pin = (id, o) => scene.addPin({ ...o, id, selected: mn.sel === id });
  for (const f of finds.splitFinds(D.field, state.finds).inside)
    pin(`find:${f.i}`, { row: f.cell.row, col: f.cell.col, color: f.answered_or_unclear === 'unclear' ? PIN.unclear : PIN.wireworm });
  state.notes.forEach((n, i) => pin(`note:${i}`, { row: n.row, col: n.col, color: memory.noteLook(n).color }));
  const shown = state.cur && !state.evidence.includes(state.cur) ? [...state.evidence, state.cur] : state.evidence;
  for (const e of shown) e.pin = scene.addPin({ row: e.cell.row, col: e.cell.col, thumb: e.thumb, color: PIN[e.effect.kind] });
}

const photoPending = () => !!(state.cur && state.current.kind === 'result');
const zoneOfFind = f => { const c = finds.cellOf(D.field, f.lat, f.lon); return c ? (zoneOf(c) === 'pocket' ? 'low wet pocket' : 'upland') : 'outside the demo square'; };
const itemsNow = () => memory.memoryItems({ notes: state.notes, finds: state.finds, weather: D.weather, smap: D.smap, zoneOfFind });

// One list: notes and insect finds together, newest first, with the log panel above it while a photo waits.
function renderMemory() {
  const e = state.cur, gpsIn = e?.gps && finds.cellOf(D.field, e.gps.lat, e.gps.lon);
  const position = !e ? '' : e.moved ? 'Position: the pin you placed. Click the field to move it.'
    : gpsIn ? 'Position: the photo\'s GPS, shown by the pin. Click the field to move the pin.'
      : `Position: the pin on the field${e.gps ? ' (the photo\'s GPS is outside the demo square)' : ''}. Click the field to move it.`;
  $('#log').innerHTML = e && state.log && photoPending() && !DEMO_RUN ? memoryui.logHTML({ log: state.log, position }) : '';
  $('#memory').innerHTML = memoryui.memoryHTML({ items: itemsNow(), notes: state.notes.length, finds: state.finds.length });
  mn.render();
  scene.setMarks(memory.noteMarks(state.notes, D.field.parcel.res_m));
  $('#record').textContent = recordNow();
}

// The photo is logged: it leaves the log panel and its pin is rebuilt from what was saved.
function logDone() {
  state.cur = state.log = null; state.current = { kind: 'idle' };
  rebuildPins(); renderPanel();
}

function onLogClick(act) {
  const [what, v] = act.split(':');
  if (what === 'kind') state.log = { ...state.log, kind: v, suggested: false };
  else if (what === 'cover') state.log.cover = v;
  else if (what === 'save') return logPhoto();
  renderMemory();
  document.querySelector(`#log [data-log="${act}"]`)?.focus();
}

function logPhoto() {
  const e = state.cur, { kind, cover } = state.log ?? {};
  if (!e || !kind) return;
  if (kind === 'insect') {
    const gps = !e.moved && e.gps;   // a pin the farmer moved overrides the photo's GPS
    saveFind(gps ? { ...gps, accuracy_m: null, source: 'photo' } : { ...finds.latLonOf(D.field, e.cell), accuracy_m: null, source: 'pin' });
    return;
  }
  const note = memory.makeNote(kind, e.cell, kind === 'water' ? 'pocket' : e.zone, memory.weekContext(D.weather, D.smap, new Date()), { pos: e.moved ? null : e.gps, cover });
  if (!note) return;
  // The photo is a field note now, not an animal: take it out of the pest evidence.
  const i = state.evidence.indexOf(e);
  if (i >= 0) state.evidence.splice(i, 1);
  state.notes.push(note);
  const kept = memory.saveNotes(store, state.notes);
  if (kind === 'water') state.zone = 'pocket';
  logDone();
  findStatus(`${kept ? 'Logged on this device' : 'Kept for this visit only: this browser blocks storage'}: ${memory.noteLabel(note).toLowerCase()}, ${note.zone === 'pocket' ? 'low wet pocket' : 'upland'}. It is on the field and in the field memory below.`);
}

// Takes one note or find out of the state and the device. Deleting the last standing-water note
// puts the pest table back on upland, since the wet pocket was only open because of that note.
function removeEntry(type, i) {
  if (type === 'note') {
    const [gone] = state.notes.splice(i, 1); memory.saveNotes(store, state.notes);
    if (gone?.kind === 'water' && !memory.noteEffects(state.notes).wet && state.zone === 'pocket') state.zone = 'upland';
  } else { state.finds.splice(i, 1); finds.saveFinds(store, state.finds); }
}

function onDelete(what) {
  if (what === 'all') {
    if (!confirm(`Delete all ${state.notes.length + state.finds.length} entries from this device?`)) return;
    state.notes = []; state.finds = []; memory.saveNotes(store, state.notes); finds.clearFinds(store);
    if (state.zone === 'pocket') state.zone = 'upland';
  } else { const [type, i] = what.split(':'); removeEntry(type, Number(i)); }
  mn.deselect(); rebuildPins(); renderPanel(); findStatus('Deleted from this device.');
}
const findStatus = t => { $('#find-status').textContent = t; };

function saveFind(pos) {
  const f = finds.makeFind(pos, state.cur.decision, { count: $('#find-count')?.value });
  if (!f) { findStatus('No position to save.'); return; }
  state.finds.push(f);
  const kept = finds.saveFinds(store, state.finds);
  if (!state.own) { $('#own-lat').value = finds.latestSite(state.finds).lat; $('#own-lon').value = finds.latestSite(state.finds).lon; }
  logDone();
  findStatus(`${kept ? 'Saved on this device' : 'Kept for this visit only: this browser blocks storage'}: ${scout.findLine(f)}. `
    + (finds.cellOf(D.field, f.lat, f.lon) ? 'It is pinned on the field.' : 'It is outside the demo square, so it is listed below.')
    + (state.own ? '' : ' Its position is filled in under step 1 for the NASA dates.'));
}

async function onFindClick(kind) {
  if (kind === 'device') {
    if (!navigator.geolocation) { findStatus('This browser gives no position.'); return; }
    findStatus('Reading the position…');
    navigator.geolocation.getCurrentPosition(
      p => saveFind({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy_m: p.coords.accuracy, source: 'device' }),
      () => findStatus('The position was refused or not available. Nothing was saved.'), { enableHighAccuracy: true, timeout: 20000 });
  } else if (kind === 'photo') {
    const gps = state.cur?.gps;
    if (gps) saveFind({ ...gps, accuracy_m: null, source: 'photo' }); else findStatus('This photo has no GPS position. Nothing was saved.');
  } else if (kind === 'csv') saveFile('taupin-finds.csv', finds.findsCSV(state.finds), 'text/csv');
  else if (kind === 'geojson') saveFile('taupin-finds.geojson', finds.findsGeoJSON(state.finds), 'application/geo+json');
}

function bind() {
  const drop = $('#drop'), file = $('#file');
  file.addEventListener('change', () => { const f = file.files[0]; if (f) ingest(f, f.name); file.value = ''; });
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('over');
    const f = [...e.dataTransfer.files].find(x => x.type.startsWith('image/'));
    if (f) ingest(f, f.name);
  });
  $('#gallery').addEventListener('click', async e => {
    const b = e.target.closest('[data-g]'); if (!b) return;
    const it = D.gallery[Number(b.dataset.g)];
    ingest(await (await fetch(it.file)).blob(), it.caption);
    $('#identify').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  });
  $('#risk-table').addEventListener('click', e => {
    const b = e.target.closest('[data-rot]'); if (!b) return;
    const s = { rotation: b.dataset.rot, i: Number(b.dataset.i) };
    state.sel = state.sel && state.sel.rotation === s.rotation && state.sel.i === s.i ? null : s;
    renderPanel();
  });
  $('#evidence').addEventListener('click', e => {
    const b = e.target.closest('[data-remove]'); if (!b) return;
    const [gone] = state.evidence.splice(Number(b.dataset.remove), 1);
    if (gone === state.cur) state.cur = state.log = null;
    rebuildPins(); renderPanel();
  });
  $('#log').addEventListener('click', e => {
    const l = e.target.closest('[data-log]'), f = e.target.closest('[data-find]');
    if (l) onLogClick(l.dataset.log); else if (f) onFindClick(f.dataset.find);
  });
  $('#memory').addEventListener('click', e => {
    const d = e.target.closest('[data-del]'), f = e.target.closest('[data-find]');
    if (d) onDelete(d.dataset.del); else if (f) onFindClick(f.dataset.find);
  });
  $('#rank-year').addEventListener('change', e => { state.rankYear = e.target.value; renderRank(); });
  $('#rank-light').addEventListener('change', e => { state.light = e.target.checked; renderRank(); });
  $('#own').addEventListener('submit', e => { e.preventDefault(); loadOwn(parseCoords($('#own-lat').value, $('#own-lon').value)); });
  $('#own-reset').addEventListener('click', () => { try { localStorage.removeItem(OWN_KEY); } catch { /* nothing stored */ } useField(null); });
  $('#fields').addEventListener('click', e => {
    const b = e.target.closest('button[data-field]');
    if (!b) return;
    const q = new URLSearchParams(location.search);
    q.set('field', b.dataset.field);
    try { localStorage.setItem(FIELD_KEY, b.dataset.field); } catch { /* storage blocked: the URL still carries it */ }
    location.search = q.toString();
  });
  $('#pick-open').addEventListener('click', openFieldMap);
  $('#pick-build').addEventListener('click', buildHere);
  $('#pick-close').addEventListener('click', () => { $('#pick').hidden = true; $('#pick-open').hidden = false; });
  $('#pick-here').addEventListener('click', () => {
    if (!navigator.geolocation) { $('#pick-status').textContent = 'This browser gives no position. Zoom the map by hand.'; return; }
    $('#pick-status').textContent = 'Asking this device for its position…';
    navigator.geolocation.getCurrentPosition(p => { centerPicker($('#pick'), { lat: p.coords.latitude, lon: p.coords.longitude }, 16); $('#pick-status').textContent = 'Tap inside your field.'; },
      () => { $('#pick-status').textContent = 'No position from this device. Zoom the map by hand.'; }, { enableHighAccuracy: true, timeout: 15000 });
  });
  $('#regions').addEventListener('click', e => { const b = e.target.closest('button[data-lat]'); if (b) loadOwn(parseCoords(b.dataset.lat, b.dataset.lon)); });
  $('#own-here').addEventListener('click', () => {
    if (!navigator.geolocation) { $('#own-status').textContent = 'This browser gives no position. Type the coordinates.'; return; }
    navigator.geolocation.getCurrentPosition(p => loadOwn(parseCoords(p.coords.latitude.toFixed(4), p.coords.longitude.toFixed(4))),
      () => { $('#own-status').textContent = 'The position was refused or not available. Type the coordinates.'; });
  });
  $('#rank-forage').addEventListener('input', e => {
    const v = Number(e.target.value);
    state.forage = Number.isFinite(v) ? Math.min(20, Math.max(0, v)) : 0; renderRank();
  });
  for (const z of ['upland', 'pocket']) $(`#zone-${z}`).addEventListener('click', () => { state.zone = z; renderPanel(); });
  $('#sec-traps').addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.trap) (sheet.counts[t.dataset.trap] ??= [])[Number(t.dataset.lift)] = t.value;
    else if (t.dataset.date) sheet.dates[Number(t.dataset.date)] = t.value;
    else if (t.id === 'count-genus') sheet.genus = t.value;
    else return;
    try { localStorage.setItem(SHEET_KEY, JSON.stringify(sheet)); } catch { /* storage blocked: the sheet still works for this visit */ }
    renderCounts();
  });
  $('#sec-traps').addEventListener('click', e => {
    const f = e.target.closest('[data-file]');
    if (f) saveFile(...FILES[f.dataset.file]());
  });
  $('#record-copy').addEventListener('click', async e => {
    try { await navigator.clipboard.writeText(recordNow()); e.target.textContent = 'Copied'; }
    catch { getSelection().selectAllChildren($('#record')); }   // clipboard refused: leave the text selected
  });
  $('#sw-controls').addEventListener('change', () => {
    state.sw.chosen = [...document.querySelectorAll('#sw-controls [name=pri]:checked')].map(i => i.value);
    state.sw.current = $('#sw-current').value; state.sw.tillage = $('#sw-tillage').value;
    renderPanel();
  });
  $('#show-pocket').addEventListener('change', e => scene.setPocket(e.target.checked));
  $('#layer').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) showLayer(b.dataset.view); });
  $('#mapnote').addEventListener('click', e => mn.onClick(e));
  scene.onPinPick(id => mn.onPin(id));
  scene.onPick((row, col) => {
    if (mn.onPick(row, col)) return;
    if (!photoPending()) { mn.deselect(); return; }
    state.cur.moved = true;
    place(state.cur, { row, col }); rebuildPins(); renderPanel();
  });
}

// Drape one layer and show its legend; the terrain view lists the lidar height.
function showLayer(key) {
  const v = D.views.find(x => x.key === key);
  scene.setLayer(key);
  for (const b of document.querySelectorAll('#layer [data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === key));
  $('#legend').innerHTML = ui.layerLegendHTML(D.field.layers.find(l => l.key === v.layer));
}

async function main() {
  const baked = await getJSON('data/fields/index.json').catch(() => []), built = DEMO_RUN ? null : loadBuilt();
  const fields = built ? [{ id: MINE, name: `My field (${built.field.site.lat.toFixed(3)}, ${built.field.site.lon.toFixed(3)})`, lat: built.field.site.lat, lon: built.field.site.lon }, ...baked] : baked;
  // A field fetched earlier comes back from this device's storage, so it also opens with no network.
  let own = null, lastPick = null;
  if (!DEMO_RUN) try { own = JSON.parse(localStorage.getItem(OWN_KEY)); lastPick = localStorage.getItem(FIELD_KEY); } catch { /* blocked or bad JSON */ }
  const fieldId = DEMO_RUN ? null : startField(fields, location.search, { last: lastPick, site: own?.site });
  const base = fieldId === MINE ? '' : fieldId ? `data/fields/${fieldId}/` : 'data/';
  const [field, parkRisk, soil, gallery, model, fieldRisk, crops, rotations, weather, smap] = await Promise.all([
    fieldId === MINE ? unpackField(built.field) : getJSON(`${base}field.json`),
    ...['data/risk.json', 'data/soil.json', 'data/gallery.json', 'data/risk_model.json', 'data/field_risk.json', 'data/crops.json', 'data/rotations.json', 'data/weather.json', 'data/smap.json'].map(getJSON)]);
  // A built field's pest table comes from its own crop history (engine.js, the rules of engine.py);
  // the park's table assumes three years of sod.
  const risk = fieldId === MINE && built.history ? riskMatrix({ rotations: parkRisk.rotations, sources: parkRisk.sources, startYear: parkRisk.start_year, history: built.history }) : parkRisk;
  const views = VIEWS.filter(v => field.layers.some(l => l.key === v.layer));   // the park has no crop map
  D = { field, risk, soil, gallery: gallery.items, metrics: null, model, fieldRisk, crops, rotations, weather, smap, demo: { soil, fieldRisk, weather }, fields, fieldId, views };
  state.sw.current = rotations.default_current in risk.rotations ? rotations.default_current : Object.keys(risk.rotations)[0];
  // A baked field brings its crop history: the rotation it follows and its grass/forage years.
  if (field.crops?.rotation in risk.rotations) state.sw.current = field.crops.rotation;
  if (field.crops) { state.forage = field.crops.forage_years_last5; $('#rank-forage').value = state.forage; }
  if (fieldId === MINE && built.soilAt) { state.light = built.soilAt.light; $('#rank-light').checked = state.light; }
  $('#fields').innerHTML = [...fields, { id: 'demo', name: 'Demo park (Bois-de-Liesse)' }].map(f =>
    `<button type="button" class="seg" data-field="${ui.esc(f.id)}" aria-pressed="${f.id === (fieldId ?? 'demo')}">${ui.esc(f.name)}</button>`).join('');
  $('#crop-hist').innerHTML = ui.cropHistHTML(field.crops, ROTATION_NAMES);
  $('#sw-controls').innerHTML = sw.controlsHTML({ names: Object.fromEntries(Object.keys(risk.rotations).map(id => [id, ROTATION_NAMES[id] ?? id])), ...state.sw });
  $('#smap').innerHTML = sw.smapHTML(smap, weather);
  scene = createScene($('#field'), field, base);
  mn = createMapNotes({ el: $('#mapnote'), state, scene, data: () => D, zoneOf, store, items: itemsNow, remove: removeEntry,
    refresh: () => { rebuildPins(); renderPanel(); }, status: findStatus, photoPending });
  $('#layer').innerHTML = views.map(v => `<button type="button" class="seg" data-view="${ui.esc(v.key)}" aria-pressed="${v.key === 'terrain'}">${ui.esc(v.label)}</button>`).join('');
  showLayer('terrain');
  sheet.genus ??= risk.zones.upland.dominant_genus;
  $('#traps').innerHTML = ui.trapsHTML(field, sheet);
  const side = field.parcel.size * field.parcel.res_m;
  $('#site').textContent = `${field.site.name}: a ${side} m square at ${field.site.lat} N, ${Math.abs(field.site.lon)} W`
    + (field.open ? `, with ${field.open.area_ha} ha of open ground where traps can go` : '');
  $('#field-src').innerHTML = Object.values(field.sources).map(s => `<li>${ui.esc(s)}</li>`).join('');
  $('#gallery').innerHTML = ui.galleryHTML(D.gallery, null);
  bind();
  const last = finds.latestSite(state.finds), def = own?.site ?? last;   // the latest find is the default field position
  if (def) { $('#own-lat').value = def.lat; $('#own-lon').value = def.lon; }
  if (state.finds.length || state.notes.length) scene.ready.then(rebuildPins);
  if (memory.noteEffects(state.notes).wet) state.zone = 'pocket';   // a standing-water note opens the wet-ground pest table
  // A baked field opens with NASA POWER at its own position, unless this device already has a nearby fetch.
  if (fieldId && !DEMO_RUN && !(own?.site && km(own.site, field.site) < 1)) { useField(null); loadOwn({ lat: field.site.lat, lon: field.site.lon }); }
  else useField(own?.soil && own?.fr ? own : null);
  renderCounts();
  renderModelStatus();
  // Absolute: ort resolves wasmPaths against its own module URL, not the page.
  state.model = await loadModel({ ort, wasmPaths: new URL('vendor/ort/', document.baseURI).href });
  if (state.model.status === 'ready') {
    D.metrics = await fetch('model/metrics.json').then(r => (r.ok ? r.json() : null)).catch(() => null);
    $('#gallery').innerHTML = ui.galleryHTML(D.gallery, state.model.labels);
  }
  if (state.current.kind === 'loading' || state.current.kind === 'missing') state.current = { kind: state.model.status === 'ready' ? 'idle' : 'missing' };
  else if (state.model.status !== 'ready') state.current = { kind: 'missing' };
  renderModelStatus();
  renderPanel();
  if (DEMO_RUN) (await import('./demo.js')).runDemo({ scene, state, D, ingest, renderPanel });
  else window.taupinReady = true;
}

// Theme: follows the system until the button is used, then remembers the choice.
function setTheme(t) { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
setTheme(localStorage.getItem('taupin-theme'));
$('#theme').addEventListener('click', () => {
  const dark = (document.documentElement.dataset.theme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  const t = dark ? 'light' : 'dark'; setTheme(t); localStorage.setItem('taupin-theme', t);
});

if ('serviceWorker' in navigator && !new URLSearchParams(location.search).has('nosw')) navigator.serviceWorker.register('sw.js').catch(() => {});
main().catch(e => { $('#fatal').hidden = false; $('#fatal').textContent = `Could not start: ${e.message}`; });
