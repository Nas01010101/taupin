"""Cases that pin the page's port of the engine (web/js/engine.js) to this Python engine.

`python -m taupin.engine_parity` writes web/test/fixtures/engine_parity.json; tests/test_engine_parity.py
checks the committed file still equals what the engine gives, and web/test/engine.test.mjs checks
the JavaScript port gives the same. Two parts:
- every 5-year sequence of the crops the soil and water columns know (web/data/crops.json), one crop
  per engine class (barley and oats score as wheat, canola as soybean), in both zones, as compact levels;
- 80 seeded cases over all engine crops, soils, histories, sod years and trap means, with traces.
"""
import itertools
import json
import random
from dataclasses import asdict
from pathlib import Path

from . import bake, engine

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "test" / "fixtures" / "engine_parity.json"
SEED = 20261115


def _compact(rows) -> str:
    """One year as WIREWORM/ROOTWORM/prescription, e.g. 'M/N/0'; years joined by spaces."""
    return " ".join(f"{r.wireworm[0]}/{r.corn_rootworm[0]}/{int(r.prescription_supportable)}" for r in rows)


def _engine_class(crop: str) -> tuple:
    """What the engine looks at in a crop name; two crops with the same class score the same."""
    return (crop in engine.GRASS, crop in engine.PRESCRIPTION_CROPS, crop == "corn", crop == "buckwheat")


def cases() -> dict:
    known = json.loads((ROOT / "web" / "data" / "crops.json").read_text())["crops"]
    # First crop of each engine class in crops.json order (corn, soybean, wheat, ..., buckwheat).
    reps = {}
    for c in known:
        reps.setdefault(_engine_class(c), c)
    crops = sorted(reps.values())
    exhaustive = []
    for zk, z in bake.ZONES.items():
        for seq in itertools.product(crops, repeat=5):
            exhaustive.append({"zone": zk, "crops": list(seq),
                               "levels": _compact(engine.plan_rotation(list(seq), z["field"], bake.START_YEAR))})
    rng = random.Random(SEED)
    all_crops = sorted(engine.GRASS | engine.PRESCRIPTION_CROPS | {"buckwheat"})
    random_cases = []
    for _ in range(80):
        fld = engine.Field(rng.choice(["clay-loam", "sand", "loamy-sand", "organic"]),
                           rng.choice([3.0, 5.0, 10.0, 12.5]), rng.choice(sorted(engine.TRAP_THRESHOLD)))
        seq = [rng.choice(all_crops) for _ in range(5)]
        prior = [rng.choice(all_crops) for _ in range(3)]
        ysod = rng.randint(1, 6)
        traps = {bake.START_YEAR + rng.randint(0, 4): rng.choice([0.0, 0.5, 1.0, 1.5, 3.0, 4.25])} if rng.random() < 0.6 else {}
        rows = engine.plan_rotation(seq, fld, bake.START_YEAR, years_since_sod=ysod, prior=tuple(prior), traps=traps)
        random_cases.append({"field": asdict(fld), "crops": seq, "prior": prior, "years_since_sod": ysod,
                             "traps": {str(k): v for k, v in traps.items()}, "expected": [asdict(r) for r in rows]})
    return {"start_year": bake.START_YEAR, "exhaustive": exhaustive, "random": random_cases}


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(cases(), separators=(",", ":")))
    print(OUT)


if __name__ == "__main__":
    main()
