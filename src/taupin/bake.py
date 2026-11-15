"""Bake NASA POWER soil temperature and the risk matrix into small static files for web/.

Input: a POWER daily JSON that carries TSOIL1. The field layers (field.json, layers/) come from
`taupin.layers`.
Outputs in web/data/:
  soil.json    trap window per year, 12 C trend, Mar-Jul daily TSOIL1 for the recent years
  risk.json    7 rotations x 5 years wireworm / corn rootworm levels for two soil zones and two
               evidence scenarios, every line with its source (taupin.engine)
  fields/<id>/risk.json  the same for each baked farm field, its earlier years taken from the
               field's crop history (field.json "crops", AAFC Annual Crop Inventory) instead
               of the park's three years of sod (--fields)
weather.json (GPM IMERG rain, air temperature) and smap.json come from `taupin.weather` and
`taupin.smap`; crops.json and rotations.json are written by hand, a source key per value.

    uv run --extra bake python -m taupin.bake \
        --tsoil ../wireworm-risk-twin/data/power_daily.json
    uv run python -m taupin.bake --fields
"""
from __future__ import annotations

import argparse
import json
from dataclasses import asdict
from pathlib import Path

from . import engine, soil

ROOT = Path(__file__).resolve().parents[2]
START_YEAR = 2026
RECENT = [2021, 2022, 2023, 2024, 2025]
# Two zones of the same parcel. OM 12 % in the low pocket is a scenario to be measured, not data.
ZONES = {
    "upland": {"label": "Upland, clay-loam, OM 5 %", "field": engine.Field("clay-loam", 5.0)},
    "pocket": {"label": "Low wet pocket, clay-loam, OM 12 % (to be measured)",
               "field": engine.Field("clay-loam", 12.0)},
}


def load_power_param(path: Path, name: str) -> dict:
    """Accept both the POWER API GeoJSON ({properties: {parameter: ...}}) and a flat dict."""
    d = json.loads(path.read_text())
    params = d.get("properties", {}).get("parameter", d)
    if name not in params:
        raise KeyError(f"{path} has no {name}; fetch it with scripts/fetch_power.py")
    return params[name]


# Crop-history groups (taupin.crophist) -> engine crop names. Hay and pasture are grass, as sod.
ENGINE_CROP = {"corn": "corn", "soybean": "soybean", "wheat": "wheat", "buckwheat": "buckwheat",
               "forage": "sod", "oat": "oat", "barley": "barley", "rye": "rye", "canola": "canola"}
PARK_PRIOR = ("sod", "sod", "sod")   # the demo park is a meadow: three years of sod, sod last year


def field_history(crops: dict, start_year: int = START_YEAR) -> dict:
    """Engine inputs from a baked field's crop history (field.json "crops"): the crops before
    start_year, oldest first, and the years since the last hay or pasture year. With no hay or
    pasture in the record, the count runs from the first recorded year, so it is a lower bound."""
    ys = sorted(crops["per_year"], key=int)
    prior = [ENGINE_CROP.get(crops["per_year"][y]["group"], "other") for y in ys]
    sod = [int(y) for y in ys if crops["per_year"][y]["group"] == "forage"]
    since = start_year - max(sod) if sod else start_year - int(ys[0]) + 1
    return {"prior": prior, "years_since_sod": since, "years": [int(ys[0]), int(ys[-1])],
            "sod_in_record": bool(sod), "source": crops.get("source", "")}


def risk_matrix(history: dict | None = None) -> dict:
    """{zone: {scenario: {rotation: [YearRisk dict]}}}. The `trap_threshold` scenario feeds the
    engine a first-year bait-trap mean equal to the RAP threshold of the dominant genus. Without
    `history` the earlier years are the park's sod; with it (field_history) they are the field's."""
    prior = tuple(history["prior"]) if history else PARK_PRIOR
    since = history["years_since_sod"] if history else 1
    out = {}
    for zk, z in ZONES.items():
        fld = z["field"]
        thr = engine.TRAP_THRESHOLD[fld.dominant_genus]
        scen = {"baseline": {}, "trap_threshold": {}}
        for rk, crops in engine.ROTATIONS.items():
            scen["baseline"][rk] = [asdict(r) for r in engine.plan_rotation(
                crops, fld, START_YEAR, years_since_sod=since, prior=prior)]
            scen["trap_threshold"][rk] = [asdict(r) for r in engine.plan_rotation(
                crops, fld, START_YEAR, years_since_sod=since, prior=prior, traps={START_YEAR: thr})]
        label = z["label"] + (f"; earlier crops from the field's crop history, {history['years'][0]} to "
                              f"{history['years'][1]}" if history else "")
        out[zk] = {"label": label, "dominant_genus": fld.dominant_genus, "trap_threshold": thr,
                   "field": asdict(fld), "scenarios": scen}
    # The rule constants and the start (prior crops, years since sod) travel with the matrix, so the
    # page's port of the engine (web/js/engine.js) scores the farmer's own rotations, and a crop
    # history the farmer enters, from the same values as this file.
    rules = {"grass": sorted(engine.GRASS), "prescription_crops": sorted(engine.PRESCRIPTION_CROPS),
             "trap_threshold": engine.TRAP_THRESHOLD, "levels": engine.LEVELS,
             "default_prior": list(prior), "default_years_since_sod": since}
    res = {"start_year": START_YEAR, "rotations": {k: v for k, v in engine.ROTATIONS.items()},
           "zones": out, "rules": rules, "sources": engine.SRC}
    if history:
        res["history"] = history
    return res


def bake_field_risks(fields_dir: Path) -> dict:
    """Write fields/<id>/risk.json for every baked field in fields/index.json that has a crop
    history. Returns {id: path written}."""
    written = {}
    for f in json.loads((fields_dir / "index.json").read_text(encoding="utf-8")):
        fj = json.loads((fields_dir / f["id"] / "field.json").read_text(encoding="utf-8"))
        if not fj.get("crops"):
            continue
        path = fields_dir / f["id"] / "risk.json"
        path.write_text(json.dumps(risk_matrix(field_history(fj["crops"])), separators=(",", ":")))
        written[f["id"]] = path
    return written


def bake_soil(tsoil_json: Path, out: Path) -> dict:
    series = soil.parse_series(load_power_param(tsoil_json, "TSOIL1"))
    years = sorted({d.year for d, _ in series})
    full = [y for y in years if any(d.month == 12 for d, _ in series if d.year == y)]
    summary = soil.soil_summary(series, full, RECENT)
    (out / "soil.json").write_text(json.dumps(summary, separators=(",", ":")))
    return summary


def main(argv=None) -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--tsoil", type=Path, help="POWER daily JSON with TSOIL1: bakes soil.json and risk.json")
    p.add_argument("--fields", action="store_true", help="bake fields/<id>/risk.json from each field's crop history")
    p.add_argument("--out", type=Path, default=ROOT / "web" / "data")
    a = p.parse_args(argv)
    if not a.tsoil and not a.fields:
        p.error("give --tsoil, --fields or both")
    a.out.mkdir(parents=True, exist_ok=True)
    if a.tsoil:
        s = bake_soil(a.tsoil, a.out)
        (a.out / "risk.json").write_text(json.dumps(risk_matrix(), separators=(",", ":")))
        print("trap 12C mean", s["trap_12C_mean"], "trend d/decade", s["trap_12C_trend_days_per_decade"],
              "+/-", s["trap_12C_trend_95ci_days_per_decade"])
    if a.fields:
        for fid, path in bake_field_risks(a.out / "fields").items():
            print("field risk", fid, path)


if __name__ == "__main__":
    main()
