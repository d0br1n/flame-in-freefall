# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Loader for config.csv: one checked row per plain main-view B-series video (Linear DOB-38).

Each row holds the inputs the tracker (`track.py`), the events step (`events.py`) and the rate
fit (`fit.py`) need for that video, plus the times an SI viewer noted on contact sheets so the
detectors can be compared with an eye reading. The `eye_*` times are an SI viewing, not a
human measurement.

`load_config(path)` is pure: stdlib only, no video access. An empty cell becomes None.
"""
import csv
from dataclasses import dataclass
from typing import Optional, Tuple

COLUMNS = [
    "file_name", "test_id", "axis", "direction", "track_start_s", "track_end_s", "pre_ignition_start_s",
    "pre_ignition_end_s", "igniter_box", "roi", "eye_spark_s", "eye_ignition_s", "eye_gone_s",
    "eye_censored", "eye_quality", "viewed_by", "notes",
]

Box = Tuple[int, int, int, int]


@dataclass(frozen=True)
class ConfigRow:
    file_name: str
    test_id: Optional[str]  # None when the file is unmatched in the manifest (a human decides)
    axis: str  # "x" or "y"
    direction: int  # 1 or -1: which way the flame spreads along the axis
    track_start_s: float
    track_end_s: Optional[float]  # last usable time; None when the whole video is usable
    pre_ignition_start_s: float
    pre_ignition_end_s: float
    igniter_box: Optional[Box]  # x0,y0,x1,y1 in pixels (x1,y1 exclusive)
    roi: Optional[Box]
    eye_spark_s: Optional[float]
    eye_ignition_s: Optional[float]
    eye_gone_s: Optional[float]
    eye_censored: bool  # True when the video ends while the flame still burns
    eye_quality: str  # "spreading", "doubtful" or "no_spread", as seen on contact sheets
    viewed_by: str
    notes: str


def _text(value):
    value = (value or "").strip()
    return value or None


def _float(value):
    value = _text(value)
    return None if value is None else float(value)


def _box(value):
    value = _text(value)
    if value is None:
        return None
    parts = value.split(",")
    if len(parts) != 4:
        raise ValueError(f"box needs four integers x0,y0,x1,y1: {value!r}")
    x0, y0, x1, y1 = (int(p) for p in parts)
    return (x0, y0, x1, y1)


def _yes_no(value):
    value = (value or "").strip().lower()
    if value not in ("yes", "no"):
        raise ValueError(f"eye_censored must be yes or no: {value!r}")
    return value == "yes"


def load_config(path):
    """Read config.csv into a list of ConfigRow. Raises ValueError on a bad header or cell."""
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != COLUMNS:
            raise ValueError(f"unexpected header: {reader.fieldnames}")
        rows = []
        for r in reader:
            rows.append(ConfigRow(
                file_name=r["file_name"],
                test_id=_text(r["test_id"]),
                axis=r["axis"].strip(),
                direction=int(r["direction"]),
                track_start_s=float(r["track_start_s"]),
                track_end_s=_float(r["track_end_s"]),
                pre_ignition_start_s=float(r["pre_ignition_start_s"]),
                pre_ignition_end_s=float(r["pre_ignition_end_s"]),
                igniter_box=_box(r["igniter_box"]),
                roi=_box(r["roi"]),
                eye_spark_s=_float(r["eye_spark_s"]),
                eye_ignition_s=_float(r["eye_ignition_s"]),
                eye_gone_s=_float(r["eye_gone_s"]),
                eye_censored=_yes_no(r["eye_censored"]),
                eye_quality=r["eye_quality"].strip(),
                viewed_by=r["viewed_by"].strip(),
                notes=r["notes"].strip(),
            ))
    return rows
