"""Scores the shipped scene head on embeddings from the CPU runtime and from onnxruntime-web (wasm), for
the test rows of data/scene_attribution.csv, and writes model/scene_wasm_check.json. The int8 model gives
slightly different embeddings per backend; this measures what that does to the head's decisions.

    node train/embed_ortweb.mjs ... (per manifest, after train/dump_inputs.py), then
    uv run python train/scene_wasm_check.py --cpu emb_insect.npz emb_scene.npz --wasm wasm/emb_insect.npz wasm/emb_scene.npz
"""
import argparse
import csv
import json

import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("--head", default="web/data/scene_head.json")
ap.add_argument("--att", default="data/scene_attribution.csv")
ap.add_argument("--cpu", nargs="+", required=True)
ap.add_argument("--wasm", nargs="+", required=True)
ap.add_argument("--out", default="model/scene_wasm_check.json")
a = ap.parse_args()

h = json.load(open(a.head))
ids = [c["id"] for c in h["classes"]]
W, b, mu, sc = (np.array(h[k]) for k in ("weights", "bias", "mean", "scale"))
T, thr = h["temperature"], h["abstain_below"]


def probs(e):
    z = (((e - mu) / sc) @ W.T + b) / T
    z -= z.max(1, keepdims=True)
    p = np.exp(z)
    return p / p.sum(1, keepdims=True)


def load(files):
    keys, embs = [], []
    for f in files:
        z = np.load(f, allow_pickle=True)
        keys += list(z["keys"])
        embs.append(z["emb"])
    return keys, np.concatenate(embs)


att = {r["key"]: r for r in csv.DictReader(open(a.att))}
kc, ec = load(a.cpu)
kw, ew = load(a.wasm)
assert kc == kw
idx = [i for i, k in enumerate(kc) if k in att and att[k]["split"] == "test"]
y = np.array([ids.index(att[kc[i]]["scene_class"]) for i in idx])
out = {"n_test": len(idx), "abstain_below": thr}
P = {}
for name, e in (("cpu", ec), ("wasm", ew)):
    p = probs(e[idx])
    P[name] = p
    pr, top = p.argmax(1), p.max(1)
    ans = top >= thr
    out[name] = {"accuracy": float((pr == y).mean()),
                 "macro_recall": float(np.mean([(pr[y == c] == c).mean() for c in range(len(ids))])),
                 "coverage": float(ans.mean()), "accuracy_when_answering": float((pr[ans] == y[ans]).mean()),
                 "recall": {c: float((pr[y == i] == i).mean()) for i, c in enumerate(ids)}}
cos = (ec[idx] * ew[idx]).sum(1) / np.linalg.norm(ec[idx], axis=1) / np.linalg.norm(ew[idx], axis=1)
out["embedding_cosine_min"], out["embedding_cosine_mean"] = float(cos.min()), float(cos.mean())
out["kind_agree"] = float((P["cpu"].argmax(1) == P["wasm"].argmax(1)).mean())
out["unclear_flip"] = float(((P["cpu"].max(1) < thr) != (P["wasm"].max(1) < thr)).mean())
out["max_abs_prob_diff"] = float(np.abs(P["cpu"] - P["wasm"]).max())
json.dump(out, open(a.out, "w"), indent=1)
print(json.dumps(out, indent=1))
