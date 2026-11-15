import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, pickLang } from '../js/i18n.js';
import { DICT } from '../js/i18n-fr.js';
import { TEXT } from '../js/i18n-fr-text.js';
import { PATTERNS as P1 } from '../js/i18n-fr-pat.js';
import { PATTERNS as P2 } from '../js/i18n-fr-pat2.js';
import { post, fixDates } from '../js/i18n-fr-post.js';
import { liftLine, verdict, findLine } from '../js/scout.js';

const NB = ' ';

test('language order: URL param, stored choice, browser language, English', () => {
  assert.equal(pickLang('?lang=fr', 'en', 'en-US'), 'fr');
  assert.equal(pickLang('?lang=en', 'fr', 'fr-CA'), 'en');
  assert.equal(pickLang('', 'fr', 'en-US'), 'fr');
  assert.equal(pickLang('', null, 'fr-CA'), 'fr');
  assert.equal(pickLang('', 'de', 'FR'), 'fr');
  assert.equal(pickLang('?lang=de', null, 'en-CA'), 'en');
  assert.equal(pickLang(), 'en');
});

test('dictionary words use the Quebec field vocabulary', () => {
  assert.equal(translate('Standing water'), 'Eau stagnante');
  assert.equal(translate('Water channel'), 'Rigole d\u2019écoulement');
  assert.equal(translate('Wireworm (click beetle larva)'), 'Ver fil-de-fer (larve de taupin)');
  assert.equal(translate('Click beetle (adult)'), 'Taupin (adulte)');
  assert.equal(translate('Earthworm (beneficial)'), 'Ver de terre (bénéfique)');
});

test('surrounding whitespace is kept and unknown text comes back unchanged', () => {
  assert.equal(translate('  Standing water\n'), '  Eau stagnante\n');
  for (const s of ['Zzz not a sentence from this app', 'NASA POWER', 'Agriotes', '2026-05-14', '']) assert.equal(translate(s), s);
  assert.equal(translate(null), null);
});

test('dates: day first, lowercase French months, 1er', () => {
  assert.equal(translate('6 May'), '6 mai');
  assert.equal(translate('1 March'), '1er mars');
  assert.equal(translate('May 6'), '6 mai');
  assert.equal(translate('Jun 17'), '17 juin');
  assert.equal(translate('31 December'), '31 décembre');
  assert.equal(fixDates('from 1 Mar to 12 Aug'), 'from 1er mars to 12 août');
  assert.equal(translate('2026-05-14'), '2026-05-14');
});

test('numbers and plurals follow the French rules', () => {
  const one = translate('Lift 1: 1 wireworm in 1 trap, 1 per trap');
  assert.equal(one, `Relevé 1${NB}: 1 ver fil-de-fer dans 1 piège, 1 par piège`);
  const many = translate('Lift 2: 8 wireworms in 2 traps, 4 per trap, lifted 2026-05-14');
  assert.equal(many, `Relevé 2${NB}: 8 vers fil-de-fer dans 2 pièges, 4 par piège, relevé le 2026-05-14`);
  assert.equal(translate('Delete all 3 entries from this device?'), 'Supprimer les 3 entrées de cet appareil?');
});

test('typography: decimal comma, no-break spaces before %, units and colons', () => {
  assert.equal(translate('Brier score 0.110 against 0.116 for the base rate.'), 'Score de Brier de 0,110, contre 0,116 pour le taux de base.');
  assert.equal(post('12.5 °C and 40 %'), `12,5${NB}°C and 40${NB}%`);
  assert.equal(post('1,234 mm'), `1${NB}234${NB}mm`);
  assert.equal(post('Source: x'), `Source${NB}: x`);
  assert.equal(post('it\'s 10 W'), `it’s 10${NB}O`);
});

test('citations and source names stay as written', () => {
  const out = translate('82 Quebec fields (Labrie et al. 2020, PLoS ONE 15(2): e0229136), 11 at or above 1 wireworm per trap.');
  assert.match(out, /\(Labrie et al\. 2020, PLoS ONE 15\(2\): e0229136\)/);
  assert.match(out, /^82 parcelles du Québec/);
  assert.equal(translate('Standing water [Labrie et al. 2020]'), 'Eau stagnante [Labrie et al. 2020]');
  assert.match(translate('NASA GPM rain 18.8 mm in 7 days (usual for this week, 25 years); SMAP root-zone moisture 0.283 m3/m3 (usual for this month)'), /^Pluie NASA GPM 18,8/);
});

test('texts built by the app translate', () => {
  const s = { genus: 'agriotes', threshold: 1, lifts: [], counted: 1, reached: false, highest: 0 };
  const line = translate(liftLine({ lift: 1, total: 8, n: 2, mean: 4 }));
  assert.match(line, /^Relevé 1/);
  const v = translate(verdict(s, 10));
  assert.match(v, /^Aucun relevé n\u2019atteint le seuil de 1 par piège pour Agriotes/);
  assert.match(v, /trois relevés, espacés de 7 à 10\u00a0jours/);
  const f = translate(findLine({ time: '2026-11-15T20:33:00Z', label: 'Click beetle (adult)', confidence: 0.982, lat: 45.50128, lon: -73.76513, source: 'pin', answered_or_unclear: 'answered' }));
  assert.equal(f, `2026-11-15 20:33 UTC, Taupin (adulte) (98,2${NB}%), 45,50128 N, 73,76513${NB}O, à l\u2019épingle sur le champ`);
});

test('the multi-line record keeps its layout and translates line by line', () => {
  const rec = 'Taupin scouting record\n  Written 2026-11-15\n  Trap Zone Latitude   Longitude   Lift 1 Lift 2';
  assert.equal(translate(rec), 'Fiche de dépistage Taupin\n  Rédigé le 2026-11-15\n  Piège Zone Latitude   Longitude   Rel. 1 Rel. 2');
});

test('rank thirds read bas, moyen and supérieur', () => {
  assert.equal(translate('Which fields to trap first: high third for 2026'), `Parcelles à piéger en premier${NB}: tiers supérieur pour 2026`);
  assert.match(translate('Low third of the 82 training fields for 2026. A rank, not a probability and not a decision.'), /^Tiers bas des 82 parcelles/);
});

test('translating twice changes nothing more than translating once', () => {
  for (const s of ['6 May', 'Standing water', 'Lift 1: 1 wireworm in 1 trap, 1 per trap', 'Brier score 0.110 against 0.116 for the base rate']) {
    const once = translate(s);
    assert.equal(translate(once), once);
  }
});

test('dictionary and patterns are well formed', () => {
  const keys = new Map();
  for (const [name, d] of [['DICT', DICT], ['TEXT', TEXT]]) {
    for (const [en, fr] of Object.entries(d)) {
      assert.equal(typeof fr, 'string', `${name}: ${en}`);
      assert.doesNotMatch(fr, /[–—]/, `dash in ${name}: ${en}`);
      assert.doesNotMatch(en, /’/, `curly apostrophe in key: ${en}`);
      keys.set(en, (keys.get(en) ?? 0) + 1);
    }
  }
  assert.ok(Object.keys(DICT).length > 300 && Object.keys(TEXT).length > 100);
  assert.ok(P1.length + P2.length > 100);
  for (const [re, rep] of [...P1, ...P2]) {
    assert.ok(re instanceof RegExp);
    assert.ok(typeof rep === 'function' || typeof rep === 'string');
    if (typeof rep === 'string') assert.doesNotMatch(rep, /[–—]/);
  }
});
