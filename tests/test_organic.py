"""Organic matter from the soil map: component carbon, unit means and the baked summary."""
import json
from pathlib import Path

import pytest

np = pytest.importorskip("numpy")
from taupin import organic  # noqa: E402

WEB = Path(__file__).resolve().parents[1] / "web" / "data"


def test_component_carbon_from_value_or_texture():
    assert organic.oc_of({"oc_pct": 2.5}) == 2.5
    assert organic.oc_of({"texture": "clay loam, 3.1 % organic carbon"}) == 3.1
    assert organic.oc_of({"texture": "clay"}) is None


def test_unit_mean_skips_missing_and_water():
    u = {"components": [{"name": "A", "pct": 60, "oc_pct": 2.0}, {"name": "B", "pct": 30},
                        {"name": "Water", "pct": 10, "oc_pct": 99}]}
    om, cover = organic.unit_om(u)
    assert cover == 60 and om == round(1.724 * 2.0, 1)
    assert organic.unit_om({"components": [{"name": "B", "pct": 100}]}) == (None, 0)


@pytest.mark.parametrize("path", ["field.json", "fields/eustache/field.json"])
def test_baked_fields_carry_om_layer_and_summary(path):
    d = json.loads((WEB / path).read_text())
    org = d["organic"]
    assert org["factor"] == 1.724 and org["rap_om_pct"] == 10.0
    assert 0 < org["mapped_ha"] <= org["parcel_ha"]
    om = next(l for l in d["layers"] if l["key"] == "om")
    assert (WEB / path).parent.joinpath(om["file"]).stat().st_size == om["size"] ** 2
    lo, hi = om["range"]
    assert lo <= org["field_om_pct"] <= hi


def test_bake_is_idempotent(tmp_path):
    src = WEB / "fields" / "eustache"
    (tmp_path / "layers").mkdir()
    d = json.loads((src / "field.json").read_text())
    for l in d["layers"]:
        (tmp_path / l["file"]).write_bytes((src / l["file"]).read_bytes())
    (tmp_path / "field.json").write_text(json.dumps(d))
    a = organic.bake(tmp_path / "field.json")
    b = organic.bake(tmp_path / "field.json")
    assert a == b
    keys = [l["key"] for l in json.loads((tmp_path / "field.json").read_text())["layers"]]
    assert keys.count("om") == 1 and keys.index("om") == keys.index("soil") + 1
