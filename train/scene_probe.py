"""Fit the scene-kind head on the photo model's embedding, evaluate it, write the weights.

Reads data/scene_attribution.csv (splits from train/scene_split.py) and the .npz files from
train/scene_embed.py. Fits a multinomial logistic regression on standardised 384-d embeddings
(train split only); the regularisation C, the temperature and the abstain threshold are chosen
on the val split; the test split is read once, after that. Writes web/data/scene_head.json,
model/scene_metrics.json and, with --golden, a JS parity fixture.

    uv run --no-project --with numpy --with scikit-learn --with scipy python train/scene_probe.py \
        --emb A.npz B.npz --out-head web/data/scene_head.json --out-metrics model/scene_metrics.json
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy.optimize import minimize_scalar
from scipy.special import log_softmax, softmax
from sklearn.linear_model import LogisticRegression

CLASSES = [("insect", "Insect or soil animal"), ("standing_water", "Standing water"), ("ground_cover", "Ground cover"),
           ("water_channel", "Water channel or erosion"), ("other", "Other")]
IDS = [c[0] for c in CLASSES]
TARGET = 0.95  # answered accuracy on val that fixes the abstain threshold


def load(att_path, emb_paths):
    rows = list(csv.DictReader(open(att_path)))
    emb, keys = {}, []
    for p in emb_paths:
        z = np.load(p)
        for k, e in zip(z["keys"], z["emb"]):
            emb[str(k)] = e
    rows = [r for r in rows if r["key"] in emb]
    X = np.stack([emb[r["key"]] for r in rows]).astype(np.float64)
    y = np.array([IDS.index(r["scene_class"]) for r in rows])
    sp = np.array([r["split"] for r in rows])
    return rows, X, y, sp


def fit(X, y, mu, sd, C):
    m = LogisticRegression(C=C, max_iter=3000, class_weight="balanced")
    m.fit((X - mu) / sd, y)
    return m


def logits_of(m, X, mu, sd):
    return m.decision_function((X - mu) / sd)


def nll(lg, y, T=1.0):
    return float(-log_softmax(lg / T, axis=1)[np.arange(len(y)), y].mean())


def pick_threshold(p, y, target):
    """Lowest top-1 probability whose answered images reach `target` accuracy (1e-9 grid)."""
    top, hit = p.max(1), p.argmax(1) == y
    best = 1.0
    for t in sorted(set(np.round(top, 6))):
        sel = top >= t
        if sel.sum() >= 20 and hit[sel].mean() >= target:
            best = float(t)
            break
    return best


def metrics(p, y, thr, boots=2000, seed=0):
    pred = p.argmax(1)
    k = len(IDS)
    cm = np.zeros((k, k), int)
    for t, q in zip(y, pred):
        cm[t, q] += 1
    per = {}
    for i, c in enumerate(IDS):
        n, ok = int(cm[i].sum()), int(cm[i, i])
        pc = int(cm[:, i].sum())
        per[c] = {"n": n, "correct": ok, "recall": ok / n if n else None,
                  "precision": ok / pc if pc else None}
    rec = [v["recall"] for v in per.values() if v["recall"] is not None]
    rng = np.random.default_rng(seed)
    accs = [float((pred[i] == y[i]).mean()) for i in (rng.integers(0, len(y), len(y)) for _ in range(boots))]
    top = p.max(1)
    ans = top >= thr
    return {"n": int(len(y)), "accuracy": float((pred == y).mean()),
            "accuracy_ci95": [float(np.percentile(accs, 2.5)), float(np.percentile(accs, 97.5))],
            "macro_recall": float(np.mean(rec)), "per_class": per, "confusion": cm.tolist(),
            "abstain_below": thr, "coverage": float(ans.mean()),
            "answered": int(ans.sum()), "accuracy_when_answering": float((pred[ans] == y[ans]).mean()) if ans.any() else None,
            "per_class_answered": {c: {"n": int(((y == i) & ans).sum()),
                                        "correct": int(((y == i) & ans & (pred == i)).sum())} for i, c in enumerate(IDS)}}


def run_once(X, y, sp, Cs=(0.003, 0.01, 0.03, 0.1, 0.3, 1.0)):
    tr, va = sp == "train", sp == "val"
    mu, sd = X[tr].mean(0), X[tr].std(0) + 1e-6
    best = None
    for C in Cs:
        m = fit(X[tr], y[tr], mu, sd, C)
        v = nll(logits_of(m, X[va], mu, sd), y[va])
        if best is None or v < best[0]:
            best = (v, C, m)
    _, C, m = best
    lv = logits_of(m, X[va], mu, sd)
    T = float(minimize_scalar(lambda t: nll(lv, y[va], t), bounds=(0.2, 5.0), method="bounded").x)
    thr = pick_threshold(softmax(lv / T, axis=1), y[va], TARGET)
    return m, mu, sd, C, T, thr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--att", default="data/scene_attribution.csv")
    ap.add_argument("--emb", nargs="+", required=True)
    ap.add_argument("--field", help="npz of field photos to run the head on")
    ap.add_argument("--out-head", required=True)
    ap.add_argument("--out-metrics", required=True)
    ap.add_argument("--golden", help="write a JS parity fixture here")
    ap.add_argument("--base-model-sha256", default="")
    a = ap.parse_args()
    rows, X, y, sp = load(a.att, a.emb)
    counts = {c: {s: int(((y == i) & (sp == s)).sum()) for s in ("train", "val", "test")} for i, c in enumerate(IDS)}
    m, mu, sd, C, T, thr = run_once(X, y, sp)
    va, te = sp == "val", sp == "test"
    P = lambda M: softmax(logits_of(m, M, mu, sd) / T, axis=1)  # noqa: E731
    out = {"classes": IDS, "counts": counts, "C": C, "temperature": T, "abstain_target_val_accuracy": TARGET,
           "val": metrics(P(X[va]), y[va], thr), "test": None}
    out["test"] = metrics(P(X[te]), y[te], thr)
    # test split by source set: insect test rows are the ood set; the others are held-out authors
    ins = y == IDS.index("insect")
    out["test_insect_ood"] = metrics(P(X[te & ins]), y[te & ins], thr)
    out["test_scene_authors"] = metrics(P(X[te & ~ins]), y[te & ~ins], thr)
    # threshold table
    tab = []
    for tgt in (0.90, 0.95, 0.98):
        t_ = pick_threshold(P(X[va]), y[va], tgt)
        mt = metrics(P(X[te]), y[te], t_, boots=1)
        mv = metrics(P(X[va]), y[va], t_, boots=1)
        tab.append({"target": tgt, "threshold": t_, "val_coverage": mv["coverage"], "val_acc": mv["accuracy_when_answering"],
                    "test_coverage": mt["coverage"], "test_acc": mt["accuracy_when_answering"]})
    out["threshold_table"] = tab
    # per source group recall on test (rows of that group)
    grp = {}
    te_rows = [r for r, s in zip(rows, sp) if s == "test"]
    pt = P(X[te]).argmax(1)
    for r, q, t in zip(te_rows, pt, y[te]):
        g = grp.setdefault(f"{r['scene_class']} | {r['group'][:40]}", [0, 0])
        g[0] += 1
        g[1] += int(q == t)
    out["test_by_group"] = {k: {"n": v[0], "correct": v[1]} for k, v in sorted(grp.items())}
    # leave one source group out (non-insect groups with >= 15 images): train on all other train+val rows
    loo = {}
    gname = np.array([f"{r['scene_class']} | {r['group'][:40]}" for r in rows])
    for g in sorted(set(gname)):
        if g.startswith("insect"):
            continue
        sel = gname == g
        if sel.sum() < 15:
            continue
        trn = ~sel & (sp != "test")
        mu2, sd2 = X[trn].mean(0), X[trn].std(0) + 1e-6
        m2 = fit(X[trn], y[trn], mu2, sd2, C)
        pr = m2.predict((X[sel] - mu2) / sd2)
        loo[g] = {"n": int(sel.sum()), "correct": int((pr == y[sel]).sum())}
    out["leave_one_group_out"] = loo
    # dispersion: 5 re-splits of authors (non-insect rows); insect split fixed
    disp = []
    for salt in ("a", "b", "c", "d", "e"):
        sp2 = sp.copy()
        for i, r in enumerate(rows):
            if r["scene_class"] != "insect":
                h = int(hashlib.sha256((f"taupin-scene-resplit-{salt}" + r["author"]).encode()).hexdigest(), 16) % 100
                sp2[i] = "train" if h < 70 else ("val" if h < 85 else "test")
        m2, mu2, sd2, C2, T2, thr2 = run_once(X, y, sp2)
        p2 = softmax(logits_of(m2, X[sp2 == "test"], mu2, sd2) / T2, axis=1)
        mm = metrics(p2, y[sp2 == "test"], thr2, boots=1)
        disp.append({"salt": salt, "n_test": mm["n"], "accuracy": mm["accuracy"], "macro_recall": mm["macro_recall"],
                     "coverage": mm["coverage"], "acc_answered": mm["accuracy_when_answering"],
                     "recall": {c: v["recall"] for c, v in mm["per_class"].items()}})
    out["resplits"] = disp
    # head
    head = {"version": "scene-v1", "base_model": "v2-dinov2s", "base_model_sha256": a.base_model_sha256,
            "embedding_dim": int(X.shape[1]), "classes": [{"id": i, "name": n} for i, n in CLASSES],
            "mean": [float(f"{v:.7g}") for v in mu], "scale": [float(f"{v:.7g}") for v in sd],
            "weights": [[float(f"{v:.7g}") for v in r] for r in m.coef_],
            "bias": [float(f"{v:.7g}") for v in m.intercept_],
            "temperature": float(f"{T:.7g}"), "abstain_below": float(f"{thr:.7g}"),
            "abstain_rule": f"lowest top-1 probability at which val accuracy of answered images is at least {TARGET}",
            "train_counts": {c: counts[c]["train"] for c in IDS}}
    Path(a.out_head).write_text(json.dumps(head, separators=(",", ":")))
    Path(a.out_metrics).write_text(json.dumps(out, indent=1))
    # JS parity fixture: 4 test embeddings and the Python probabilities from the written (rounded) weights
    if a.golden:
        W, b = np.array(head["weights"]), np.array(head["bias"])
        mu_, sc_ = np.array(head["mean"]), np.array(head["scale"])
        idx = [int(np.where(te & (y == i))[0][0]) for i in range(len(IDS))]
        fx = []
        for i in idx:
            pz = softmax(((W @ ((X[i] - mu_) / sc_)) + b) / head["temperature"])
            fx.append({"true": IDS[y[i]], "embedding": [float(f"{v:.7g}") for v in X[i]], "probs": [float(v) for v in pz]})
        Path(a.golden).write_text(json.dumps({"head_version": head["version"], "cases": fx}, separators=(",", ":")))
    if a.field:
        z = np.load(a.field)
        pf = softmax(logits_of(m, z["emb"].astype(np.float64), mu, sd) / T, axis=1)
        field = {str(k): {"kind": IDS[int(p.argmax())], "confidence": float(p.max()), "unclear": bool(p.max() < thr),
                          "probs": {c: float(v) for c, v in zip(IDS, p)}} for k, p in zip(z["keys"], pf)}
        out["field_photos"] = field
        Path(a.out_metrics).write_text(json.dumps(out, indent=1))
    print(json.dumps({k: out[k] for k in ("counts", "C", "temperature")}))
    for s in ("val", "test", "test_insect_ood", "test_scene_authors"):
        print(s, "n", out[s]["n"], "acc %.3f" % out[s]["accuracy"], "macro_recall %.3f" % out[s]["macro_recall"],
              "cov %.3f" % out[s]["coverage"], "acc_ans", out[s]["accuracy_when_answering"],
              {c: f"{v['correct']}/{v['n']}" for c, v in out[s]["per_class"].items()})
    print("abstain_below", thr)
    print(json.dumps(out["threshold_table"]))
    print("resplits", [(d["accuracy"].__round__(3), d["macro_recall"].__round__(3)) for d in disp])
    if a.field:
        print(json.dumps(out["field_photos"], indent=1))


if __name__ == "__main__":
    main()
