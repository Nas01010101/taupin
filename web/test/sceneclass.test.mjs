import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkHead, classifyScene, formatScene, loadSceneHead, SCENE_UNCLEAR } from '../js/sceneclass.js';
import { loadModel, classifyPixels, classifyPixelsWithEmbedding } from '../js/model.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const json = p => JSON.parse(readFileSync(`${root}${p}`, 'utf8'));

// Three classes, two features: class i answers to feature i, "c" is the intercept-only class.
const tiny = (over = {}) => ({
  version: 't', embedding_dim: 2, classes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }],
  mean: [1, 1], scale: [2, 2], weights: [[1, 0], [0, 1], [0, 0]], bias: [0, 0, 0.5], temperature: 1, abstain_below: 0.6, ...over,
});

test('tiny head: standardise, linear, softmax', () => {
  const r = classifyScene(tiny(), [9, 1]);            // z = [4, 0] -> logits [4, 0, 0.5]
  const e = [Math.exp(4), 1, Math.exp(0.5)], t = e[0] + e[1] + e[2];
  assert.equal(r.kind, 'a');
  assert.ok(Math.abs(r.confidence - e[0] / t) < 1e-12);
  assert.deepEqual(r.ranked.map(x => x.kind), ['a', 'c', 'b']);
  assert.ok(Math.abs(r.ranked.reduce((s, x) => s + x.prob, 0) - 1) < 1e-12);
  assert.equal(r.unclear, false);
});

test('abstains below abstain_below and keeps the best guess', () => {
  const r = classifyScene(tiny(), [1, 1]);            // z = 0 -> logits [0, 0, 0.5]
  assert.equal(r.unclear, true);
  assert.equal(r.kind, 'c');
  assert.ok(formatScene(r).startsWith(SCENE_UNCLEAR));
  assert.equal(classifyScene(tiny({ abstain_below: 0 }), [1, 1]).unclear, false);
});

test('temperature flattens the probabilities', () => {
  assert.ok(classifyScene(tiny({ temperature: 4 }), [9, 1]).confidence < classifyScene(tiny(), [9, 1]).confidence);
});

test('accepts Float32Array input', () => {
  assert.equal(classifyScene(tiny(), Float32Array.from([1, 9])).kind, 'b');
});

test('bad embedding or head is rejected with a message', () => {
  assert.throws(() => classifyScene(tiny(), [1]), /2 values/);
  assert.throws(() => classifyScene(tiny(), [1, NaN]), /non-finite/);
  assert.throws(() => classifyScene(tiny(), null), /2 values/);
  assert.throws(() => checkHead({ classes: [] }), /contract/);
  assert.throws(() => checkHead(tiny({ scale: [1, 0] })), /contract/);
  assert.throws(() => checkHead(tiny({ weights: [[1, 0], [0, 1]] })), /contract/);
});

test('loadSceneHead reports a missing file and validates a present one', async () => {
  await assert.rejects(loadSceneHead({ fetchFn: async () => ({ ok: false, status: 404 }) }), /HTTP 404/);
  const h = await loadSceneHead({ fetchFn: async () => ({ ok: true, json: async () => tiny() }) });
  assert.equal(h.version, 't');
});

const shipped = json('web/data/scene_head.json');

test('shipped head matches its contract and the photo model embedding size', () => {
  checkHead(shipped);
  assert.equal(shipped.embedding_dim, 384);
  assert.deepEqual(shipped.classes.map(c => c.id), ['insect', 'standing_water', 'ground_cover', 'water_channel', 'other']);
  assert.ok(shipped.abstain_below > 0 && shipped.abstain_below < 1);
});

test('JS probabilities equal the Python ones for stored test embeddings', () => {
  const g = json('web/test/fixtures/scene_golden.json');
  assert.equal(g.head_version, shipped.version);
  for (const c of g.cases) {
    const r = classifyScene(shipped, c.embedding);
    for (const x of r.ranked) assert.ok(Math.abs(x.prob - c.probs[shipped.classes.findIndex(k => k.id === x.kind)]) < 1e-6, `${c.true} ${x.kind}`);
    assert.equal(r.kind, shipped.classes[c.probs.indexOf(Math.max(...c.probs))].id);
  }
});

test('the old model file keeps working: no embedding output gives null, same decision', async () => {
  const ort = await import(`${root}web/vendor/ort/ort.wasm.min.mjs`);
  const fx = p => `${root}tests/fixtures/${p}`;
  const fetchFn = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(fx('model/labels.json'), 'utf8')) });
  const m = await loadModel({ ort, fetchFn, wasmPaths: `${root}web/vendor/ort/`, modelBytes: readFileSync(fx('model/taupin.onnx')) });
  const px = new Uint8ClampedArray(40 * 30 * 4);
  for (let i = 0; i < 40 * 30; i++) px.set([230, 20, 20, 255], i * 4);
  const both = await classifyPixelsWithEmbedding(m, px, 40, 30);
  assert.equal(both.embedding, null);
  assert.deepEqual(both.result, await classifyPixels(m, px, 40, 30));
});

test('shipped photo model returns logits first and a 384-d embedding second', { skip: !existsSync(`${root}model/taupin.onnx`) }, async () => {
  const ort = await import(`${root}web/vendor/ort/ort.wasm.min.mjs`);
  const labels = json('model/labels.json');
  const fetchFn = async () => ({ ok: true, json: async () => labels });
  const m = await loadModel({ ort, fetchFn, wasmPaths: `${root}web/vendor/ort/`, modelBytes: readFileSync(`${root}model/taupin.onnx`) });
  assert.equal(m.status, 'ready', m.reason);
  assert.deepEqual(m.session.outputNames, ['logits', 'embedding']);
  const px = new Uint8ClampedArray(64 * 48 * 4);
  for (let i = 0; i < 64 * 48; i++) px.set([(i * 7) % 256, (i * 3) % 256, 90, 255], i * 4);
  const { result, embedding } = await classifyPixelsWithEmbedding(m, px, 64, 48);
  assert.equal(embedding.length, 384);
  assert.ok(embedding.every(Number.isFinite));
  assert.equal(result.top.length, 3);
  const s = classifyScene(shipped, embedding);
  assert.equal(s.ranked.length, 5);
});
