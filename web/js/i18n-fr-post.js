// French typography applied to an already translated string: numbers, dates, spaces, quotes.
// Segments inside [square brackets] are citations and are never passed through here.
import { MONTHS, MONTH_FULL } from './i18n-fr.js';

const NB = ' ';
const alt = Object.keys(MONTH_FULL).concat(Object.keys(MONTHS)).sort((a, b) => b.length - a.length).join('|');
const mon = (k) => MONTH_FULL[k] ?? MONTHS[k];
const day = (d) => (d === '1' ? '1er' : d);
const RE_DM = new RegExp(`\\b(\\d{1,2}) (${alt})\\b(?!\\.)`, 'g');
const RE_MD = new RegExp(`\\b(${alt}) (\\d{1,2})(?![\\d:])`, 'g');
const RE_ABBR = new RegExp(`\\b(${Object.keys(MONTHS).join('|')})\\b(?= \\d)`, 'g');
const RE_FULL = new RegExp(`\\b(${Object.keys(MONTH_FULL).join('|')})\\b`, 'g');
const UNITS = 'mm|cm|km|m|ha|kg|t|°C|jours?|W|O';

export function fixDates(s) {
  return s
    .replace(RE_DM, (_, d, m) => `${day(d)} ${mon(m)}`)
    .replace(RE_MD, (_, m, d) => `${day(d)} ${mon(m)}`)
    .replace(RE_ABBR, (_, m) => mon(m))
    .replace(RE_FULL, (_, m) => mon(m));
}

function typo(s) {
  return fixDates(s
    .replace(/(\d),(\d{3})(?!\d)/g, `$1${NB}$2`)
    .replace(/(?<!doi:|doi |BY |[\d.])(\d+)\.(\d+)(?![\d.])/g, '$1,$2')
    .replace(/(\d) ?(%|°C)/g, `$1${NB}$2`)
    .replace(/(\d) W(?![\p{L}\d])/gu, '$1 O')
    .replace(new RegExp(`(\\d) (${UNITS})(?![\\p{L}\\d])`, 'gu'), `$1${NB}$2`)
    .replace(/([^\s]):(?=\s|$)/g, `$1${NB}:`)
    .replace(/«\s*/g, `«${NB}`)
    .replace(/\s*»/g, `${NB}»`)
    .replace(/(?<=[\p{L}\d])'(?=[\p{L}\d])/gu, '’'));
}

// Citations stay as written: [bracketed] text, and text a pattern wraps in verbatim() marks.
export const verbatim = (s) => `\u27e6${s}\u27e7`;
export function post(s) {
  return s.split(/(\[[^\]]*\]|\u27e6[^\u27e7]*\u27e7)/).map((seg, i) => (i % 2 ? seg : typo(seg))).join('').replace(/[\u27e6\u27e7]/g, '');
}

export const pl = (n, one, many) => (Number(n) >= 2 ? many : one);
