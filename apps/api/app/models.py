"""Response models for the engine routes.

The shapes are defined once, in contracts/*.schema.json. These pydantic classes mirror them so
FastAPI can document the routes in /docs. apps/api/tests/test_models.py fails if a field or a
required flag here drifts from the schemas, so the two cannot disagree silently. Every record is
also validated against the schemas themselves (contracts/validate.py) before it is served.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict

Provenance = Literal["VIDEO_MEASURED", "PUBLISHED", "PSI_TABLE", "HAND_MEASURED", "SI_EXTRACTED", "MODEL"]
Value = Union[bool, int, float, str]   # pydantic's smart union keeps the exact JSON type


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(_Strict):
    psi_id: str
    file: str
    link: Optional[str] = None


class Uncertainty(_Strict):
    interval: List[float]
    method: str


class Reference(_Strict):
    value: Value
    citation: str


class FileEntry(_Strict):
    name: str
    kind: str
    description: str


class Module(_Strict):
    id: str
    title: str
    stage: Literal["spread", "detect", "suppress"]
    psi_ids: List[str]
    question: str
    summary: str
    cannot_tell: List[str]
    status: Literal["example", "built"]
    files: List[FileEntry]


class Evidence(_Strict):
    id: str
    module: str
    test_id: str
    segment: Optional[str] = None
    quantity: str
    value: Value
    unit: str
    uncertainty: Optional[Uncertainty] = None
    n: int
    conditions: Dict[str, Any]
    provenance: Provenance
    source: Source
    reference: Optional[Reference] = None
    assets: Optional[List[str]] = None
    flags: List[str]


class Finding(_Strict):
    id: str
    module: str
    kind: Literal["headline", "check"]
    text: str
    value: Value
    unit: str
    n: int
    provenance: Provenance
    source: Source
    evidence_ids: Optional[List[str]] = None
    passed: Optional[bool] = None


# ------------------------------------------------------------------ API-only shapes
class ModuleSummary(BaseModel):
    """One row of GET /api/v1/modules. A not_built engine carries no numbers."""
    id: str
    status: Literal["example", "built", "not_built"]
    title: Optional[str] = None
    stage: Optional[str] = None
    question: Optional[str] = None
    evidence_count: Optional[int] = None
    findings_count: Optional[int] = None
    problems: int = 0


class Health(BaseModel):
    status: Literal["ok"]
    modules_dir: str
    dev: bool
    engines_found: List[str]
    engines_served: List[str]
    engines_not_built: List[str]
    catalog: Dict[str, Any]
