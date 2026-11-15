"""Flame in Freefall backend: one read-only FastAPI app that serves every engine folder.

Run from the repo root:
    uvicorn --app-dir apps/api app.main:app --port 8000
    FIF_DEV=1 uvicorn --app-dir apps/api app.main:app --port 8000    # also serve the mock engine

Environment:
    FIF_DEV=1              serve data/modules/_mock (development only)
    FIF_MODULES_DIR=<dir>  where the engine folders are (default: data/modules/)
    FIF_CORS_ORIGINS=a,b   web app origins allowed to call the API (default: http://localhost:3000)
    FIF_CATALOG_DB=<file>  the catalog database (default: data/build/catalog.sqlite, DOB-60)

This file only maps routes to app/store.py, where the logic lives and is tested (tests/api/).
Routes are listed in docs/ENGINE_API_CONTRACT.md and at /docs. The catalog routes (DOB-66)
read app/catalog.py. No login, no writes, nothing is measured at request time.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import air as air_mod
from . import rank as rank_mod
from .catalog import BadQuery, Catalog, CatalogUnavailable, TestQuery, UnknownInvestigation
from .models import Evidence, Finding, Health, Module, ModuleSummary
from .store import REPO, Engine, NotFound, Store, filter_evidence

router = APIRouter(prefix="/api/v1")


def _store(request: Request) -> Store:
    return request.app.state.store


def _engine(request: Request, module_id: str) -> Engine:
    try:
        return _store(request).engine(module_id)
    except NotFound as exc:
        raise HTTPException(404, str(exc))


@router.get("/health", response_model=Health)
def health(request: Request):
    return {**_store(request).health(), "catalog": _catalog(request).health()}


# ------------------------------------------------------------------ catalog (DOB-66)
def _catalog(request: Request) -> Catalog:
    return request.app.state.catalog


def _catalog_call(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except CatalogUnavailable as exc:
        raise HTTPException(503, str(exc))
    except UnknownInvestigation as exc:
        raise HTTPException(404, str(exc))
    except (BadQuery, air_mod.UnknownAir, air_mod.BadAir) as exc:
        raise HTTPException(422, str(exc))


@router.get("/catalog/investigations")
def list_investigations(request: Request, pillar: Optional[str] = None, stage: Optional[str] = None,
                        fuel_phase: Optional[str] = None, hardware_group: Optional[str] = None,
                        psi_sub_area: Optional[str] = None, has_table: Optional[bool] = None,
                        q: Optional[str] = None):
    """The 24 PSI combustion investigations, optionally filtered, with facet counts.
    Shape: apps/web/fixtures/README.md."""
    return _catalog_call(_catalog(request).list, pillar=pillar, stage=stage, fuel_phase=fuel_phase,
                         hardware_group=hardware_group, psi_sub_area=psi_sub_area, has_table=has_table, q=q)


@router.get("/catalog/investigations/{psi_id}")
def get_investigation(request: Request, psi_id: str):
    """One investigation: PSI text, curated tags with sources, files, publications, engines using it."""
    engines = [e.result.module for e in _store(request).engines.values() if e.built]
    return _catalog_call(_catalog(request).detail, psi_id, engines=engines)


@router.get("/catalog/investigations/{psi_id}/files")
def get_investigation_files(request: Request, psi_id: str, kind: Optional[str] = None,
                            category: Optional[str] = None, q: Optional[str] = None,
                            limit: int = 100, offset: int = 0):
    """One page of the investigation's PSI file list, each with its public download link."""
    return _catalog_call(_catalog(request).files_of, psi_id, kind=kind, category=category,
                         q=q, limit=limit, offset=offset)


# ------------------------------------------------------------------ compare (DOB-75)
@router.get("/catalog/compare")
def compare_investigations(request: Request, ids: List[str] = Query([])):
    """Two to four investigations side by side: aligned rows, one cell each, ranges never merged.
    `ids=PSI-69,PSI-68` or `ids=PSI-69&ids=PSI-68`. A cell with value null is "not stated"."""
    return _catalog_call(_catalog(request).compare, ids)


# ------------------------------------------------------------------ tests (DOB-72)
@router.get("/catalog/tests")
def list_tests(request: Request,
               psi_id: List[str] = Query([]), fuel: List[str] = Query([]), fuel_phase: List[str] = Query([]),
               outcome: List[str] = Query([]), diluent: List[str] = Query([]),
               test_id: List[str] = Query([]),
               o2_min: Optional[float] = None, o2_max: Optional[float] = None,
               pressure_min: Optional[float] = None, pressure_max: Optional[float] = None,
               flow_min: Optional[float] = None, flow_max: Optional[float] = None,
               comparable: Optional[bool] = None, notes: bool = False,
               limit: int = 50, offset: int = 0, include: List[str] = Query([]),
               air: Optional[str] = None):
    """Every row of the 22 PSI experimental tables, filtered and paged, with facet counts.
    Oxygen as a mole fraction, pressure in kPa, flow in cm/s; each value keeps its original.
    Shape: apps/web/fixtures/README.md and docs/ENGINE_API_CONTRACT.md."""
    q = TestQuery(psi_id=psi_id, fuel=fuel, fuel_phase=fuel_phase, outcome=outcome, diluent=diluent,
                  test_id=test_id,
                  o2_min=o2_min, o2_max=o2_max, pressure_min=pressure_min, pressure_max=pressure_max,
                  flow_min=flow_min, flow_max=flow_max, comparable=comparable, notes=notes,
                  limit=limit, offset=offset, include=include)

    def run():
        air_mod.apply_to_query(q, air)       # a preset narrows the oxygen and pressure ranges
        return _catalog(request).query_tests(q, request.app.state.evidence_by_test)
    return _catalog_call(run)


# ------------------------------------------------------------------ ranking (DOB-73)
@router.get("/catalog/rank")
def catalog_rank(request: Request, air: str = air_mod.DEFAULT,
                 o2: Optional[str] = None, pressure_kpa: Optional[str] = None,
                 w_pillar: Optional[float] = None, w_evidence: Optional[float] = None,
                 w_data: Optional[float] = None, w_fuel: Optional[float] = None):
    """The 24 investigations ranked for a cabin air, each score split into parts with reasons.
    Weights default to 0.25 each (a team decision); pass w_* to change them (normalised).
    o2 and pressure_kpa together choose a custom air instead of the preset (they win over air)."""
    def run():
        weights, default = rank_mod.weights_from(w_pillar, w_evidence, w_data, w_fuel)
        cabin = air_mod.resolve(_catalog(request), air, o2, pressure_kpa)
        return rank_mod.rank(_catalog(request), cabin, weights, default)
    return _catalog_call(run)


# ------------------------------------------------------------------ cabin air (DOB-83)
@router.get("/air/presets")
def air_presets(request: Request):
    """The cabin atmospheres a visitor can pick, each a window with its source and tolerance,
    and the slider ranges for a custom air (custom), taken from the catalogued tests."""
    return _catalog_call(air_mod.presets, _catalog(request))


@router.get("/air/window")
def air_window(request: Request, o2: Optional[str] = None, pressure_kpa: Optional[str] = None):
    """A custom air: the window around one point (oxygen mole fraction, kPa), with the preset tolerance.
    Taken as text so a missing or non-numeric value gets a sentence naming the range, not a schema error."""
    return _catalog_call(air_mod.custom_air, _catalog(request), o2, pressure_kpa)


@router.get("/air/coverage")
def air_coverage(request: Request, air: str = air_mod.DEFAULT,
                 o2: Optional[str] = None, pressure_kpa: Optional[str] = None):
    """Per fire stage and investigation: tests that state oxygen/pressure, and how many ran in this air.
    o2 and pressure_kpa together choose a custom air instead of the preset (they win over air)."""
    def run():
        return air_mod.coverage(_catalog(request), air_mod.resolve(_catalog(request), air, o2, pressure_kpa))
    return _catalog_call(run)


@router.get("/catalog/tests/{test_id:path}")
def get_test(request: Request, test_id: str):
    """One test (e.g. PSI-69/114) with its raw row and every engine evidence record about it."""
    return _catalog_call(_catalog(request).test, test_id, request.app.state.evidence_by_test)


def evidence_index(store: Store) -> dict:
    """{test_id: [evidence records]} over the built engines (never the mock unless in dev mode)."""
    index: dict = {}
    for engine in store.engines.values():
        if engine.built:
            for record in engine.result.evidence:
                index.setdefault(record.get("test_id"), []).append(record)
    return index


@router.get("/modules", response_model=List[ModuleSummary], response_model_exclude_none=True)
def list_modules(request: Request):
    return _store(request).summaries()


@router.get("/modules/{module_id}", response_model=Module, response_model_exclude_none=True)
def get_module(request: Request, module_id: str):
    return _engine(request, module_id).result.module


@router.get("/modules/{module_id}/evidence", response_model=List[Evidence], response_model_exclude_none=True)
def get_evidence(request: Request, module_id: str, test_id: Optional[str] = None, quantity: Optional[str] = None):
    return filter_evidence(_engine(request, module_id).result.evidence, test_id, quantity)


@router.get("/modules/{module_id}/findings", response_model=List[Finding], response_model_exclude_none=True)
def get_findings(request: Request, module_id: str):
    return _engine(request, module_id).result.findings


@router.get("/modules/{module_id}/files/{name:path}")
def get_file(request: Request, module_id: str, name: str):
    try:
        return FileResponse(_store(request).file(module_id, name))
    except NotFound as exc:
        raise HTTPException(404, str(exc))


def create_app(modules_dir: Optional[Path] = None, dev: Optional[bool] = None,
               catalog_db: Optional[Path] = None) -> FastAPI:
    if catalog_db is None:
        catalog_db = Path(os.environ.get("FIF_CATALOG_DB", REPO / "data" / "build" / "catalog.sqlite"))
    if modules_dir is None:
        modules_dir = Path(os.environ.get("FIF_MODULES_DIR", REPO / "data" / "modules"))
    if dev is None:
        dev = os.environ.get("FIF_DEV", "") == "1"
    origins = [o.strip() for o in os.environ.get("FIF_CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]

    app = FastAPI(
        title="Flame in Freefall API",
        version="1",
        description="Read-only API over NASA PSI combustion data: the engine folders under data/modules/. "
                    "Every number carries its PSI source. See docs/ENGINE_API_CONTRACT.md.",
    )
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"])
    app.state.store = Store(Path(modules_dir), dev).load()
    app.state.catalog = Catalog(Path(catalog_db)).load()
    app.state.evidence_by_test = evidence_index(app.state.store)
    app.include_router(router)
    return app


app = create_app()
