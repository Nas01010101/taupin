"""Embed images with the shipped photo model (int8 ONNX, output `embedding`, 384-d) using the
same preprocessing as the browser (src/taupin/classify.py), in small batches.

Manifest CSV: columns `key`,`path`. Output .npz: keys, emb [N,384] float32, logits [N,8].
With --orig, the first --check images are also run through the original single-output model and
the logits compared, which is the evidence that adding the output did not change the classifier.

    uv run python train/scene_embed.py --model model/taupin.onnx --manifest m.csv --out e.npz
"""
import argparse
import csv
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

from taupin.classify import preprocess


def load_rgb(path):
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGB")
        if max(im.size) > 1600:  # keep the CPU resize cheap; the model sees 224 px anyway
            im.thumbnail((1600, 1600), Image.BILINEAR)
        return np.asarray(im)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--labels", default="model/labels.json")
    ap.add_argument("--manifest", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--orig")
    ap.add_argument("--check", type=int, default=200)
    ap.add_argument("--batch", type=int, default=16)
    a = ap.parse_args()
    labels = json.load(open(a.labels))
    so = ort.SessionOptions()
    so.intra_op_num_threads = 4
    sess = ort.InferenceSession(a.model, so, providers=["CPUExecutionProvider"])
    names = [o.name for o in sess.get_outputs()]
    assert names == ["logits", "embedding"], names
    orig = ort.InferenceSession(a.orig, so, providers=["CPUExecutionProvider"]) if a.orig else None
    rows = list(csv.DictReader(open(a.manifest)))
    keys, embs, logs, bad, maxdiff, agree, nchk = [], [], [], [], 0.0, 0, 0
    for i in range(0, len(rows), a.batch):
        xs, ks = [], []
        for r in rows[i:i + a.batch]:
            try:
                xs.append(preprocess(load_rgb(r["path"]), labels)[0])
                ks.append(r["key"])
            except Exception as e:
                bad.append((r["key"], str(e)))
        if not xs:
            continue
        x = np.stack(xs)
        lg, em = sess.run(None, {"image": x})
        keys += ks; embs.append(em); logs.append(lg)
        if orig is not None and nchk < a.check:
            ref = orig.run(None, {"image": x})[0]
            maxdiff = max(maxdiff, float(np.abs(ref - lg).max()))
            agree += int((ref.argmax(1) == lg.argmax(1)).sum()); nchk += len(ks)
        if (i // a.batch) % 20 == 0:
            print(i, len(rows), flush=True)
    np.savez(a.out, keys=np.array(keys), emb=np.concatenate(embs).astype(np.float32), logits=np.concatenate(logs).astype(np.float32))
    print(json.dumps({"embedded": len(keys), "unreadable": len(bad), "logit_check_images": nchk,
                      "max_abs_logit_diff_vs_original": maxdiff, "top1_agree": agree}))
    for b in bad[:10]:
        print("bad", b)


if __name__ == "__main__":
    main()
