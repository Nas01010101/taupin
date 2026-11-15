import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addCustom, cleanCustom, customText, loadCustom, MAX_CUSTOM, pickable, removeCustom, saveCustom } from '../js/custom.js';
import { makeRules, scenariosFor } from '../js/engine.js';
import { riskView } from '../js/risk.js';

const json = p => JSON.parse(readFileSync(new URL(`../data/${p}`, import.meta.url), 'utf8'));
const crops = json('crops.json'), risk = json('risk.json');
const memStore = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test('the crops offered are the ones with soil and water values', () => {
  assert.deepEqual(pickable(crops).map(c => c.id), Object.keys(crops.crops));
});

test('adding, refusing, removing and keeping rotations on the device', () => {
  const seq = ['soybean', 'wheat', 'corn', 'soybean', 'buckwheat'];
  let r = addCustom([], seq, '  Ma rotation ', crops);
  assert.equal(r.error, null);
  assert.deepEqual(r.list[0], { id: 'U1', name: 'Ma rotation', crops: seq });
  assert.equal(addCustom(r.list, seq, '', crops).error, 'same');
  assert.equal(addCustom(r.list, ['corn', 'corn'], '', crops).error, 'crops');
  assert.equal(addCustom(r.list, ['corn', 'corn', 'corn', 'corn', 'rice'], '', crops).error, 'crops');
  let list = r.list;
  for (const c of ['corn', 'wheat']) list = addCustom(list, [c, c, c, c, c], '', crops).list;
  assert.equal(list.length, MAX_CUSTOM);
  assert.equal(list[1].name, 'My rotation 2');
  assert.equal(addCustom(list, ['soybean', 'soybean', 'soybean', 'soybean', 'soybean'], '', crops).error, 'full');
  list = removeCustom(list, 'U2');
  assert.equal(addCustom(list, ['buckwheat', 'corn', 'corn', 'corn', 'corn'], '', crops).list.at(-1).id, 'U2');   // freed id reused
  const store = memStore();
  assert.ok(saveCustom(store, list));
  assert.deepEqual(loadCustom(store, crops), list);
  assert.deepEqual(loadCustom({ getItem: () => '{bad' }, crops), []);
  assert.equal(saveCustom({ setItem: () => { throw new Error('blocked'); } }, list), false);
  // A stored crop that lost its data, or a wrong length, drops that rotation.
  assert.deepEqual(cleanCustom([{ id: 'U1', name: 'x', crops: ['rice', 'corn', 'corn', 'corn', 'corn'] }, { id: 'U2', name: 'y', crops: ['corn'] }], crops), []);
});

test('own rotations join the risk view with engine levels, and their card text cites the rules', () => {
  const R = makeRules(risk), mine = { id: 'U1', name: 'Mine', crops: ['corn', 'corn', 'corn', 'soybean', 'wheat'] };
  const v = riskView(risk, 'upland', [], { U1: { name: mine.name, scenarios: scenariosFor(risk, R, 'upland', mine.crops) } });
  assert.equal(v.rows.length, Object.keys(risk.rotations).length + 1);
  const row = v.rows.at(-1);
  assert.deepEqual([row.rotation, row.name, row.custom], ['U1', 'Mine', true]);
  assert.deepEqual(row.years.map(y => y.crw), ['LOW', 'MODERATE', 'HIGH', 'NONE', 'NONE']);
  const t = customText(mine, row, crops);
  assert.ok(t.evidence.length && t.evidence.every(e => /\[.+\]$/.test(e)));
  assert.match(t.risks[0], /Corn after corn in 2027, 2028/);
  assert.ok(t.gaps.length >= 2);
});

test('the builder and the own-rotation cards read in French', async () => {
  const { translate } = await import('../js/i18n.js');
  const fr = s => translate(s).replace(/\s/g, ' ');   // French typography adds non-breaking spaces
  assert.equal(fr('Build your own rotation'), 'Construire votre propre rotation');
  assert.equal(fr('Mine (yours)'), 'Mine (la vôtre)');
  assert.match(fr('Added "Mine": it is in the table and the cards below.'), /^« Mine » ajoutée ?: elle figure dans le tableau et les fiches ci-dessous\.$/);
  assert.match(fr('Your own rotation (Soybean, Grain corn, Soybean, Spring wheat, Buckwheat), scored by the same rules and data as the others.'), /\(Soya, Maïs-grain, Soya, Blé de printemps, Sarrasin\).*autres\.$/);
  assert.match(fr('2028 (Grain corn): CRW: 0 prior corn year(s) -> LOW [MAPAQ / RAP fiche chrysomèle des racines du maïs (Agri-Réseau doc. 118135)]'), /^2028 \(Maïs-grain\) ?: CRM/);
  for (const k of ['crops', 'same', 'full']) {
    const { ERRORS } = await import('../js/custom.js');
    assert.notEqual(fr(ERRORS[k]), ERRORS[k], k);
  }
});

test('the default rotation name reads in French, a typed name stays as typed', async () => {
  const { translate } = await import('../js/i18n.js');
  const fr = s => translate(s).replace(/\s/g, ' ');
  assert.equal(fr('My rotation 2'), 'Ma rotation 2');
  assert.equal(fr('My rotation 2 (yours)'), 'Ma rotation 2 (la vôtre)');
  assert.equal(fr('Soy first (yours)'), 'Soy first (la vôtre)');
});
