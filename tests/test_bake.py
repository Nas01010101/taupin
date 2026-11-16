import json
from pathlib import Path

import pytest

from taupin import bake, engine

WEB_DATA = Path(__file__).resolve().parents[1] / "web" / "data"


def test_risk_matrix_covers_three_rotations_five_years_with_sources():
    m = bake.risk_matrix()
    assert set(m["zones"]) == {"upland", "pocket"}
    for z in m["zones"].values():
        for scen in z["scenarios"].values():
            assert set(scen) == set(engine.ROTATIONS)
            for rows in scen.values():
                assert [r["year"] for r in rows] == list(range(2026, 2031))
                for r in rows:
                    assert r["trace"] and all(t.endswith("]") and "[" in t for t in r["trace"])


def test_trap_scenario_only_raises_first_year_on_upland():
    z = bake.risk_matrix()["zones"]["upland"]["scenarios"]
    base, trap = z["baseline"]["B_corn_soy_wheat"], z["trap_threshold"]["B_corn_soy_wheat"]
    assert base[0]["wireworm"] == "MODERATE" and trap[0]["wireworm"] == "HIGH"
    assert trap[0]["prescription_supportable"] and not base[0]["prescription_supportable"]
    assert base[1:] == trap[1:]


def test_committed_risk_json_matches_engine():
    # The app reads web/data/risk.json; a stale bake would show numbers the engine no longer gives.
    committed = json.loads((WEB_DATA / "risk.json").read_text())
    assert committed == json.loads(json.dumps(bake.risk_matrix()))


def test_committed_soil_json_has_trap_window():
    s = json.loads((WEB_DATA / "soil.json").read_text())
    assert s["years"][0] <= 2000 and s["years"][1] >= 2025
    assert 100 < s["trap_12C_mean_doy"] < 170 and s["larvae_8C_mean_doy"] < s["trap_12C_mean_doy"]


def test_load_power_param_accepts_both_layouts(tmp_path):
    api = tmp_path / "api.json"
    api.write_text(json.dumps({"properties": {"parameter": {"TSOIL1": {"20200101": 1.0}}}}))
    flat = tmp_path / "flat.json"
    flat.write_text(json.dumps({"TSOIL1": {"20200101": 1.0}}))
    assert bake.load_power_param(api, "TSOIL1") == bake.load_power_param(flat, "TSOIL1")
    with pytest.raises(KeyError):
        bake.load_power_param(flat, "T2M")


def _crops(groups, start=2021):
    return {"per_year": {str(start + i): {"group": g} for i, g in enumerate(groups)}, "source": "test"}


def test_field_history_maps_groups_and_counts_years_since_hay():
    h = bake.field_history(_crops(["forage", "corn", "soybean", "corn", "corn"]))
    assert h["prior"] == ["sod", "corn", "soybean", "corn", "corn"]
    assert h["years_since_sod"] == 2026 - 2021 and h["sod_in_record"] and h["years"] == [2021, 2025]
    h = bake.field_history(_crops(["corn", "soybean", "other"]))
    assert h["prior"] == ["corn", "soybean", "other"]
    assert h["years_since_sod"] == 2026 - 2021 + 1 and not h["sod_in_record"]   # lower bound


def test_field_risk_follows_the_field_not_the_park():
    corn2 = bake.risk_matrix(bake.field_history(_crops(["soybean", "wheat", "soybean", "corn", "corn"])))
    y = corn2["zones"]["upland"]["scenarios"]["baseline"]["A_continuous_corn"][0]
    assert y["corn_rootworm"] == "HIGH"                        # third corn year; the park table says LOW
    assert not any("grass history" in t for t in y["trace"])   # no hay in the record
    park = bake.risk_matrix()["zones"]["upland"]["scenarios"]["baseline"]["A_continuous_corn"][0]
    assert park["corn_rootworm"] == "LOW" and any("grass history" in t for t in park["trace"])
    assert "history" in corn2 and "history" not in bake.risk_matrix()


def test_committed_field_risk_json_matches_crop_history():
    # Each baked field's pest table must be the one its own crop history gives.
    fields = json.loads((WEB_DATA / "fields" / "index.json").read_text(encoding="utf-8"))
    assert fields
    for f in fields:
        fj = json.loads((WEB_DATA / "fields" / f["id"] / "field.json").read_text(encoding="utf-8"))
        committed = json.loads((WEB_DATA / "fields" / f["id"] / "risk.json").read_text(encoding="utf-8"))
        assert committed == json.loads(json.dumps(bake.risk_matrix(bake.field_history(fj["crops"])))), f["id"]


def test_committed_soil_json_date_stats_match_its_own_years():
    # Means and trend in the file must be the ones soil.date_stats gives for its per-year dates.
    from taupin import soil
    s = json.loads((WEB_DATA / "soil.json").read_text())
    assert {k: s[k] for k in soil.date_stats(s["per_year"])} == soil.date_stats(s["per_year"])
