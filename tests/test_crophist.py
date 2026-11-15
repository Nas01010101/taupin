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
