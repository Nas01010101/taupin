// The map side of field memory: an "Add a note on the map" mode, selecting a pin to read its date,
// zone and NASA week, and moving or deleting it. Holds only the mode and the selection; notes and
// finds stay in the page state (ctx.state) and are saved through ctx.
import * as memory from './memory.js';
import * as finds from './finds.js';
import { mapBarHTML, pinDetailHTML } from './memoryui.js';

// ctx: { el, state, scene, data() -> { field, weather, smap }, zoneOf(cell), store, items() -> memoryItems,
//        remove(type, idx), refresh(), status(text), photoPending() }
export function createMapNotes(ctx) {
  const m = { mode: null, kind: 'cover', cover: null, sel: null };   // sel: 'note:3' | 'find:1'
  const item = () => ctx.items().find(it => `${it.type}:${it.idx}` === m.sel);
  const stored = () => { const [t, i] = (m.sel ?? ':').split(':'); return (t === 'note' ? ctx.state.notes : ctx.state.finds)[Number(i)]; };

  function render() {
    const it = m.sel && item(), moving = m.mode === 'move';
    if (m.sel && !it) m.sel = null;
    const n = it && it.type === 'note' ? stored() : null;
    ctx.el.innerHTML = mapBarHTML(m) + (it ? pinDetailHTML({ item: it, effect: n ? memory.effectText(n.kind, n.cover) : '', moving }) : '');
    ctx.scene.setPickMode(!!m.mode || ctx.photoPending());
  }

  function drop(row, col) {
    if (m.kind === 'cover' && !m.cover) { ctx.status('Choose the cover level, then click the field.'); return; }
    const cell = { row, col }, d = ctx.data();
    // Standing water counts as the low wet pocket wherever it is clicked, as for a photo note.
    const note = memory.makeNote(m.kind, cell, m.kind === 'water' ? 'pocket' : ctx.zoneOf(cell), memory.weekContext(d.weather, d.smap, new Date()), { cover: m.cover });
    if (!note) return;
    ctx.state.notes.push(note);
    const kept = memory.saveNotes(ctx.store, ctx.state.notes);
    if (m.kind === 'water') ctx.state.zone = 'pocket';
    m.sel = `note:${ctx.state.notes.length - 1}`;
    ctx.refresh();
    ctx.status(`${kept ? 'Added on this device' : 'Kept for this visit only: this browser blocks storage'}: ${memory.noteLabel(note).toLowerCase()}, ${note.zone === 'pocket' ? 'low wet pocket' : 'upland'}.`);
  }

  function move(row, col) {
    const e = stored(), cell = { row, col }, d = ctx.data();
    if (!e) return;
    if (m.sel.startsWith('note:')) { Object.assign(e, { row, col, zone: e.kind === 'water' ? 'pocket' : ctx.zoneOf(cell) }); memory.saveNotes(ctx.store, ctx.state.notes); }
    else { Object.assign(e, finds.latLonOf(d.field, cell), { accuracy_m: null, source: 'pin' }); finds.saveFinds(ctx.store, ctx.state.finds); }
    m.mode = null;
    ctx.refresh();
    ctx.status('Moved. The note keeps its date and the NASA week of that date.');
  }

  return {
    render,
    get sel() { return m.sel; },
    // True when the click was used here; false leaves it to the photo pin.
    onPick(row, col) {
      if (m.mode === 'move' && m.sel) { move(row, col); return true; }
      if (m.mode === 'add') { drop(row, col); return true; }
      return false;
    },
    deselect() { if (m.sel || m.mode) { m.mode = m.mode === 'add' ? 'add' : null; m.sel = null; ctx.refresh(); } },
    stop() { m.mode = null; m.sel = null; },   // a new photo takes over the map clicks
    onPin(id) { m.sel = m.sel === id ? null : id; if (m.mode === 'move') m.mode = null; ctx.refresh(); },
    onClick(e) {
      const a = e.target.closest('[data-map]'), p = e.target.closest('[data-pin]');
      if (a) {
        const [what, v] = a.dataset.map.split(':');
        if (what === 'toggle') m.mode = m.mode === 'add' ? null : 'add';
        else if (what === 'kind') m.kind = v; else if (what === 'cover') m.cover = v;
        render();
        ctx.el.querySelector(`[data-map="${a.dataset.map}"]`)?.focus();
      } else if (p) {
        const act = p.dataset.pin;
        if (act === 'move') { m.mode = m.mode === 'move' ? null : 'move'; render(); ctx.el.querySelector('[data-pin="move"]')?.focus(); }
        else if (act === 'delete') { const [t, i] = m.sel.split(':'); m.sel = null; ctx.remove(t, Number(i)); ctx.refresh(); ctx.status('Deleted from this device.'); }
        else { m.sel = null; if (m.mode === 'move') m.mode = null; ctx.refresh(); }
      }
    },
  };
}
