import numpy as np
import pytest

from taupin.crophist import per_year, summary

NAMES = {147: "Corn for grain", 158: "Soybeans", 146: "Spring wheat", 122: "Pasture/forages", 34: "Urban"}


def test_per_year_majority_share_and_non_crop_skip():
    mask = np.ones((2, 2), bool)
    aci = np.array([
        [[147, 147], [147, 158]],   # corn 3 of 4
        [[34, 34], [34, 158]],      # urban majority: skipped
        [[0, 0], [0, 0]],           # no data: skipped
    ], np.uint8)
    h = per_year(aci, [2023, 2024, 2025], mask, NAMES)
    assert list(h) == [2023]
    assert h[2023] == {"code": 147, "name": "Corn for grain", "group": "corn", "share": 0.75}


def test_per_year_uses_only_masked_cells():
    mask = np.array([[True, False], [False, False]])
    aci = np.array([[[158, 147], [147, 147]]], np.uint8)
    assert per_year(aci, [2025], mask, NAMES)[2025]["group"] == "soybean"


def _hist(groups, start=2021):
    return {start + i: {"group": g} for i, g in enumerate(groups)}


def test_summary_corn_run_forage_and_rotation():
    s = summary(_hist(["forage", "forage", "corn", "soybean", "corn", "corn"]))
    assert s["corn_run"] == 2 and s["forage_years_last5"] == 1 and s["last_year"] == 2026
    s = summary(_hist(["corn", "soybean", "wheat", "corn", "soybean"]))
    assert s["rotation"] == "B_corn_soy_wheat" and s["rotation_match"] == "5 of 5"


def test_grid_around_snaps_to_30m_and_contains_point():
    pytest.importorskip("rasterio")
    from rasterio.warp import transform
    from taupin.grid import Grid
    g = Grid.around(45.6917, -73.5504)
    assert g.x0 % 30 == 0 and g.y_top % 30 == 0 and g.size == 300
    x, y = transform("EPSG:4326", "EPSG:32618", [-73.5504], [45.6917])
    assert g.x0 < x[0] < g.x0 + 600 and g.y_top - 600 < y[0] < g.y_top


def test_cycle_is_the_repeating_unit_not_the_five_year_plan():
    from taupin.crophist import cycle
    assert cycle(["corn", "soybean", "corn", "soybean", "corn"]) == ["corn", "soybean"]
    assert cycle(["corn", "soybean", "wheat", "corn", "soybean"]) == ["corn", "soybean", "wheat"]
    assert cycle(["corn"] * 5) == ["corn"]
    assert cycle(["buckwheat", "soybean", "corn", "soybean", "wheat"]) == ["buckwheat", "soybean", "corn", "soybean", "wheat"]


def test_corn_soy_does_not_match_corn_after_corn():
    # Read end to end, corn-soy-corn-soy-corn wraps into corn-corn and would fit this history 4 of 5.
    s = summary(_hist(["corn", "corn", "soybean", "corn", "corn"]))
    assert s["rotation"] == "A_continuous_corn" and s["rotation_match"] == "4 of 5"
    assert s["rotation_ties"] == ["G_corn_corn_soy_wheat"]   # also 4 of 5; corn every year agrees on 2024 and 2025


def test_tie_goes_to_the_rotation_agreeing_on_recent_years_not_list_order():
    # G (corn, corn, soybean, wheat) and A (corn every year) both agree 3 of 4 here; the last year is
    # wheat, which G has and A does not.
    s = summary(_hist(["corn", "corn", "corn", "wheat"]))
    assert s["rotation"] == "G_corn_corn_soy_wheat" and "A_continuous_corn" in s["rotation_ties"]


def test_weak_match_is_not_preset():
    s = summary(_hist(["forage", "soybean", "soybean", "forage", "soybean"]))
    assert s["rotation"] is None and s["rotation_best"] and s["rotation_match"] == "2 of 5"
    assert s["forage_years_last5"] == 2


def test_small_grains_are_grouped_as_grass_hosts():
    from taupin.crophist import GROUPS
    from taupin.engine import GRASS
    assert GROUPS[136] == "oat" and GROUPS[137] == "rye" and GROUPS[133] == "barley"
    assert {"oat", "rye", "barley"} <= GRASS
