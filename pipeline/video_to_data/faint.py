# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Last faint light: a second time for tests where a viewer saw a flame after the tracker lost it.

The main tracker uses fixed brightness thresholds (180 and 120) and loses a dim flame. This pass
uses low fixed thresholds on the signal above the dark frames (rule R1 of the noise experiment,
research/video-dim-flames-2026-11-14/noise/README.md): 16 and 8 brightness units, a 3x3 opening and a
region of at least 150 px. It depends on those thresholds and can follow an ember or a glowing
holder, so run.py applies it only to tests listed in faint_light.csv, where a viewer saw a
flame at that time. It is not the time the flame went out and never changes the main numbers.
"""
import numpy as np

from . import events, track

HIGH = 16               # brightness units above the background (seed of a region)
LOW = 8                 # brightness units above the background (extent of a region)
OPENING = 3
MIN_AREA_PX = 150
MAX_DIST_PX = 60.0
MIN_PRE_SAMPLES = 6     # fewer samples in the pre-ignition range: no faint time
SMALL_REGION_PX = 200   # last region below this: flag faint_small_region
MASK_TOP = 90
REASON_SHORT_LEAD_IN = "dark lead-in too short"
RULE_TEXT = "8 brightness units above the dark frames, region of at least 150 px"
LIMIT_TEXT = ("Last faint light is the time after which the tracker sees no light above a low fixed "
              "threshold (8 brightness units above the dark frames, in a region of at least 150 "
              "pixels). It depends on that threshold and can follow an ember or a glowing sample "
              "holder; it is not the time the flame went out. It is given only for tests where a "
              "viewer saw a flame at that time.")


def faint_light_areas(samples, pre_range, igniter_box=None, roi=None):
    """Faint-pass area per sample.

    samples: a callable returning a fresh iterator of (time_s, signal image) already limited to the
    track range, 5 per second, signal = maximum colour channel. pre_range: (start_s, end_s).
    Returns {"times", "areas", "reason"}; reason is set (and areas empty) when the lead-in is short.
    """
    t0, t1 = pre_range
    pre, valid = [], None
    for t, s in samples():
        if valid is None:
            valid = track.make_valid_mask(np.asarray(s).shape, MASK_TOP, igniter_box, roi)
        if t0 <= t <= t1:
            pre.append(s)
    if len(pre) < MIN_PRE_SAMPLES:
        return {"times": [], "areas": [], "reason": REASON_SHORT_LEAD_IN}
    background = track.background_median(pre)
    times, areas = [], []
    for t, s in samples():
        signal = np.asarray(s, dtype=np.float32) - background
        mask = track.hysteresis_mask(signal, valid, HIGH, LOW)
        mask = track.open_mask(mask, OPENING)
        mask = track.select_flame(mask, MIN_AREA_PX, MAX_DIST_PX)
        times.append(t)
        areas.append(int(mask.sum()))
    return {"times": times, "areas": areas, "reason": None}


def last_faint_light(samples, pre_range, igniter_box=None, roi=None):
    """The last faint light time and its caveats.

    Returns {"time_s", "area_px", "n_detected", "flags", "reason"}. time_s is None when the lead-in
    is short (reason set), no light is found, or the faint series is still lit at its end.
    """
    out = {"time_s": None, "area_px": None, "n_detected": 0, "flags": [], "reason": None}
    series = faint_light_areas(samples, pre_range, igniter_box, roi)
    out["reason"] = series["reason"]
    if series["reason"]:
        return out
    times, areas = series["times"], series["areas"]
    out["n_detected"] = sum(1 for a in areas if a > 0)
    ev = events.detect_events(times, areas, pre_range)
    if ev["ignition_time_s"] is None:
        out["reason"] = "no faint light found"
        return out
    if ev["censored"] or ev["extinction_time_s"] is None:
        out["reason"] = "still lit at the end of the video"
        return out
    out["time_s"] = ev["extinction_time_s"]
    last = [a for t, a in zip(times, areas) if a > 0 and t < ev["extinction_time_s"]]
    out["area_px"] = last[-1] if last else None
    if out["area_px"] is not None and out["area_px"] < SMALL_REGION_PX:
        out["flags"].append("faint_small_region")
    return out
