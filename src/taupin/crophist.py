"""Crop history of a field from the AAFC Annual Crop Inventory (ACI, 30 m, one map per year).

Each year's crop is the most common ACI class over the field's open cells. Two model inputs come
out of it: grass and forage years (wireworm habitat) and the run of corn years at the end of the
history (rootworm). The rotation the field has been following is the engine rotation whose
pattern, at any starting year, agrees with the most of the last five years.
"""
from __future__ import annotations

import numpy as np

from .engine import ROTATIONS

# ACI codes (AAFC class table) -> the crops the engine models, plus grass/forage.
GROUPS = {147: "corn", 158: "soybean", 140: "wheat", 145: "wheat", 146: "wheat", 195: "buckwheat",
          110: "forage", 122: "forage", 192: "forage"}
CROPLAND = set(GROUPS) | {120, 121, 131, 133, 136, 153, 162, 167, 175, 177}


def per_year(aci: np.ndarray, years: list[int], mask30: np.ndarray, names: dict) -> dict:
    """{year: {code, name, group, share}} for years whose majority class is a crop or forage."""
    out = {}
    for y, band in zip(years, aci):
        v = band[mask30 & (band > 0)]
        if not v.size:
            continue
        codes, counts = np.unique(v, return_counts=True)
        i = int(counts.argmax())
        code = int(codes[i])
        if code not in CROPLAND:
            continue
        out[int(y)] = {"code": code, "name": names.get(code, names.get(str(code), f"ACI class {code}")),
                       "group": GROUPS.get(code, "other"), "share": round(float(counts[i] / v.size), 2)}
    return out


def summary(hist: dict) -> dict:
    ys = sorted(hist)
    groups = [hist[y]["group"] for y in ys]
    last5 = groups[-5:]
    corn_run = 0
    for g in reversed(groups):
        if g != "corn":
            break
        corn_run += 1
    best, score = None, -1
    for k, rot in ROTATIONS.items():
        for s in range(len(rot)):
            cyc = [rot[(s + i) % len(rot)] for i in range(len(last5))]
            m = sum(a == b for a, b in zip(cyc, last5))
            if m > score:
                best, score = k, m
    return {"forage_years_last5": last5.count("forage"), "corn_run": corn_run,
            "rotation": best, "rotation_match": f"{score} of {len(last5)}", "last_year": ys[-1] if ys else None}
