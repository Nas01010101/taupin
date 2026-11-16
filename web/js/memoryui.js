// HTML for the photo log, the field memory list and "what your notes changed". Pure functions of
// their arguments; every file-, model- or user-derived string goes through esc().
import { esc } from './ui.js';
import { COVER_LEVELS, KIND_LABELS, NOTE_KINDS, effectText } from './memory.js';

const pressed = on => ` aria-pressed="${on ? 'true' : 'false'}"`;

// One panel under the photo's answer: what it shows, then a single button. `log` = { kind, cover,
// suggested }; `position` is the sentence saying where it will go.
export function logHTML({ log, position }) {
  const kinds = Object.entries(KIND_LABELS).map(([k, label]) =>
    `<button type="button" class="seg" data-log="kind:${esc(k)}"${pressed(log.kind === k)}>${esc(label)}</button>`).join('');
  const hint = log.suggested && log.kind
    ? `<p class="small muted">Suggested by the photo check: ${esc(KIND_LABELS[log.kind])}. Change it if it is wrong.</p>` : '';
  const levels = log.kind === 'cover'
    ? `<div class="zones" role="group" aria-label="Ground cover level">${Object.entries(COVER_LEVELS).map(([k, v]) =>
      `<button type="button" class="seg" data-log="cover:${esc(k)}"${pressed(log.cover === k)}>${esc(v.label)}: ${esc(v.hint)}</button>`).join('')}</div>` : '';
  const count = log.kind === 'insect'
    ? '<p><label class="small">How many with it (optional) <input id="find-count" type="number" min="0" max="999" step="1" inputmode="numeric"></label></p>' : '';
  const other = log.kind === 'insect'
    ? '<details class="more"><summary>Use a GPS position instead of the pin</summary><div class="own-btn">'
      + '<button type="button" class="ghost" data-find="device">Save where I am now</button>'
      + '<button type="button" class="ghost" data-find="photo">Use the photo\'s GPS</button></div></details>' : '';
  const ready = log.kind && (log.kind !== 'cover' || log.cover);
  return `<div class="log"><h3>Log this photo</h3><p class="small">What does it show?</p>`
    + `<div class="zones" role="group" aria-label="What the photo shows">${kinds}</div>${hint}${levels}${count}`
    + (log.kind ? `<p class="small">${esc(effectText(log.kind, log.cover))}</p>` : '')
    + (log.kind && log.kind !== 'insect' ? '<p class="small muted">The animal answer above is not counted as pest evidence for this note.</p>' : '')
    + `<p class="small muted">${esc(position)}</p>`
    + `<button type="button" class="act" data-log="save"${ready ? '' : ' disabled'}>Log it on the field</button>${other}</div>`;
}

const day = iso => String(iso).slice(0, 10);

// The field memory: notes and insect finds in one list, newest first (items from memoryItems()).
export function memoryHTML({ items, notes, finds }) {
  if (!items.length) return '';
  const s = n => (n === 1 ? '' : 's');
  return `<h3>Field memory</h3><p class="small">${esc(items.length)} entr${items.length === 1 ? 'y' : 'ies'} saved on this device: `
    + `${esc(notes)} photo note${s(notes)} and ${esc(finds)} insect find${s(finds)}. Each has its date and place, and the NASA rain and soil moisture of its week where the data has them.</p>`
    + `<ul class="mem small">${items.map(it => `<li><div><strong>${esc(day(it.time))}</strong>, ${esc(it.what)}, ${esc(it.zone)}`
      + `${it.ctx ? `<br><span class="muted">${esc(it.ctx)}</span>` : ''}</div>`
      + `<button type="button" class="ghost" data-del="${esc(it.type)}:${esc(it.idx)}" aria-label="Delete ${esc(it.what)} of ${esc(day(it.time))}">Delete</button></li>`).join('')}</ul>`
    + '<div class="files">' + (finds ? '<button type="button" class="ghost" data-find="csv">Export finds (CSV)</button>'
      + '<button type="button" class="ghost" data-find="geojson">Export finds (GeoJSON)</button>' : '')
    + '<button type="button" class="ghost" data-del="all">Delete everything</button></div>';
}

export function mapBarHTML(map) {
  const on = map.mode === 'add';
  const kinds = Object.entries(NOTE_KINDS).map(([k, v]) =>
    `<button type="button" class="seg" data-map="kind:${esc(k)}"${pressed(map.kind === k)}>${esc(v.label)}</button>`).join('');
  const levels = map.kind === 'cover'
    ? `<div class="zones" role="group" aria-label="Ground cover level">${Object.entries(COVER_LEVELS).map(([k, v]) =>
      `<button type="button" class="seg" data-map="cover:${esc(k)}"${pressed(map.cover === k)}>${esc(v.label)}: ${esc(v.hint)}</button>`).join('')}</div>` : '';
  return `<div class="map-add"><button type="button" class="act" data-map="toggle"${pressed(on)}>Add a note on the map</button>`
    + (on ? `<p class="small">Choose what to drop, then click the field. Each click adds one note at that spot.</p>`
      + `<div class="zones" role="group" aria-label="Kind of note">${kinds}</div>${levels}`
      + `<p class="small">${esc(effectText(map.kind, map.cover))}</p>`
      + '<p class="small muted">Soil insects are logged from a photo.</p>' : '') + '</div>';
}

// The selected pin: item = one memoryItems() entry, effect = effectText of a note ('' for a find).
export function pinDetailHTML({ item, effect, moving }) {
  return `<div class="pin-detail" role="group" aria-label="Selected pin"><h3>Selected pin</h3>`
    + `<p><strong>${esc(item.what)}</strong><br>${esc(day(item.time))}, ${esc(item.zone)}`
    + `${item.ctx ? `<br><span class="muted small">${esc(item.ctx)}</span>` : ''}</p>`
    + (effect ? `<p class="small">${esc(effect)}</p>` : '')
    + (moving ? '<p class="small">Click the field to place the pin there.</p>' : '')
    + `<div class="own-btn"><button type="button" class="ghost" data-pin="move"${pressed(moving)}>Move on the map</button>`
    + '<button type="button" class="ghost" data-pin="delete">Delete</button>'
    + '<button type="button" class="ghost" data-pin="close">Close</button></div></div>';
}
