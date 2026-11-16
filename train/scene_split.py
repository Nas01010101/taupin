"""Build data/scene_attribution.csv: one row per image of the scene-kind probe, with its split.

Classes: insect (insects and other soil animals), standing_water, ground_cover, water_channel, other.
- insect rows come from the existing photo-model data and never from its sealed test split:
  the iNaturalist `val` rows (the photo model was never trained on them) are split by observer
  into scene train / val; the `ood` rows (GBIF and Commons, other sources) are the scene test.
  Plant and fungus rows of the old "other" class are left out of the insect class.
- the other four classes are Wikimedia Commons files (and iNaturalist plants and fungi for
  "other") from train/fetch_scene.py plus Openverse Flickr files from train/fetch_scene_openverse.py,
  split by author (balanced to about 60 / 20 / 20 into train / val / test, see
  balanced_author_split) so no photographer is on two sides. data/scene_exclude.csv lists the
  files removed after looking at every image. Near-duplicates (64-bit dHash, Hamming <= 6) across
  splits are dropped from the later split.

    uv run --no-project --with pillow python train/scene_split.py --scene-root R --photo-root P --out data
"""
import argparse
import csv
import hashlib
import json
from pathlib import Path

from split import dhash

DUP_BITS = 6
FIELDS = ["key", "scene_class", "split", "store", "file", "source", "source_id", "photo_id", "url", "author", "licence",
          "group", "title", "page", "orig_split", "orig_class"]


def author_split(author, salt):
    h = int(hashlib.sha256((salt + author).encode()).hexdigest(), 16) % 100
    return "train" if h < 70 else ("val" if h < 85 else "test")


TARGET = {"train": 0.6, "val": 0.2, "test": 0.2}


def balanced_author_split(rows):
    """Assign each author wholly to one split so every class lands near 60 / 20 / 20.

    Authors are taken largest first and each goes to the split whose per-class shortfall
    against the target is largest; ties resolve by a hash of the author, so the result is
    deterministic. Hashing alone left 5 to 8 validation images per class.
    """
    by_author = {}
    for r in rows:
        by_author.setdefault(r["author"], []).append(r["scene_class"])
    tot = {}
    for r in rows:
        tot[r["scene_class"]] = tot.get(r["scene_class"], 0) + 1
    have = {sp: {c: 0 for c in tot} for sp in TARGET}
    out = {}
    for a, cls in sorted(by_author.items(), key=lambda kv: (-len(kv[1]), hashlib.sha256(kv[0].encode()).hexdigest())):
        def gain(sp):
            return sum(min(have[sp][c] + cls.count(c), TARGET[sp] * tot[c]) - min(have[sp][c], TARGET[sp] * tot[c])
                       for c in tot) / TARGET[sp]
        sp = max(TARGET, key=lambda sp: (round(gain(sp), 6), TARGET[sp]))
        out[a] = sp
        for c in cls:
            have[sp][c] += 1
    return out


def build(scene_root, photo_root, repo, salt="taupin-scene-v1"):
    rows = []
    excl = {r["photo_id"] for r in csv.DictReader((repo / "data" / "scene_exclude.csv").open())}  # removed after a visual audit
    recs = list(csv.DictReader((scene_root / "scene_records.csv").open()))
    ov = scene_root / "scene_records_ov.csv"
    if ov.exists():
        recs += list(csv.DictReader(ov.open()))
    recs = [r for r in recs if r["photo_id"] not in excl]
    sp_of = balanced_author_split(recs)
    for r in recs:
        rows.append({**r, "key": r["photo_id"], "store": "scene", "file": f"img/{r['photo_id']}.jpg",
                     "split": sp_of[r["author"]], "orig_split": "", "orig_class": ""})
    ic = json.load((scene_root / "iconic.json").open())
    rec = {r["photo_id"]: r for r in csv.DictReader((photo_root / "inat_records.csv").open())}
    ins = []
    for r in csv.DictReader((repo / "data" / "attribution.csv").open()):
        if r["split"] == "test":
            continue  # sealed holdout of the 8-class model
        if r["split"] == "val":
            if r["class"] == "other" and ic.get(rec[r["photo_id"]]["taxon_id"]) in ("Plantae", "Fungi"):
                continue
            sp = author_split(r["user_id"], salt)
            sp = "val" if sp == "test" else sp  # observers hashed to "test" go to val: the insect test is the ood set
        elif r["split"] == "ood":
            if r["class"] == "other" and r["taxon_name"] == "Soil":
                continue
            sp = "test"
        else:
            continue  # train rows: the photo model was fitted on them
        ins.append({"key": f"insect_{r['split']}_{r['photo_id']}", "scene_class": "insect", "split": sp, "store": "photo",
                    "file": r["file"], "source": r["source"], "source_id": r["source_id"], "photo_id": r["photo_id"],
                    "url": r["url"], "author": r["author"], "licence": r["licence"], "group": r["dataset"] or r["source"],
                    "title": r["taxon_name"], "page": "", "orig_split": r["split"], "orig_class": r["class"]})
    # near-duplicate removal among the scene-class rows (split order train < val < test)
    bank, kept, dropped = [], [], 0
    order = {"train": 0, "val": 1, "test": 2}
    for r in sorted(rows, key=lambda r: order[r["split"]]):
        h = dhash((scene_root if r["store"] == "scene" else photo_root) / r["file"])
        if h is None:
            dropped += 1
            continue
        if any((h ^ bh).bit_count() <= DUP_BITS and bs != r["split"] for bh, bs in bank):
            dropped += 1
            continue
        bank.append((h, r["split"]))
        kept.append(r)
    return kept + ins, dropped


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene-root", type=Path, required=True)
    ap.add_argument("--photo-root", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args()
    repo = Path(__file__).resolve().parent.parent
    rows, dropped = build(a.scene_root, a.photo_root, repo)
    with (a.out / "scene_attribution.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    c = {}
    for r in rows:
        c.setdefault(r["scene_class"], {}).setdefault(r["split"], 0)
        c[r["scene_class"]][r["split"]] += 1
    for k, v in c.items():
        print(k, v)
    print("dropped (unreadable or near-duplicate across splits):", dropped)


if __name__ == "__main__":
    main()
