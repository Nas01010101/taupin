"""Soil organic matter for a baked field, from the soil map it already carries.

Each soil component brings the organic carbon of its surface layer (AAFC CanSIS layer table,
ORGCARB, % by weight). Organic matter = organic carbon x 1.724 (van Bemmelen factor; Nelson and
Sommers 1996 note the true ratio runs from about 1.7 to 2.0, so the value is a lower estimate).
A map unit takes the component mean weighted by the share of each component; a component with
no carbon value (the Dorval series is described from the survey report only) is left out and
the unit's covered share is kept. The result is an `om` raster on the 2 m grid, the mean per
scouting zone, and the mean of the low wet pocket and of the upland, which is what the RAP
wireworm factor "organic matter > 10 %" reads.

    python -m taupin.organic web/data/field.json web/data/fields/*/field.json
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np

OM_PER_OC = 1.724
RAP_OM_PCT = 10.0     # RAP wireworm risk factor (engine.wireworm_factors)
SRC = ("AAFC CanSIS soil layer table, Quebec v2r20130705, surface-layer organic carbon (ORGCARB) per soil "
       "component; organic matter = organic carbon x 1.724 (van Bemmelen; Nelson and Sommers 1996)")
_OC = re.compile(r"([\d.]+) % organic carbon")


def oc_of(comp: dict) -> float | None:
    """Organic carbon % of one component: the structured value, else the one in its texture text."""
    if comp.get("oc_pct") is not None:
        return float(comp["oc_pct"])
    m = _OC.search(comp.get("texture", ""))
    return float(m.group(1)) if m else None


def unit_om(unit: dict) -> tuple[float | None, int]:
    """(organic matter % of a map unit, % of the unit with a carbon value)."""
    got = [(c["pct"], oc_of(c)) for c in unit["components"] if c["name"] != "Water"]
    got = [(p, oc) for p, oc in got if oc is not None]
    cover = sum(p for p, _ in got)
    if not cover:
        return None, 0
    return round(OM_PER_OC * sum(p * oc for p, oc in got) / cover, 1), cover


def _read(field_dir: Path, layer: dict) -> np.ndarray:
    enc = layer["encoding"]
    q = np.frombuffer((field_dir / layer["file"]).read_bytes(), "<u1" if enc["dtype"] == "u1" else "<u2")
    a = enc["offset"] + enc["scale"] * q.astype(np.float64)
    a[q == enc["nodata"]] = np.nan
    return a.reshape(layer["size"], layer["size"])


def _mean(a: np.ndarray, m: np.ndarray) -> float | None:
    v = a[m & np.isfinite(a)]
    return round(float(v.mean()), 1) if v.size else None


def bake(field_json: Path) -> dict:
    """Add the `om` layer, per-component and per-unit values and the `organic` summary in place."""
    from .layers import encode
    d = json.loads(field_json.read_text())
    root = field_json.parent
    by = {l["key"]: l for l in d["layers"]}
    soil_l = by["soil"]
    soil = _read(root, soil_l)
    om = np.full(soil.shape, np.nan)
    for u in soil_l["classes"]:
        for c in u["components"]:
            oc = oc_of(c)
            if oc is not None:
                c["oc_pct"], c["om_pct"] = oc, round(OM_PER_OC * oc, 1)
        u["om_pct"], u["om_cover_pct"] = unit_om(u)
        if u["om_pct"] is not None:
            om[soil == u["id"]] = u["om_pct"]
    all_ = np.ones(soil.shape, bool)
    height = _read(root, by["height"])
    pocket = height <= d["pocket"]["height_max_m"]
    zone = _read(root, by["zones"]) if "zones" in by else None
    res = d["parcel"]["res_m"]
    mapped = np.isfinite(om)
    summary = {
        "field_om_pct": _mean(om, all_),
        "pocket_om_pct": _mean(om, pocket),
        "upland_om_pct": _mean(om, ~pocket),
        "mapped_ha": round(float(mapped.sum()) * res * res / 1e4, 1),
        "parcel_ha": d["parcel"]["area_ha"],
        "over_rap_ha": round(float((om > RAP_OM_PCT).sum()) * res * res / 1e4, 1),
        "rap_om_pct": RAP_OM_PCT,
        "zones": ([{"id": z["id"], "om_pct": _mean(om, zone == z["id"])} for z in by["zones"]["classes"]]
                  if zone is not None else []),
        "factor": OM_PER_OC,
        "source": SRC,
    }
    d["layers"] = [l for l in d["layers"] if l["key"] != "om"]
    if mapped.any():
        buf, enc = encode(om, "u1")
        (root / "layers" / "om.bin").write_bytes(buf)
        v = om[mapped]
        idx = next(i for i, l in enumerate(d["layers"]) if l["key"] == "soil") + 1
        d["layers"].insert(idx, {
            "key": "om", "file": "layers/om.bin", "size": int(om.shape[0]), "encoding": enc,
            "range": [round(float(v.min()), 2), round(float(v.max()), 2)], "name": "Organic matter",
            "unit": "% of the surface layer", "native_res_m": None, "grid_res_m": res, "source": SRC,
            "dates": soil_l.get("dates"), "note": "One value per soil map unit; the survey is not a lab test of this field"})
    d["organic"] = summary
    d.setdefault("sources", {})["organic"] = SRC
    field_json.write_text(json.dumps(d, ensure_ascii=False, separators=(",", ":")))
    return summary


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("fields", nargs="+", type=Path, help="field.json files baked by taupin.layers")
    for f in p.parse_args(argv).fields:
        print(f, bake(f))


if __name__ == "__main__":
    main()
