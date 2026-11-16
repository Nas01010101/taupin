// HTML for the ranking: the farmer's priorities and one numbered card per rotation.
// Pure functions of the computed metrics; every file-derived string goes through esc().
import { esc } from './ui.js';
import { PRIORITIES, versus, conflicts } from './soilwater.js';

const CROP = { corn: 'Corn', soybean: 'Soybean', wheat: 'Wheat', barley: 'Barley', oat: 'Oats', canola: 'Canola', buckwheat: 'Buckwheat' };

export function controlsHTML({ names, current, chosen }) {
  const pri = Object.entries(PRIORITIES).map(([k, p]) =>
    `<label class="chip"><input type="checkbox" name="pri" value="${esc(k)}"${chosen.includes(k) ? ' checked' : ''}> ${esc(p.label)}</label>`).join('');
  const opt = Object.entries(names).map(([k, v]) => `<option value="${esc(k)}"${k === current ? ' selected' : ''}>${esc(v)}</option>`).join('');
  return `<fieldset class="pri"><legend>What matters on this farm</legend>${pri}</fieldset>
<label class="cur-sel">Current rotation <select id="sw-current">${opt}</select></label>`;
}

// One numbered card per rotation, in rank order: the crops for five years and one line against
// the current rotation (its largest gain, or its largest loss when it gains nothing).
export function cardsHTML(ranked, byId, { names, current, cropData, sequences, prior = [] }) {
  const cur = byId[current];
  return ranked.map((r, i) => {
    const isCur = r.id === current, vs = isCur ? [] : versus(byId[r.id], cur);
    const line = isCur ? 'Your current rotation' : (vs.find(x => x.good) ?? vs[0])?.text ?? 'Same as your current rotation on these priorities';
    const risks = conflicts(sequences[r.id], cropData, prior).map(t => `<p class="warn-t">${esc(t.replace(/\s*\[[^\]]*\]$/, ''))}</p>`).join('');
    const seq = sequences[r.id].map(c => `<li>${esc(CROP[c] ?? c)}</li>`).join('');
    return `<li class="rot${i === 0 ? ' top' : ''}${isCur ? ' cur' : ''}"><span class="n">${r.rank}</span>
<div><h3>${esc(names[r.id])}</h3><ol class="seq">${seq}</ol><p>${esc(line)}</p>${risks}</div></li>`;
  }).join('');
}
