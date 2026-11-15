# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Threshold sweep of the flame tracker (Linear DOB-42).

What it does: for each test it runs the tracker three times, with the flame threshold at
x0.7, x1.0 and x1.3 of its default, fits the spread rate each time exactly as run.py does
(fit.fit_spread_rate on the leading edge between ignition and extinction, px/s, no scale),
and reports the three rates, the largest relative change from the x1.0 rate, and the flags.

The threshold: track.Params has a hysteresis pair, `high` (default 180) and `low` (default 120),
on the brightness signal (max colour channel). Together they define the flame mask. The sweep
scales BOTH by the same factor, so the pair keeps its ratio. The other settings (min_area,
max_dist, opening, mask_top) and the per-video config in config.csv stay as they are.

How: every video is decoded once, at 5 samples per second like run.py (same frame sampling,
same track range, same events.detect_events). Each sampled frame is tracked three times.
Tracker, event and fit functions are imported, not copied.

What it does NOT do: a threshold sweep shows how sensitive the rate is to ONE parameter. It says
nothing about accuracy. A rate that barely moves can still be wrong, and a rate that moves a lot
is a sign that the result depends on the setting. Nothing is written into data/modules/.

Run: python -m pipeline.video_to_data.sweep --out sweep.json [--videos DIR] [--only B1,B3]
The video folder is --videos, else the environment variable PSI_DATA_DIR, else
REPO/data/raw/files/PSI-25.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from . import events, fit, run, track

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_VIDEO_DIR = ROOT / "data" / "raw" / "files" / "PSI-25"
FACTORS = (0.7, 1.0, 1.3)
DEFAULT_TESTS = ("B1", "B3", "B4", "B11", "B13")


def video_dir(cli_value=None, env=None):
    """Video folder: CLI value, else PSI_DATA_DIR, else the repo default."""
    env = os.environ if env is None else env
    if cli_value:
        return Path(cli_value)
    if env.get("PSI_DATA_DIR"):
        return Path(env["PSI_DATA_DIR"])
    return DEFAULT_VIDEO_DIR


def scaled_params(base, factor):
    """Copy of the tracker Params with `high` and `low` multiplied by factor."""
    if not factor > 0:
        raise ValueError("factor must be positive")
    return track.Params(**{**base.__dict__, "high": base.high * factor, "low": base.low * factor})


def relative_change(rate, base_rate):
    """(rate - base) / |base|; None if either is missing or the base is zero."""
    if rate is None or base_rate is None or base_rate == 0:
        return None
    return (rate - base_rate) / abs(base_rate)


def summarize_rates(rates, factors=FACTORS, base_factor=1.0):
    """rates: {factor: rate or None}. Returns the changes and the largest absolute change.

    max_rel_change is the largest |change| over the factors other than the base factor, or None
    when no change can be computed. sign_change is True when a rate has the opposite sign to
    the base rate.
    """
    base = rates.get(base_factor)
    changes = {f: relative_change(rates.get(f), base) for f in factors if f != base_factor}
    known = [abs(c) for c in changes.values() if c is not None]
    sign_change = any(rates.get(f) is not None and base not in (None, 0) and rates[f] * base < 0
                      for f in factors if f != base_factor)
    return {"rel_change": changes, "max_rel_change": max(known) if known else None,
            "sign_change": sign_change}


def sweep_video(video, cfg, factors=FACTORS, fps=run.FPS, seed=run.SEED):
    """Track one video at every factor. Returns {factor: result dict}.

    Follows run.measure_video: same sampling, track range, background policy, events and fit.
    """
    base = track.Params(axis=cfg["axis"], igniter_box=cfg["igniter_box"], roi=cfg["roi"])
    params = {f: scaled_params(base, f) for f in factors}
    src_fps, _, _, _ = track.video_info(video)
    background = None
    if run.BACKGROUND_SUBTRACTION:
        pre = [s for idx, s, _ in track.iter_sampled(video, fps)
               if cfg["pre_start_s"] <= idx / src_fps <= cfg["pre_end_s"]]
        if not pre:
            raise ValueError("no sampled frame inside the pre-ignition range")
        background = track.background_median(pre)
    rows = {f: [] for f in factors}
    valid = None
    for idx, s, _ in track.iter_sampled(video, fps):
        t = idx / src_fps
        if not run.within_track_range(t, cfg["track_start_s"], cfg.get("track_end_s")):
            continue
        if valid is None:
            valid = track.make_valid_mask(s.shape, base.mask_top, base.igniter_box, base.roi)
        for f in factors:
            r, _, _ = track.track_signals([s], params[f], background, valid)
            rows[f].append({"frame": idx, "time_s": t, **r[0]})
    if not rows[factors[0]]:
        raise ValueError("no frames decoded between track_start_s and track_end_s")
    out = {}
    for f in factors:
        ev = events.detect_events([r["time_s"] for r in rows[f]],
                                  [r["area_px"] for r in rows[f]],
                                  (cfg["pre_start_s"], cfg["pre_end_s"]))
        res = {"rate": None, "unit": "px/s", "flags": [], "ignition_time_s": ev["ignition_time_s"],
               "extinction_time_s": ev["extinction_time_s"], "outcome": ev["outcome"],
               "n_samples": len(rows[f])}
        if ev["ignition_time_s"] is None:
            res["flags"] = ["no_ignition"]
        else:
            window = run.fit_window_rows(rows[f], ev["ignition_time_s"], ev["extinction_time_s"])
            t, y = fit.leading_edge(window, cfg["direction"])
            ft = fit.fit_spread_rate(t, y, seed=seed)
            res.update(rate=ft["rate"], unit=ft["unit"], flags=list(ft.get("flags") or []),
                       n_points=ft["n_points"])
        out[f] = res
    return out


def sweep(videos_dir, tests=DEFAULT_TESTS, config_path=None, factors=FACTORS, log=print):
    """Sweep every test in `tests`. Returns the report dict."""
    configs, _ = run.parse_config(run.read_csv(config_path or run.ENGINE_DIR / "config.csv"))
    by_name = {run.short_name(c["test_id"]): c for c in configs}
    report = {"parameter": "track.Params high and low, scaled together",
              "defaults": {"high": track.Params().high, "low": track.Params().low},
              "factors": list(factors), "fps": run.FPS, "tests": {}}
    for name in tests:
        cfg = by_name.get(name)
        if cfg is None:
            report["tests"][name] = {"error": "no row in config.csv"}
            continue
        video = Path(videos_dir) / cfg["file_name"]
        if not video.is_file():
            report["tests"][name] = {"error": f"video file not found in {Path(videos_dir).name}"}
            continue
        log(f"{name}: sweeping {cfg['file_name']}")
        t0 = time.time()
        try:
            res = sweep_video(video, cfg, factors)
        except ValueError as err:
            report["tests"][name] = {"error": str(err)}
            continue
        rates = {f: res[f]["rate"] for f in factors}
        summ = summarize_rates(rates, factors)
        flags = sorted({fl for f in factors for fl in res[f]["flags"]})
        report["tests"][name] = {
            "rates_px_per_s": {str(f): rates[f] for f in factors},
            "rel_change": {str(f): c for f, c in summ["rel_change"].items()},
            "max_rel_change": summ["max_rel_change"], "sign_change": summ["sign_change"],
            "flags": flags,
            "flags_by_factor": {str(f): res[f]["flags"] for f in factors},
            "ignition_time_s": {str(f): res[f]["ignition_time_s"] for f in factors},
            "extinction_time_s": {str(f): res[f]["extinction_time_s"] for f in factors},
            "seconds": round(time.time() - t0, 1)}
    return report


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m pipeline.video_to_data.sweep",
                                 description="Threshold sweep (x0.7, x1.0, x1.3) of the tracker.")
    ap.add_argument("--videos", default=None, help="video folder (else PSI_DATA_DIR, else repo)")
    ap.add_argument("--only", default=",".join(DEFAULT_TESTS), help="comma list, e.g. B1,B4")
    ap.add_argument("--out", default=None, help="write JSON here (default: print only)")
    ap.add_argument("--config", default=None)
    a = ap.parse_args(argv)
    if a.out and "data/modules" in Path(a.out).resolve().as_posix():
        ap.error("--out must not be inside data/modules")
    tests = [s.strip() for s in a.only.split(",") if s.strip()]
    report = sweep(video_dir(a.videos), tests, a.config)
    text = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if a.out:
        Path(a.out).write_text(text)
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
