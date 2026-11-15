"""Reads the engine folders under data/modules/ through the one contract validator.

All the backend's logic lives here, in the standard library only, so it is tested without
FastAPI (tests/api/). main.py only turns these results into HTTP routes.

A folder that is missing a file, has broken JSON or fails the contract is kept as not_built:
it is listed, with no numbers, and its routes answer 404. One broken engine never takes the
app down. The mock engine (_mock) is left out unless the app runs in development mode.
Code generated with SI assistance (Claude Code), reviewed by the team.
"""
from __future__ import annotations

import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

REPO = Path(__file__).resolve().parents[3]
if str(REPO) not in sys.path:
    sys.path.insert(0, str(REPO))
from contracts import validate  # noqa: E402  (the one place the shapes are checked)

log = logging.getLogger("fif.api.store")
MOCK_ID = "_mock"


@dataclass
class Engine:
    id: str
    folder: Path
    result: Optional[validate.FolderResult] = None
    crash: Optional[str] = None

    @property
    def built(self) -> bool:
        return self.result is not None and self.result.ok

    @property
    def problems(self) -> int:
        if self.crash:
            return 1
        return len(self.result.errors) if self.result else 0

    def file_path(self, name: str) -> Optional[Path]:
        """The path of a file listed in module.json, or None. Nothing else is ever served."""
        if not self.built:
            return None
        listed = {f["name"] for f in self.result.module.get("files", [])}
        if name not in listed:
            return None
        root = self.folder.resolve()
        path = (self.folder / name).resolve()
        if root not in path.parents or not path.is_file():
            return None
        return path

    def summary(self) -> Dict[str, Any]:
        """One row of GET /api/v1/modules. A not_built engine carries no numbers."""
        if not self.built:
            return {"id": self.id, "status": "not_built", "problems": self.problems}
        m = self.result.module
        return {
            "id": self.id, "status": m["status"], "title": m["title"], "stage": m["stage"],
            "question": m["question"], "evidence_count": len(self.result.evidence),
            "findings_count": len(self.result.findings), "problems": 0,
        }


def filter_evidence(records: List[Dict[str, Any]], test_id: Optional[str] = None,
                    quantity: Optional[str] = None) -> List[Dict[str, Any]]:
    """Evidence records matching the optional test_id and quantity filters."""
    return [r for r in records
            if (test_id is None or r.get("test_id") == test_id)
            and (quantity is None or r.get("quantity") == quantity)]


class NotFound(Exception):
    """An unknown engine, an engine that is not built, or a file that is not listed."""


@dataclass
class Store:
    modules_dir: Path
    dev: bool = False
    engines: Dict[str, Engine] = field(default_factory=dict)
    found: List[str] = field(default_factory=list)

    def load(self) -> "Store":
        self.engines.clear()
        folders = validate.engine_folders(self.modules_dir)
        self.found = [f.name for f in folders]
        for folder in folders:
            if folder.name == MOCK_ID and not self.dev:
                continue
            engine = Engine(folder.name, folder)
            try:
                engine.result = validate.validate_folder(folder)
            except Exception as exc:  # a bug or an unreadable folder must not stop the app
                engine.crash = f"{type(exc).__name__}: {exc}"
            if not engine.built:
                details = [engine.crash] if engine.crash else engine.result.errors
                log.warning("engine %s is not built (%d problems): %s",
                            engine.id, engine.problems, "; ".join(details[:10]))
            self.engines[engine.id] = engine
        return self

    def health(self) -> Dict[str, Any]:
        return {
            "status": "ok",
            "modules_dir": str(self.modules_dir),
            "dev": self.dev,
            "engines_found": self.found,
            "engines_served": [e.id for e in self.engines.values() if e.built],
            "engines_not_built": [e.id for e in self.engines.values() if not e.built],
        }

    def summaries(self) -> List[Dict[str, Any]]:
        return [e.summary() for e in self.engines.values()]

    def engine(self, module_id: str) -> Engine:
        """A built engine, or NotFound with a sentence the web app can show."""
        engine = self.engines.get(module_id)
        if engine is None:
            raise NotFound(f"No engine '{module_id}'. GET /api/v1/modules lists the engines.")
        if not engine.built:
            raise NotFound(f"Engine '{module_id}' is not built: its folder fails the contract "
                           f"({engine.problems} problem(s)). Run: python3 contracts/validate.py data/modules/{module_id}")
        return engine

    def file(self, module_id: str, name: str) -> Path:
        path = self.engine(module_id).file_path(name)
        if path is None:
            raise NotFound(f"Engine '{module_id}' has no file '{name}'. Only files listed in its module.json are served.")
        return path
