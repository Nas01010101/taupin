// Language layer: Quebec French over the English page, no build step. translate() is pure and
// importable from node; the DOM part runs only in a browser and only when the language is fr.
import { DICT, SAME } from './i18n-fr.js';
import { TEXT } from './i18n-fr-text.js';
import { PATTERNS as P1 } from './i18n-fr-pat.js';
import { PATTERNS as P2 } from './i18n-fr-pat2.js';
import { post } from './i18n-fr-post.js';

const norm = (s) => s.replace(/[’‘]/g, "'");
const MAP = new Map([...Object.entries(DICT), ...Object.entries(TEXT)].map(([k, v]) => [norm(k), v]));

// Strings that reached the DOM layer with no translation; window.__i18nMiss lists them.
export const misses = new Set();
const SOURCE = /NASA|HLS|SMAP|IMERG|doi:|et al\.|USGS|FAO-56|OMAFRA|CanSIS|IRDA|Landsat|Sentinel|MERRA|HRDEM|OpenStreetMap|Agri-R|CC BY|CC0|Public domain|Bugwood|USDA|Terres Noires|Dorval|CRAAQ|MAPAQ,|Concertation|Lal 2|Code de gestion|Entomol|Alexandria|AAFC Annual Crop/;
const note = (s) => { if (/[A-Za-z]{4,}/.test(s) && !SOURCE.test(s)) misses.add(s); };

export function pickLang(search = '', stored = null, navLang = '') {
  const q = new URLSearchParams(search).get('lang');
  if (q === 'fr' || q === 'en') return q;
  if (stored === 'fr' || stored === 'en') return stored;
  return /^fr/i.test(navLang || '') ? 'fr' : 'en';
}

const sub = (g) => {
  const r = tr(g);
  if (r == null) { note(g); return g; }
  return r;
};

const PATTERNS = [...P1, ...P2];

function viaPatterns(k) {
  for (const [re, rep] of PATTERNS) {
    const m = re.exec(k);
    if (!m) continue;
    const r = typeof rep === 'function' ? rep(m, sub) : rep.replace(/\$(\d)/g, (_, n) => (m[n] == null ? '' : sub(m[n])));
    if (r != null) return r;
  }
  return null;
}

// Returns the French text of one whitespace-trimmed string, or null when it is not known.
const busy = new Set();
function tr(s) {
  const k = norm(s);
  if (SAME.has(k)) return s;
  if (busy.has(k)) return null; // a pattern group that equals its own input would recurse forever
  busy.add(k);
  try { return tr1(s, k); } finally { busy.delete(k); }
}

function tr1(s, k) {
  const hit = MAP.get(k);
  if (hit !== undefined) return hit;
  let m;
  if ((m = /^(.*\S) \[(.+)\]$/.exec(k))) {
    const head = tr(m[1]);
    if (head != null) return `${head} [${MAP.get(m[2]) ?? m[2]}]`;
  }
  if ((m = /^([,.;:]\s*)(.+)$/.exec(k))) {
    const rest = tr(m[2]);
    if (rest != null) return m[1] + rest;
  }
  // A closing full stop is outside every pattern: translate the sentence, then put it back.
  if ((m = /^(.*[^.;\s])([.;])$/.exec(k))) {
    const head = tr(m[1]);
    if (head != null) return head + m[2];
  }
  const p = viaPatterns(k);
  if (p != null) return p;
  if (/^[-+−]?\d[\d.,]*(\s?(%|mm|m|ha|km|kg|t|°C))?$/.test(k)) return k;
  // A full stop after "doc" or "al" belongs to a citation, not to a sentence end.
  for (const cut of [/(?<=[!?]|(?<!\bdoc|\bal)\.) /, /(?<=;) /]) {
    const parts = k.split(cut);
    if (parts.length < 2) continue;
    let any = false;
    const out = parts.map((x) => {
      const r = tr(x);
      if (r == null) { note(x); return x; }
      any = true;
      return r;
    });
    if (any) return out.join(' ');
  }
  return null;
}

const one = (core) => {
  const r = tr(core);
  return r == null ? null : post(r);
};

export function translate(raw) {
  if (typeof raw !== 'string') return raw;
  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(raw);
  if (!core) return raw;
  if (!core.includes('\n')) {
    const r = one(core);
    if (r == null) { note(core); return raw; }
    return lead + r + trail;
  }
  // Hard-wrapped prose reads best flat; a record reads best line by line. Keep whichever misses less.
  const seen = new Set(misses);
  misses.clear();
  const flat = one(core.replace(/\s+/g, ' '));
  const flatMiss = new Set(misses);
  misses.clear();
  const lines = core.split('\n').map((line) => {
    const [, ind, body, end] = /^(\s*)(.*?)(\s*)$/.exec(line);
    if (!body) return line;
    const r = one(body);
    if (r == null) note(body);
    return r == null ? line : ind + r + end;
  });
  const useFlat = flat != null && flatMiss.size <= misses.size;
  const kept = useFlat ? flatMiss : new Set(misses);
  misses.clear();
  for (const m of [...seen, ...kept]) misses.add(m);
  return lead + (useFlat ? flat : lines.join('\n')) + trail;
}

/* ---- DOM layer ---- */
const SKIP = new Set(['SCRIPT', 'STYLE', 'CODE', 'CANVAS', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

function start() {
  let stored = null;
  try { stored = localStorage.getItem('taupin-lang'); } catch { /* storage blocked */ }
  const lang = pickLang(location.search, stored, navigator.language);
  const html = document.documentElement;
  html.lang = lang;
  const btn = document.getElementById('lang');
  if (btn) wireButton(btn, lang);
  if (lang !== 'fr') return;
  window.__i18nMiss = misses;
  const lastText = new WeakMap();
  const lastAttr = new WeakMap();

  const text = (node) => {
    const v = node.nodeValue;
    if (lastText.get(node) === v) return;
    const out = translate(v);
    if (out !== v) node.nodeValue = out;
    lastText.set(node, out);
  };
  const attrs = (el) => {
    let seen = lastAttr.get(el);
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (v == null) continue;
      if (seen && seen[a] === v) continue;
      const out = translate(v);
      if (out !== v) el.setAttribute(a, out);
      seen = seen || {};
      seen[a] = out;
    }
    if (seen) lastAttr.set(el, seen);
  };
  const skipped = (n) => { for (let e = n.parentElement; e; e = e.parentElement) if (SKIP.has(e.tagName)) return true; return false; };
  const sweep = (root) => {
    if (root.nodeType === 3) { if (!skipped(root)) text(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.tagName) || skipped(root)) return;
    attrs(root);
    root.querySelectorAll(ATTRS.map((a) => `[${a}]`).join(',')).forEach(attrs);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (!skipped(n)) text(n);
  };
  const meta = document.querySelector('meta[name="description"]');
  const run = () => {
    if (meta) { const v = meta.getAttribute('content'); const o = translate(v); if (o !== v) meta.setAttribute('content', o); }
    sweep(document.documentElement);
    document.title = translate(document.title);
  };
  const obs = new MutationObserver((list) => {
    for (const r of list) {
      if (r.type === 'characterData') sweep(r.target);
      else if (r.type === 'attributes') attrs(r.target);
      else r.addedNodes.forEach(sweep);
    }
    obs.takeRecords();
  });
  run();
  obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  obs.takeRecords();
  for (const fn of ['confirm', 'alert']) {
    const orig = window[fn].bind(window);
    window[fn] = (m) => orig(translate(String(m)));
  }
}

function wireButton(btn, lang) {
  btn.innerHTML = lang === 'fr' ? '<b>FR</b> / EN' : 'FR / <b>EN</b>';
  btn.title = lang === 'fr' ? 'English' : 'Français';
  btn.addEventListener('click', () => {
    try { localStorage.setItem('taupin-lang', lang === 'fr' ? 'en' : 'fr'); } catch { /* storage blocked */ }
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    location.href = u.toString();
  });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
