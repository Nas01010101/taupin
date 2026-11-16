import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ra, et0, kcAt, plantingDoy, cropYear, climatology, rotationMetrics, rank, versus, gaps, conflicts } from '../js/soilwater.js';
import { riskView } from '../js/risk.js';

const data = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const crops = data('crops.json'), weather = data('weather.json'), risk = data('risk.json'), rot = data('rotations.json');
const close = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('Ra and Hargreaves ET0 match the FAO-56 worked examples', () => {
  close(ra(-20, 246), 32.2, 0.1);                 // FAO-56 Example 8: 20 S, 3 September
  close(ra(45, 172), 41.5, 1);                   // June solstice at 45 N
  assert.equal(et0(null, 10, 45, 100), null);
  close(et0(30, 15, 45, 196), 0.0023 * 40.3 * Math.sqrt(15) * 0.408 * ra(45, 196), 1e-9);
});

test('Kc curve: flat, rising, flat, falling, then zero', () => {
  const c = crops.crops.corn, [li, ld, lm, ll] = c.stages;
  assert.equal(kcAt(c, 0), 0.3);
  close(kcAt(c, li + ld / 2), (0.3 + 1.2) / 2, 1e-9);
  assert.equal(kcAt(c, li + ld + 1), 1.2);
  close(kcAt(c, li + ld + lm + ll - 1e-9), 0.35, 1e-6);
  assert.equal(kcAt(c, li + ld + lm + ll), 0);
});

test('sowing day is the first day from 1 March with a 10-day mean at the threshold', () => {
  const days = Array.from({ length: 200 }, (_, i) => ({ doy: i + 1, tmax: i < 120 ? 5 : 20, tmin: i < 120 ? 0 : 10 }));
  assert.equal(plantingDoy(days, 15), 130);      // the first all-warm 10-day window ends on day 130
  assert.equal(plantingDoy(days, 30), null);
  const early = days.map(d => ({ ...d, tmax: 30, tmin: 20 }));
  assert.equal(plantingDoy(early, 13), 60);       // nothing before 1 March
});

test('heavy rain counts only on bare soil, above 0 C, April to November', () => {
  const c = { kc: [0.3, 1.2, 0.35], stages: [10, 10, 10, 10], plant_t10: 20 };
  const days = Array.from({ length: 365 }, (_, i) => ({ doy: i + 1, tmax: i >= 100 ? 25 : 5, tmin: i >= 100 ? 15 : -5, rain: 0 }));
  for (const d of [95, 115, 125, 200, 340]) days[d - 1].rain = 30;   // plant 110: 115 bare (before cover at 120), 125 covered
  const y = cropYear(days, c, 45);
  assert.deepEqual([y.plant, y.harvest, y.bareHeavy], [110, 150, 2]);   // 95 is cold, 340 after 30 Nov
});

test('demo climatology: 25 years, corn sown after wheat, buckwheat left as a gap', () => {
  const cl = climatology(weather, crops.crops, weather.site.lat, crops.heavy_rain_mm);
  assert.deepEqual([cl.years, cl.n], [[2001, 2025], 25]);
  assert.ok(cl.crops.wheat.plant < cl.crops.corn.plant);
  assert.ok(cl.crops.corn.plant > 120 && cl.crops.corn.plant < 160);
  assert.ok(cl.crops.corn.need > 300 && cl.crops.corn.need < 700);
  assert.ok(cl.crops.soybean.deficitDry >= cl.crops.soybean.deficit);
  assert.equal(cl.crops.buckwheat, null);
});

test('rotation totals, ranking by priority, and benefits against the current rotation', () => {
  const cl = climatology(weather, crops.crops, weather.site.lat, crops.heavy_rain_mm);
  const view = riskView(risk, 'upland');
  const rows = view.rows.map(r => ({ id: r.rotation, metrics: rotationMetrics(risk.rotations[r.rotation], cl, crops, r) }));
  const byId = Object.fromEntries(rows.map(r => [r.id, r.metrics]));
  assert.equal(byId.A_continuous_corn.total.n, 5 * 145);
  assert.equal(byId.D_corn_soy.total.n, 145 + 15 + 120 + 15 + 120);   // soybean leaves 25 kg N/ha to the next corn
  assert.equal(byId.C_with_buckwheat.unknown.water, 1);
  assert.ok(byId.A_continuous_corn.total.pest > byId.B_corn_soy_wheat.total.pest);
  const all = rank(rows, ['pests', 'water', 'soil', 'nitrogen', 'organic']);
  // The two buckwheat plans have gaps on water and nitrogen: ranked after the complete ones.
  assert.deepEqual(all.slice(-2).map(r => r.id).sort(), ['C_with_buckwheat', 'E_buckwheat_first']);
  assert.equal(all.at(-1).complete, false);
  const pestFirst = rank(rows, ['pests']);
  assert.notEqual(pestFirst[0].id, 'A_continuous_corn');
  assert.equal(pestFirst.at(-1).id, 'A_continuous_corn');
  const nFirst = rank(rows, ['nitrogen']);
  assert.equal(byId.C_with_buckwheat.total.n, null);   // buckwheat leaves no sourced N credit: the sum stays unknown
  assert.deepEqual(nFirst.slice(-2).map(r => r.id).sort(), ['C_with_buckwheat', 'E_buckwheat_first']);   // unknown ranks last
  assert.equal(nFirst.at(-3).id, 'A_continuous_corn');   // the highest known N bill
  assert.ok(nFirst.slice(0, -1).every((r, i) => i === 0 || r.score <= nFirst[i - 1].score));
  const b = versus(byId.B_corn_soy_wheat, byId.A_continuous_corn);
  assert.ok(b.some(x => x.good && /nitrogen/.test(x.text)));
  assert.deepEqual(versus(byId.A_continuous_corn, byId.A_continuous_corn), []);
});

test('every rotation has a card; gaps list unsourced and assumed values', () => {
  for (const id of Object.keys(risk.rotations)) {
    const c = rot.rotations[id];
    assert.ok(c && c.why && c.evidence.length && c.risks.length && c.gaps.length, id);
  }
  assert.ok(rot.rotations[rot.default_current]);
  const g = gaps(risk.rotations.C_with_buckwheat, crops);
  assert.ok(g.some(t => /Buckwheat: no sourced water use/.test(t)));
  assert.ok(g.some(t => /Soybean: .*assum/.test(t)));
  assert.ok(!gaps(['corn'], crops).length);
});

test('every crop value has a source key that exists, or is null', () => {
  for (const c of Object.values(crops.crops)) {
    for (const k of ['kc_src', 'stages_src', 'usle_src', 'n_src', 'credit_src', 'yield_src', 'ratio_src']) {
      if (c[k] != null) assert.ok(crops.sources[c[k]], `${c.name} ${k}`);
    }
  }
});

test('the researched crops: every crop the farmer can enter in the history that has data is scored', () => {
  for (const id of ['barley', 'oat', 'canola']) assert.ok(crops.crops[id], id);
  // Barley and oats have every column; canola has no season, sowing rule, N credit or residue ratio.
  const m = rotationMetrics(['barley', 'oat', 'corn', 'soybean', 'wheat'], { crops: {} }, crops, null);
  assert.deepEqual(m.years.map(y => y.c), [0.35, 0.35, 0.40, 0.50, 0.35]);
  assert.deepEqual(m.years.map(y => y.n), [75, 50, 145, 15, 80]);           // mid-range minus the previous crop's credit
  assert.ok(m.total.residue > 0 && m.unknown.residue === 0);
  const cn = rotationMetrics(['canola', 'wheat', 'corn', 'soybean', 'wheat'], { crops: {} }, crops, null);
  assert.equal(cn.years[1].n, null);                                         // no sourced canola credit: wheat's N stays unknown
  assert.equal(cn.total.n, null);
  const g = gaps(['canola', 'buckwheat'], crops);
  for (const re of [/Canola: no sourced season length/, /Canola: no sourced nitrogen left/, /Canola: no sourced residue ratio/,
    /Buckwheat: assumption: Ontario maxima/, /Buckwheat: assumption: IPCC/]) assert.ok(g.some(t => re.test(t)), re);
  assert.ok(!g.some(t => /Buckwheat: no sourced (Quebec yield|nitrogen need|residue ratio)/.test(t)));
});

test('rotation conflicts: soybean or canola right after buckwheat, the last history year included', () => {
  const c = conflicts(['corn', 'buckwheat', 'soybean', 'wheat', 'corn'], crops);
  assert.equal(c.length, 1);
  assert.match(c[0], /^Soybean right after buckwheat: white mould .+ \[OMAFRA Publication 811 \(2022\), Buckwheat\]$/);
  assert.deepEqual(conflicts(['buckwheat', 'corn', 'soybean', 'wheat', 'corn'], crops), []);
  assert.equal(conflicts(['soybean', 'wheat', 'corn', 'soybean', 'wheat'], crops, ['sod', 'buckwheat']).length, 1);
  assert.equal(conflicts(['canola', 'wheat', 'corn', 'soybean', 'wheat'], crops, ['buckwheat']).length, 1);
  assert.deepEqual(conflicts(['corn'], { crops: {}, sources: {} }), []);
  for (const id of ['C_with_buckwheat', 'E_buckwheat_first']) assert.equal(conflicts(risk.rotations[id], crops).length, 1, id);
  for (const r of crops.rotation_conflicts) assert.ok(crops.sources[r.src]);
});

test('cards: the buckwheat then soybean warning is in the risks of the cards that have it', async () => {
  const { cardsHTML } = await import('../js/swui.js');
  const ids = ['C_with_buckwheat', 'B_corn_soy_wheat'], sequences = Object.fromEntries(ids.map(id => [id, risk.rotations[id]]));
  const byId = Object.fromEntries(ids.map(id => [id, rotationMetrics(sequences[id], { crops: {} }, crops, null)]));
  const ranked = rank(ids.map(id => ({ id, metrics: byId[id] })), ['soil']);
  const html = cardsHTML(ranked, byId, { names: { C_with_buckwheat: 'C', B_corn_soy_wheat: 'B' }, texts: rot.rotations,
    current: 'B_corn_soy_wheat', cropData: crops, sequences, chosen: ['soil'], prior: ['sod'] });
  const cards = html.split('<li class="rot').slice(1);
  assert.equal(cards.filter(c => /Soybean right after buckwheat/.test(c)).length, 1);
  assert.ok(cards.find(c => /<h3>C</.test(c)).includes('Soybean right after buckwheat'));
});

test('corn right after corn loses the sourced yield and its residue (Gagnon et al. 2019)', () => {
  const pen = crops.crops.corn.after_same_penalty_kg_ha, y0 = crops.crops.corn.yield_kg_ha;
  assert.equal(pen, 700);
  assert.ok(crops.sources[crops.crops.corn.after_same_src]);
  const cc = rotationMetrics(['corn', 'corn', 'soybean', 'corn', 'corn'], { crops: {} }, crops, null);
  assert.deepEqual(cc.years.map(y => y.yield), [y0, y0 - pen, crops.crops.soybean.yield_kg_ha, y0, y0 - pen]);
  close(cc.years[1].residue, (y0 - pen) * crops.crops.corn.residue_ratio / 1000, 1e-9);
  // the first year looks at the last crop of the farmer's history
  const after = rotationMetrics(['corn', 'soybean'], { crops: {} }, crops, null, 'fall_plow', ['wheat', 'corn']);
  assert.equal(after.years[0].yield, y0 - pen);
  // corn every year now carries the penalty in four of five years
  const ccc = rotationMetrics(['corn', 'corn', 'corn', 'corn', 'corn'], { crops: {} }, crops, null);
  close(ccc.total.residue, (y0 + 4 * (y0 - pen)) / 5 * crops.crops.corn.residue_ratio / 1000, 1e-9);
});
