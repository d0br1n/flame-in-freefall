"""Guard: the pydantic models in app/models.py must match contracts/*.schema.json exactly.

The shapes are defined once, in contracts/. If someone adds, removes or makes optional a field
in one place and not the other, this test fails and names the field.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
import sys
from pathlib import Path

import pytest

API = Path(__file__).resolve().parents[1]
REPO = API.parents[1]
sys.path.insert(0, str(API))
sys.path.insert(0, str(REPO))
from app import models  # noqa: E402
from contracts import validate  # noqa: E402

COMMON = validate.load_schema("common.schema.json")["$defs"]
MODULE = validate.load_schema("module.schema.json")
EVIDENCE = validate.load_schema("evidence.schema.json")["$defs"]["record"]
FINDING = validate.load_schema("findings.schema.json")["$defs"]["finding"]


def fields_of(model):
    return set(model.model_fields), {n for n, f in model.model_fields.items() if f.is_required()}


@pytest.mark.parametrize("model,schema", [
    (models.Module, MODULE),
    (models.Evidence, EVIDENCE),
    (models.Finding, FINDING),
    (models.Source, COMMON["source"]),
    (models.FileEntry, MODULE["properties"]["files"]["items"]),
    (models.Uncertainty, EVIDENCE["properties"]["uncertainty"]),
    (models.Reference, EVIDENCE["properties"]["reference"]),
])
def test_model_matches_schema(model, schema):
    names, required = fields_of(model)
    assert names == set(schema["properties"]), f"{model.__name__} fields differ from the schema"
    assert required == set(schema.get("required", [])), f"{model.__name__} required fields differ from the schema"


def test_enums_match_schema():
    from typing import get_args
    assert set(get_args(models.Provenance)) == set(COMMON["provenance"]["enum"])
    assert set(get_args(models.Module.model_fields["stage"].annotation)) == set(MODULE["properties"]["stage"]["enum"])
    assert set(get_args(models.Module.model_fields["status"].annotation)) == set(MODULE["properties"]["status"]["enum"])
    assert set(get_args(models.Finding.model_fields["kind"].annotation)) == set(FINDING["properties"]["kind"]["enum"])
