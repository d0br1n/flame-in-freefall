"""Tests for the backend skeleton: the "done when" list of Linear DOB-58.

HTTP-level tests; they need FastAPI (apps/api/requirements.txt), so the gate does not run them.
The same behaviour is covered without FastAPI in tests/api/. Run: pytest apps/api/tests
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import json
import shutil
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

API = Path(__file__).resolve().parents[1]
REPO = API.parents[1]
sys.path.insert(0, str(API))
sys.path.insert(0, str(REPO))
from app.main import create_app  # noqa: E402
from contracts import validate  # noqa: E402

MOCK = REPO / "data" / "modules" / "_mock"


@pytest.fixture
def modules(tmp_path):
    """A modules folder with the mock engine and a second, valid copy called demo-engine."""
    root = tmp_path / "modules"
    shutil.copytree(MOCK, root / "_mock")
    demo = root / "demo-engine"
    shutil.copytree(MOCK, demo)
    for name in ("module.json", "evidence.json", "findings.json"):
        text = (demo / name).read_text().replace('"_mock"', '"demo-engine"')
        (demo / name).write_text(text)
    assert validate.validate_folder(demo).ok
    return root


def client(modules_dir, dev=True):
    return TestClient(create_app(modules_dir, dev=dev))


def test_health_and_modules_answer(modules):
    c = client(modules)
    h = c.get("/api/v1/health").json()
    assert h["status"] == "ok"
    assert set(h["engines_found"]) == {"_mock", "demo-engine"}
    assert set(h["engines_served"]) == {"_mock", "demo-engine"}
    rows = {r["id"]: r for r in c.get("/api/v1/modules").json()}
    assert rows["_mock"]["status"] == "example"
    assert rows["_mock"]["evidence_count"] == 4


def test_every_module_route_is_schema_valid(modules):
    c = client(modules)
    checks = {
        "/api/v1/modules/_mock": "module.schema.json",
        "/api/v1/modules/_mock/evidence": "evidence.schema.json",
        "/api/v1/modules/_mock/findings": "findings.schema.json",
    }
    for url, schema in checks.items():
        r = c.get(url)
        assert r.status_code == 200, url
        errors = validate.check_schema(schema, r.json())
        assert not errors, (url, errors)


def test_served_records_equal_the_files(modules):
    c = client(modules)
    on_disk = json.loads((MOCK / "evidence.json").read_text())
    assert c.get("/api/v1/modules/_mock/evidence").json() == on_disk


def test_evidence_filters(modules):
    c = client(modules)
    rows = c.get("/api/v1/modules/_mock/evidence", params={"test_id": "PSI-0/MOCK-2"}).json()
    assert {r["id"] for r in rows} == {"mock-ev-3", "mock-ev-4"}
    rows = c.get("/api/v1/modules/_mock/evidence", params={"test_id": "PSI-0/MOCK-2", "quantity": "test_end"}).json()
    assert [r["id"] for r in rows] == ["mock-ev-4"]


def test_listed_file_is_served(modules):
    r = client(modules).get("/api/v1/modules/_mock/files/mock_table.csv")
    assert r.status_code == 200
    assert "PSI-0/MOCK-1" in r.text


def test_unknown_engine_or_file_gives_clear_404(modules):
    c = client(modules)
    r = c.get("/api/v1/modules/nope")
    assert r.status_code == 404 and "No engine 'nope'" in r.json()["detail"]
    r = c.get("/api/v1/modules/_mock/files/missing.png")
    assert r.status_code == 404 and "Only files listed in its module.json are served" in r.json()["detail"]


def test_file_not_in_module_json_is_refused(modules):
    (modules / "_mock" / "secret.txt").write_text("not listed")
    c = client(modules)
    assert c.get("/api/v1/modules/_mock/files/secret.txt").status_code == 404
    assert c.get("/api/v1/modules/_mock/files/module.json").status_code == 404
    assert c.get("/api/v1/modules/_mock/files/../../CLAUDE.md").status_code == 404
    assert c.get("/api/v1/modules/_mock/files/%2E%2E/demo-engine/mock_table.csv").status_code == 404


def test_broken_evidence_is_not_built_and_app_stays_up(modules):
    (modules / "demo-engine" / "evidence.json").write_text("[{ broken")
    c = client(modules)
    rows = {r["id"]: r for r in c.get("/api/v1/modules").json()}
    assert rows["demo-engine"]["status"] == "not_built"
    assert "evidence_count" not in rows["demo-engine"] and "title" not in rows["demo-engine"]
    assert rows["_mock"]["status"] == "example"
    r = c.get("/api/v1/modules/demo-engine/evidence")
    assert r.status_code == 404 and "is not built" in r.json()["detail"]
    assert c.get("/api/v1/health").json()["engines_not_built"] == ["demo-engine"]


def test_empty_or_crashing_folder_is_not_built(modules, monkeypatch):
    (modules / "empty-engine").mkdir()
    real = validate.validate_folder

    def boom(folder):
        if Path(folder).name == "demo-engine":
            raise RuntimeError("simulated bug")
        return real(folder)

    monkeypatch.setattr(validate, "validate_folder", boom)
    rows = {r["id"]: r for r in client(modules).get("/api/v1/modules").json()}
    assert rows["empty-engine"]["status"] == "not_built"
    assert rows["demo-engine"]["status"] == "not_built"
    assert rows["_mock"]["status"] == "example"


def test_mock_hidden_without_dev_flag(modules):
    c = client(modules, dev=False)
    assert [r["id"] for r in c.get("/api/v1/modules").json()] == ["demo-engine"]
    assert c.get("/api/v1/modules/_mock").status_code == 404


def test_docs_and_openapi_are_on(modules):
    c = client(modules)
    assert c.get("/docs").status_code == 200
    assert "/api/v1/modules/{module_id}/evidence" in c.get("/openapi.json").json()["paths"]


def test_cors_allows_the_web_origin(modules, monkeypatch):
    monkeypatch.setenv("FIF_CORS_ORIGINS", "http://localhost:3000")
    r = client(modules).get("/api/v1/health", headers={"Origin": "http://localhost:3000"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"


def test_api_is_read_only(modules):
    c = client(modules)
    assert c.post("/api/v1/modules").status_code == 405
    assert c.delete("/api/v1/modules/_mock").status_code == 405
