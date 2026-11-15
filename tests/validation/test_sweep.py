# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Tests for pipeline/video_to_data/sweep.py with synthetic inputs (no NASA videos needed)."""
import sys
from pathlib import Path

import cv2
import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipeline.video_to_data import sweep, track  # noqa: E402


def test_relative_change():
    assert sweep.relative_change(11.0, 10.0) == pytest.approx(0.1)
    assert sweep.relative_change(5.0, 10.0) == pytest.approx(-0.5)
    assert sweep.relative_change(-5.0, -10.0) == pytest.approx(0.5)  # (-5 + 10) / 10
    assert sweep.relative_change(None, 10.0) is None
    assert sweep.relative_change(1.0, None) is None
    assert sweep.relative_change(1.0, 0.0) is None


def test_summarize_rates():
    s = sweep.summarize_rates({0.7: 9.0, 1.0: 10.0, 1.3: 13.0})
    assert s["max_rel_change"] == pytest.approx(0.3)
    assert s["rel_change"][0.7] == pytest.approx(-0.1)
    assert s["sign_change"] is False


def test_summarize_rates_missing_and_sign():
    assert sweep.summarize_rates({0.7: 1.0, 1.0: None, 1.3: 2.0})["max_rel_change"] is None
    s = sweep.summarize_rates({0.7: -2.0, 1.0: 10.0, 1.3: 10.0})
    assert s["sign_change"] is True
    assert s["max_rel_change"] == pytest.approx(1.2)
    s = sweep.summarize_rates({0.7: None, 1.0: 10.0, 1.3: 12.0})
    assert s["max_rel_change"] == pytest.approx(0.2)


def test_scaled_params_scales_only_the_pair():
    base = track.Params(axis="y", mask_top=50)
    p = sweep.scaled_params(base, 0.7)
    assert p.high == pytest.approx(base.high * 0.7)
    assert p.low == pytest.approx(base.low * 0.7)
    assert (p.axis, p.mask_top, p.min_area) == ("y", 50, base.min_area)
    assert base.high == 180.0
    with pytest.raises(ValueError):
        sweep.scaled_params(base, 0)


def test_video_dir_precedence():
    assert sweep.video_dir("a", {"PSI_DATA_DIR": "b"}) == Path("a")
    assert sweep.video_dir(None, {"PSI_DATA_DIR": "b"}) == Path("b")
    assert sweep.video_dir(None, {}) == sweep.DEFAULT_VIDEO_DIR


def test_sweep_video_on_synthetic_clip(tmp_path):
    """A red bar grows to the right at a steady speed (2 px per frame at 10 fps)."""
    w, h, fps, n = 240, 160, 10, 120
    path = str(tmp_path / "clip.avi")
    vw = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), fps, (w, h))
    assert vw.isOpened()
    for k in range(n):
        f = np.zeros((h, w, 3), np.uint8)
        if k >= 30:
            x1 = 20 + 2 * (k - 30)
            f[110:140, 10:x1 + 1, 2] = 140   # rim (red channel in BGR)
            f[115:135, 10:x1 - 3, 2] = 230   # core
        vw.write(f)
    vw.release()
    cfg = {"axis": "x", "direction": 1, "igniter_box": None, "roi": None,
           "track_start_s": 0.0, "track_end_s": None, "pre_start_s": 0.0, "pre_end_s": 2.0}
    out = sweep.sweep_video(path, cfg)
    assert set(out) == set(sweep.FACTORS)
    rates = {f: r["rate"] for f, r in out.items()}
    assert all(r is not None for r in rates.values()), out
    assert rates[1.0] == pytest.approx(20.0, rel=0.3)
    assert all(r["unit"] == "px/s" for r in out.values())
