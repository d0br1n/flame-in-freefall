"""HTTP tests for the catalog routes (Linear DOB-66): status codes and shapes over a fake catalog.

Needs FastAPI (apps/api/requirements.txt). The logic is tested without HTTP in tests/api/test_catalog.py.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

API = Path(__file__).resolve().parents[1]
REPO = API.parents[1]
sys.path.insert(0, str(API))
sys.path.insert(0, str(REPO))
from app.main import create_app  # noqa: E402
from pipeline.catalog import build  # noqa: E402
from tests.catalog.raw_fixture import write_raw  # noqa: E402

MOCK_PARENT = REPO / "data" / "modules"


@pytest.fixture(scope="module")
def client(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("catalog")
    db = tmp / "catalog.sqlite"
    build.build(write_raw(tmp / "raw"), db)
    return TestClient(create_app(MOCK_PARENT, dev=False, catalog_db=db))


def test_list_and_filters(client):
    body = client.get("/api/v1/catalog/investigations").json()
    assert body["total"] == 24 and body["count"] == 24
    assert set(body["facets"]) == {"pillar", "stage", "fuel_phase", "hardware_group", "psi_sub_area"}
    one = client.get("/api/v1/catalog/investigations", params={"q": "PSI-69"}).json()
    assert [r["psi_id"] for r in one["items"]] == ["PSI-69"]
    no_table = client.get("/api/v1/catalog/investigations", params={"has_table": "false"}).json()
    assert all(r["table_count"] == 0 for r in no_table["items"])


def test_detail_and_404(client):
    r = client.get("/api/v1/catalog/investigations/psi-69")
    assert r.status_code == 200
    assert r.json()["psi_id"] == "PSI-69"
    ids = [e["id"] for e in r.json()["engines"]]
    assert "_mock" not in ids                 # the mock engine is never linked; real engines may be
    missing = client.get("/api/v1/catalog/investigations/PSI-9999")
    assert missing.status_code == 404
    assert "PSI-9999" in missing.json()["detail"]


def test_files_paging_and_422(client):
    page = client.get("/api/v1/catalog/investigations/PSI-25/files", params={"limit": 1}).json()
    assert page["total"] == 4 and len(page["items"]) == 1
    assert client.get("/api/v1/catalog/investigations/PSI-25/files", params={"kind": "video"}).status_code == 422


def test_health_reports_the_catalog(client):
    h = client.get("/api/v1/health").json()
    assert h["catalog"]["status"] == "ok"
    assert h["catalog"]["investigations"] == 24


def test_missing_database_answers_503_and_app_still_starts(tmp_path):
    c = TestClient(create_app(MOCK_PARENT, dev=False, catalog_db=tmp_path / "none.sqlite"))
    assert c.get("/api/v1/health").json()["catalog"]["status"] == "missing"
    r = c.get("/api/v1/catalog/investigations")
    assert r.status_code == 503
    assert "pipeline/catalog/build.py" in r.json()["detail"]


def test_tests_routes_over_http(client):
    body = client.get("/api/v1/catalog/tests", params={"psi_id": "PSI-69", "include": "points"}).json()
    assert body["total"] == 1 and body["points"]["items"][0][2] == 0.21
    row = body["items"][0]
    assert abs(row["pressure_kpa"] - 101.325) < 1e-9
    one = client.get(f"/api/v1/catalog/tests/{row['test_id']}")
    assert one.status_code == 200 and "raw" in one.json()
    assert client.get("/api/v1/catalog/tests/PSI-69/nope").status_code == 404
    assert client.get("/api/v1/catalog/tests", params={"o2_min": "abc"}).status_code == 422
    assert client.get("/api/v1/catalog/tests", params={"o2_min": 21}).status_code == 422
    multi = client.get("/api/v1/catalog/tests", params=[("psi_id", "PSI-69"), ("psi_id", "PSI-39")]).json()
    assert multi["total"] == 2


def test_air_routes(client):
    presets = client.get("/api/v1/air/presets").json()
    assert presets["default"] == "station" and len(presets["presets"]) == 5
    cov = client.get("/api/v1/air/coverage", params={"air": "station"})
    assert cov.status_code == 200 and set(cov.json()["stages"]) == {"spread", "detect", "suppress", "other"}
    assert client.get("/api/v1/air/coverage").json()["air"] == "station"
    assert client.get("/api/v1/air/coverage", params={"air": "moon"}).status_code == 422
    inside = client.get("/api/v1/catalog/tests", params={"air": "station", "psi_id": "PSI-69"}).json()
    assert inside["total"] == 1                                      # the fake FLEX row: 0.21 at 760 mmHg
    assert client.get("/api/v1/catalog/tests", params={"air": "exploration", "psi_id": "PSI-69"}).json()["total"] == 0
    assert client.get("/api/v1/catalog/tests", params={"air": "moon"}).status_code == 422


def test_rank_route(client):
    body = client.get("/api/v1/catalog/rank", params={"air": "station"}).json()
    assert len(body["items"]) == 24 and body["weights_are_default"] is True
    assert [i["rank"] for i in body["items"]] == list(range(1, 25))
    custom = client.get("/api/v1/catalog/rank", params={"w_evidence": 1}).json()
    assert custom["weights_are_default"] is False and abs(sum(custom["weights"].values()) - 1) < 1e-9
    assert client.get("/api/v1/catalog/rank", params={"air": "moon"}).status_code == 422
    zero = {"w_pillar": 0, "w_evidence": 0, "w_data": 0, "w_fuel": 0}
    assert client.get("/api/v1/catalog/rank", params=zero).status_code == 422
    assert client.get("/api/v1/catalog/rank", params={"w_fuel": -1}).status_code == 422


def test_compare_route(client):
    body = client.get("/api/v1/catalog/compare", params={"ids": "PSI-69,psi-39"}).json()
    assert body["ids"] == ["PSI-69", "PSI-39"] and all(len(r["cells"]) == 2 for r in body["rows"])
    repeated = client.get("/api/v1/catalog/compare", params=[("ids", "PSI-69"), ("ids", "PSI-39")]).json()
    assert repeated["rows"] == body["rows"]
    assert client.get("/api/v1/catalog/compare", params={"ids": "PSI-69"}).status_code == 422
    assert client.get("/api/v1/catalog/compare").status_code == 422
    assert client.get("/api/v1/catalog/compare", params={"ids": "PSI-69,PSI-9999"}).status_code == 404


def test_tests_by_repeated_test_id(client):
    ids = [r["test_id"] for r in client.get("/api/v1/catalog/tests", params={"psi_id": "PSI-69,PSI-39"}).json()["items"]]
    body = client.get("/api/v1/catalog/tests", params=[("test_id", i) for i in ids] + [("include", "raw")]).json()
    assert sorted(r["test_id"] for r in body["items"]) == sorted(ids) and all("raw" in r for r in body["items"])
