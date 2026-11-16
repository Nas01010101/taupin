// Scene kind of a photo from the 384-d embedding the photo model already computes
// (output `embedding` of model/taupin.onnx): insect or soil animal, standing water, ground cover,
// water channel, other. A linear head (standardise, matrix, softmax) whose weights are in
// data/scene_head.json; src: train/scene_probe.py, numbers in model/MODEL_CARD.md.
// Pure functions, no DOM and no network except loadSceneHead.

export const SCENE_UNCLEAR = 'unclear scene: choose the kind by hand';

export function checkHead(h) {
  const k = h && Array.isArray(h.classes) ? h.classes.length : 0, d = h && h.embedding_dim;
  const ok = k > 1 && Number.isInteger(d) && d > 0 && h.classes.every(c => c.id && c.name)
    && Array.isArray(h.mean) && h.mean.length === d && Array.isArray(h.scale) && h.scale.length === d
    && h.scale.every(s => s > 0)
    && Array.isArray(h.weights) && h.weights.length === k && h.weights.every(r => Array.isArray(r) && r.length === d)
    && Array.isArray(h.bias) && h.bias.length === k
    && Number(h.temperature) > 0 && Number.isFinite(Number(h.abstain_below ?? 0));
  if (!ok) throw new Error('scene head does not match the contract (classes, embedding_dim, mean, scale, weights, bias, temperature)');
  return h;
}

export async function loadSceneHead({ fetchFn = fetch, url = 'data/scene_head.json' } = {}) {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return checkHead(await r.json());
}

// embedding: Float32Array | number[] of length head.embedding_dim, straight from the model's
// `embedding` output (no normalisation by the caller).
// Returns { kind, name, confidence, unclear, ranked: [{ kind, name, prob }] }, ranked by prob.
// `kind` is always the top-1 class; when `unclear` is true (top-1 prob below head.abstain_below)
// the UI should ask the user instead of using it.
export function classifyScene(head, embedding) {
  checkHead(head);
  const d = head.embedding_dim, k = head.classes.length;
  if (!embedding || embedding.length !== d) throw new Error(`scene embedding must have ${d} values`);
  const z = new Float64Array(d);
  for (let i = 0; i < d; i++) {
    const v = Number(embedding[i]);
    if (!Number.isFinite(v)) throw new Error('scene embedding has a non-finite value');
    z[i] = (v - head.mean[i]) / head.scale[i];
  }
  const t = Number(head.temperature), logit = new Array(k);
  for (let c = 0; c < k; c++) {
    let s = head.bias[c];
    const w = head.weights[c];
    for (let i = 0; i < d; i++) s += w[i] * z[i];
    logit[c] = s / t;
  }
  const m = Math.max(...logit), e = logit.map(v => Math.exp(v - m)), tot = e.reduce((a, b) => a + b, 0);
  const prob = e.map(v => v / tot);
  const order = prob.map((_, i) => i).sort((a, b) => prob[b] - prob[a]);
  const ranked = order.map(i => ({ kind: head.classes[i].id, name: head.classes[i].name, prob: prob[i] }));
  return {
    kind: ranked[0].kind, name: ranked[0].name, confidence: ranked[0].prob,
    unclear: ranked[0].prob < Number(head.abstain_below ?? 0), ranked,
  };
}

export function formatScene(r) {
  const pct = `${(100 * r.confidence).toFixed(0)} %`;
  return r.unclear ? `${SCENE_UNCLEAR} (best guess ${r.name}, ${pct})` : `${r.name} (${pct})`;
}
