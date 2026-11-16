// "What next on this field": a plan that starts from what the field actually grew, instead of a
// ranking of fixed five-year rotations. From the last years (the farmer's crop record, else the
// field's crop history, else the default start) it finds where the field is in its current
// rotation, so "keep going" means the real next crops. Then it builds every three-year
// continuation from the sourced crops, drops the ones that break a sourced rotation conflict,
// scores each with the same engines as the rotation ranking (engine.js pest levels from the
// field's own start, soilwater.js water, soil cover, nitrogen and residue), and shows the best
// ones against keeping the current rotation: what changes, what it costs, and whether the
// switch is worth it. Pure functions; app.js draws the result.
import { scenariosFor } from './engine.js';
import { rotationMetrics, rank, versus, conflicts } from './soilwater.js';
import { esc } from './ui.js';

export const YEARS = 3;
// A switch is worth a look when it scores this much above keeping the rotation (0 to 1 scale).
export const WORTH = 0.1;

// Where the last years sit in a rotation cycle: the offset that matches most of the recent years,
// the more recent years counting first. Returns the next n crops of the rotation from there.
export function keepGoing(rotation, prior, n = YEARS) {
  let cyc = rotation;
  for (let p = 1; p <= rotation.length; p++) if (rotation.every((x, i) => x === rotation[i % p])) { cyc = rotation.slice(0, p); break; }
  const last = prior.slice(-5);
  let best = 0, bestKey = null;
  for (let s = 0; s < cyc.length; s++) {
    // Year j of `last` is cycle position s + j. Last year's crop decides first (the next crop must
    // follow what was grown), then how many recent years fit, then the more recent ones.
    const hits = last.map((c, j) => (cyc[(s + j) % cyc.length] === c ? 1 : 0));
    const key = [hits[hits.length - 1] ?? 0, hits.reduce((a, b) => a + b, 0), ...hits.slice().reverse()];
    const d = bestKey ? key.findIndex((v, i) => v !== bestKey[i]) : 0;
    if (!bestKey || (d >= 0 && key[d] > bestKey[d])) { best = s; bestKey = key; }
  }
  const at = (best + last.length) % cyc.length;
  return { crops: Array.from({ length: n }, (_, i) => cyc[(at + i) % cyc.length]), matched: bestKey ? bestKey[1] : 0, of: last.length };
}

// Every n-year sequence of the given crops.
export function sequences(crops, n = YEARS) {
  let out = [[]];
  for (let i = 0; i < n; i++) out = out.flatMap(s => crops.map(c => [...s, c]));
  return out;
}

const pestRow = sc => ({ years: sc.baseline.map(r => ({ wireworm: r.wireworm, crw: r.corn_rootworm, rx: r.prescription_supportable })) });

// risk, rules: risk.json and engine.makeRules(risk); zone: 'upland' | 'pocket'; start: the
// farmer's crop-record start {prior, yearsSinceSod} or null (the field's baked start); prior: the
// crops before the plan (oldest first); current: the current rotation's crops; cropData: crops.json;
// clim: climNow(); chosen: the priorities ticked; tillage. Returns the plan the panel draws.
export function plan({ risk, rules, zone, start = null, prior, current, cropData, clim, chosen, tillage = 'fall_plow', top = 3 }) {
  const crops = Object.keys(cropData.crops);
  const keep = keepGoing(current, prior);
  const keyOf = s => s.join('|');
  const seen = new Set([keyOf(keep.crops)]);
  const cands = [{ id: 'keep', crops: keep.crops }];
  for (const s of sequences(crops)) {
    if (seen.has(keyOf(s)) || conflicts(s, cropData, prior).length) continue;
    seen.add(keyOf(s)); cands.push({ id: keyOf(s), crops: s });
  }
  const scored = cands.map(c => {
    const sc = scenariosFor(risk, rules, zone, c.crops, start), pests = pestRow(sc);
    return { ...c, pests, metrics: rotationMetrics(c.crops, clim ?? { crops: {} }, cropData, pests, tillage, prior) };
  });
  const ranked = rank(scored.map(c => ({ id: c.id, metrics: c.metrics })), chosen);
  const byId = Object.fromEntries(scored.map(c => [c.id, c]));
  const keepRow = ranked.find(r => r.id === 'keep'), k = byId.keep;
  const grown = new Set(prior);
  const options = ranked.filter(r => r.id !== 'keep').slice(0, top).map(r => {
    const c = byId[r.id];
    return {
      crops: c.crops, score: r.score, rank: r.rank, years: c.pests.years,
      vs: versus(c.metrics, k.metrics),
      changed: c.crops.filter((x, i) => x !== k.crops[i]).length,
      newCrops: [...new Set(c.crops.filter(x => !grown.has(x)))],
      rx: c.pests.years.filter(y => y.rx).length,
    };
  });
  const best = options[0];
  const gain = best && keepRow?.score != null && best.score != null ? best.score - keepRow.score : null;
  return {
    zone, prior: prior.slice(-5), keep: { crops: k.crops, score: keepRow?.score ?? null, rank: keepRow?.rank ?? null, years: k.pests.years,
      rx: k.pests.years.filter(y => y.rx).length, matched: keep.matched, of: keep.of },
    options, total: ranked.length, gain, worth: gain != null && gain >= WORTH,
  };
}

const LV = { LOW: 'nx-low', MODERATE: 'nx-mod', HIGH: 'nx-high' };
const pct = v => (v == null ? '?' : `${Math.round(v * 100)}`);

// The panel: where the field is, keep going, the best switches, and the verdict.
export function planHTML(p, { cropData, startYear, source, rotationName }) {
  const name = id => cropData.crops[id]?.name ?? { sod: 'Hay or pasture', other: 'Other crop', rye: 'Rye' }[id] ?? id;
  const seq = (crops, years) => crops.map((c, i) => `<span class="nx-crop ${LV[years?.[i]?.wireworm] ?? ''}" title="${esc(`${startYear + i}: wireworm ${years?.[i]?.wireworm ?? '?'}, rootworm ${years?.[i]?.crw ?? '?'}${years?.[i]?.rx ? ', coated seed supportable' : ''}`)}">${startYear + i} ${esc(name(c))}</span>`).join(' → ');
  const verdict = p.worth
    ? `<p class="nx-verdict good"><b>Worth a look:</b> the best switch scores ${pct(p.gain)} points higher (out of 100) than keeping ${esc(rotationName)}. Weigh its gains (+) against its costs (−) below before changing.</p>`
    : `<p class="nx-verdict"><b>Keep going:</b> no switch scores ${pct(WORTH)} points or more above keeping ${esc(rotationName)}${p.keep.rank ? `, which ranks ${p.keep.rank} of ${p.total}` : ''}.</p>`;
  const opt = (o, i) => `<li class="nx-opt"><div><b>${i + 1}.</b> ${seq(o.crops, o.years)} <span class="muted small">score ${pct(o.score)}/100</span></div>
<ul class="small">${o.vs.length ? o.vs.map(v => `<li class="${v.good ? 'good' : 'bad'}">${v.good ? '+' : '−'} ${esc(v.text.replace('over five years', 'over three years'))}</li>`).join('') : '<li>Same totals as keeping the rotation.</li>'}
<li>Changes ${o.changed} of ${p.keep.crops.length} years from keeping the rotation.${o.newCrops.length ? ` New on this field in the record: ${esc(o.newCrops.map(name).join(', '))} (seed, equipment and a buyer to check).` : ''}${o.rx !== p.keep.rx ? ` Coated-seed prescription years: ${o.rx} against ${p.keep.rx}.` : ''}</li></ul></li>`;
  return `<h3>What next on this field, ${startYear} to ${startYear + p.keep.crops.length - 1}</h3>
<p class="small">Last years (${esc(source)}): ${p.prior.map(c => esc(name(c) || c)).join(', ') || 'unknown'}.
Keeping <b>${esc(rotationName)}</b> from where the field is (${p.keep.matched} of ${p.keep.of} recent years fit it) gives:</p>
<p>${seq(p.keep.crops, p.keep.years)} <span class="muted small">score ${pct(p.keep.score)}/100</span></p>
${verdict}
<p class="small">Best of ${p.total - 1} other three-year plans built from the sourced crops (sequences that break a sourced rotation conflict are left out), scored on the priorities ticked above for the ${p.zone === 'pocket' ? 'low wet pocket' : 'upland'}:</p>
<ol class="nx-list">${p.options.map(opt).join('')}</ol>
<p class="small muted">Colours: wireworm level that year. Scores are relative to the plans compared here. Pest levels start from this field's own crop history; enter your crops above if the record is wrong.</p>`;
}
