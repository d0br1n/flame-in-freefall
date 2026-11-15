"""HTTP tests for the custom cabin air (sliders): /air/presets, /air/window, /air/coverage, /catalog/rank.

Run on the committed data/build/catalog.sqlite, so the ranges are the ones the site shows. Needs
FastAPI (apps/api/requirements.txt, installed by the gate). The logic is tested without HTTP in
tests/api/test_air.py and tests/api/test_rank.py.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import pytest
from fastapi.testclient import TestClient

from apps.api.app import air, rank
from apps.api.app import catalog as cat
from apps.api.app.main import create_app
from pipeline.catalog import build

STATION = {"o2": 0.21, "pressure_kpa": 14.7 * air.KPA_PER_PSI}      # the station preset's own point


@pytest.fixture(scope="module")
def client():
    return TestClient(create_app(catalog_db=build.DEFAULT_OUT))


@pytest.fixture(scope="module")
def catalog():
    return cat.Catalog(build.DEFAULT_OUT).load()


def get(client, path, **params):
    return client.get(f"/api/v1{path}", params=params)


def test_presets_carry_the_slider_ranges(client):
    body = get(client, "/air/presets").json()
    assert list(body) == ["default", "presets", "custom", "custom_plain"]
    assert body["presets"] == air.PRESETS
    c = body["custom"]
    assert c == {"o2_min": 0.12, "o2_max": 0.4, "o2_step": 0.005,
                 "pressure_kpa_min": 43.0, "pressure_kpa_max": 507.0, "pressure_kpa_step": 0.5}
    assert c["o2_min"] < c["o2_max"] and c["pressure_kpa_min"] < c["pressure_kpa_max"]
    assert body["custom_plain"].strip()


def test_window_for_the_station_point_is_the_station_window(client):
    body = get(client, "/air/window", **STATION).json()
    station = air.preset("station")
    assert body["id"] == "custom" and body["label"] == "Custom air"
    assert body["window"] == station["window"]
    assert body["tolerance_plain"] == station["tolerance_plain"]
    assert body["plain"] == "21% oxygen at 101.4 kPa (14.7 psi)"
    assert body["source"] == "Chosen by the visitor. Not a NASA atmosphere."
    assert body["point"] == {"o2_mole_fraction": 0.21, "pressure_kpa": STATION["pressure_kpa"]}


def test_coverage_for_the_station_point_equals_the_station_preset(client):
    custom = get(client, "/air/coverage", **STATION).json()
    station = get(client, "/air/coverage", air="station").json()
    assert custom["air"] == "custom"
    assert custom["window"] == station["window"]
    for stage in station["stages"]:
        assert custom["stages"][stage] == station["stages"][stage], stage
    # the point wins over a preset id
    assert get(client, "/air/coverage", air="exploration", **STATION).json()["stages"] == station["stages"]


def test_rank_for_the_station_point_orders_like_the_station_preset(client):
    custom = get(client, "/catalog/rank", **STATION).json()
    station = get(client, "/catalog/rank", air="station").json()
    assert custom["air"] == "custom" and custom["window"] == air.preset("station")["window"]
    assert [i["psi_id"] for i in custom["items"]] == [i["psi_id"] for i in station["items"]]
    assert [i["score"] for i in custom["items"]] == [i["score"] for i in station["items"]]
    weighted = get(client, "/catalog/rank", w_evidence=1, w_pillar=0, w_data=0, w_fuel=0, **STATION).json()
    assert weighted["weights_are_default"] is False and weighted["air"] == "custom"


@pytest.mark.parametrize("params", [
    {"o2": 0.119, "pressure_kpa": 100}, {"o2": 0.401, "pressure_kpa": 100},
    {"o2": 0.21, "pressure_kpa": 42.9}, {"o2": 0.21, "pressure_kpa": 507.1},
    {"o2": "abc", "pressure_kpa": 100}, {"o2": 0.21, "pressure_kpa": ""},
    {"o2": 0.21}, {"pressure_kpa": 100}, {},
])
def test_window_refuses_bad_points_naming_the_range(client, params):
    r = get(client, "/air/window", **params)
    assert r.status_code == 422
    detail = r.json()["detail"]
    assert isinstance(detail, str)
    assert "from 0.12 to 0.4" in detail and "from 43 to 507" in detail


@pytest.mark.parametrize("path", ["/air/coverage", "/catalog/rank"])
@pytest.mark.parametrize("params", [{"o2": 0.21}, {"pressure_kpa": 100}, {"air": "station", "o2": 0.21},
                                    {"o2": 0.5, "pressure_kpa": 100}])
def test_coverage_and_rank_need_both_values_in_range(client, path, params):
    r = get(client, path, **params)
    assert r.status_code == 422
    assert "from 0.12 to 0.4" in r.json()["detail"]


def test_preset_answers_are_unchanged(client, catalog):
    assert get(client, "/air/coverage", air="station").json() == air.coverage(catalog, "station")
    assert get(client, "/air/coverage").json() == air.coverage(catalog, "station")
    body = get(client, "/catalog/rank", air="station").json()
    assert list(body) == ["air", "weights", "weights_are_default", "formula", "items"]
    assert body == rank.rank(catalog, "station")
    assert get(client, "/catalog/rank", air="moon").status_code == 422
