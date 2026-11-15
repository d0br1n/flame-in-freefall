# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Stages of one test flame from its flame-light curve: growth, fully developed, decay.

Where the names come from. NIST's Fire Dynamics page describes a fuel-limited fire as growing
until all the fuel available is burning ("fully developed") and then decaying. The three stage
NAMES below follow that description (`STAGE_CITATION`, `STAGE_LINK`). Where one stage ends and
the next begins is NOT from NIST: the limits are the team's own rule, written below and applied
to the flame-light curve of one small test flame in a BASS-II video. This is not a hazard
rating and says nothing about a cabin fire.

Flame light is the flame area in pixels times the mean brightness inside the flame
(`area_px * signal` of the track table). It is a RELATIVE, UNCALIBRATED number: the video is
8-bit, the exposure is unknown and flame cores saturate. It is not a temperature, an energy or
a heat release.

The rule (every number is a named parameter)
- Only samples with ignition_s <= time <= extinction_s are used (to the last sample when the
  flame is still burning at the end, `extinction_s=None`).
- Smooth the curve with a running median of `smooth` samples (default 5, shorter at the ends).
- plateau = the `plateau_pct` percentile (default 90) of the smoothed curve, linear interpolation.
- growth: from ignition until the smoothed curve first stays at or above `hold_frac` (default
  0.8) of the plateau for `hold_s` (default 1.0 s). A run lasts from its first sample to the
  next sample, as in events.py.
- decay: from the last time the smoothed curve is at or above that level until extinction (or
  the end when the flame was still burning).
- fully developed: in between.
- A stage of zero length is left out, so a still-burning flame that ends at the plateau ends in
  `fully developed`.
- If the curve never holds that level for `hold_s`: a single `growth` stage up to the peak of
  the smoothed curve followed by `decay` from the peak, and the flag `no_plateau`.
- Fewer than `smooth` samples, or no usable sample: no stages (an empty list) and the flag
  `too_short`.

Pure functions, stdlib only, no file access.
"""
import math
import statistics

STAGE_CITATION = ("NIST, Fire Dynamics (Fire Research Division), created 17 November 2010, "
                  "updated 9 September 2025")
STAGE_LINK = "https://www.nist.gov/el/fire-research-division-73300/firegov-fire-service/fire-dynamics"
STAGE_NAMES = ("growth", "fully developed", "decay")
STAGE_RULE_TEXT = ("Growth runs from ignition until the smoothed flame light stays at or above 80% "
                   "of its plateau (the 90th percentile) for 1 s, decay runs from the last time it "
                   "is at or above that level until the flame leaves the video, and fully "
                   "developed is in between; the limits are the team's own rule.")
NO_PLATEAU = "no_plateau"
TOO_SHORT = "too_short"

_EPS = 1e-9


def flame_light(area_px, signal):
    """Flame light of one sample: area in px times the mean brightness inside the flame."""
    return float(area_px) * float(signal)


def median_smooth(values, window=5):
    """Running median with a centred window, shorter at the ends."""
    if window < 1 or window % 2 == 0:
        raise ValueError("smooth window must be a positive odd number of samples")
    half = window // 2
    return [statistics.median(values[max(0, i - half):i + half + 1]) for i in range(len(values))]


def percentile(values, pct):
    """Percentile with linear interpolation between order statistics."""
    s = sorted(values)
    if not s:
        raise ValueError("empty input")
    pos = (len(s) - 1) * pct / 100.0
    lo = int(math.floor(pos))
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def _duration(times, first, last):
    end = times[last + 1] if last + 1 < len(times) else times[last]
    return end - times[first]


def _runs(mask):
    start = None
    for i, flag in enumerate(mask):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            yield start, i - 1
            start = None
    if start is not None:
        yield start, len(mask) - 1


def find_stages(times, light, ignition_s, extinction_s=None, smooth=5, plateau_pct=90.0,
                hold_frac=0.8, hold_s=1.0):
    """Stages of one flame-light curve.

    times (s, non-decreasing) and light (same length). Returns a dict: stages (list of
    {"stage", "start_s", "end_s"}, contiguous, in time order), flags (list of str), plateau,
    peak (maximum of the smoothed curve), peak_time_s, n_samples (samples used).
    """
    if len(times) != len(light):
        raise ValueError("times and light must have the same length")
    hi_t = math.inf if extinction_s is None else extinction_s
    pts = [(float(t), float(v)) for t, v in zip(times, light)
           if ignition_s - _EPS <= t <= hi_t + _EPS]
    out = {"stages": [], "flags": [], "plateau": None, "peak": None, "peak_time_s": None,
           "n_samples": len(pts)}
    if len(pts) < smooth:
        out["flags"].append(TOO_SHORT)
        return out
    if any(b[0] < a[0] for a, b in zip(pts, pts[1:])):
        raise ValueError("times must be non-decreasing")
    t = [p[0] for p in pts]
    sm = median_smooth([p[1] for p in pts], smooth)
    plateau = percentile(sm, plateau_pct)
    peak_i = max(range(len(sm)), key=lambda i: (sm[i], -i))
    out.update(plateau=plateau, peak=sm[peak_i], peak_time_s=t[peak_i])
    start = t[0]
    end = t[-1] if extinction_s is None else max(extinction_s, t[-1])
    level = hold_frac * plateau
    above = [v >= level for v in sm]
    held = next(((a, b) for a, b in _runs(above) if _duration(t, a, b) >= hold_s - _EPS), None)

    def add(name, a, b):
        if b - a > _EPS:
            out["stages"].append({"stage": name, "start_s": a, "end_s": b})

    if plateau <= 0 or held is None:
        out["flags"].append(NO_PLATEAU)
        add("growth", start, t[peak_i])
        add("decay", t[peak_i], end)
        return out
    growth_end = t[held[0]]
    last_above = max(i for i, flag in enumerate(above) if flag)
    decay_start = max(t[last_above], growth_end)
    add("growth", start, growth_end)
    add("fully developed", growth_end, decay_start)
    add("decay", decay_start, end)
    return out


def stage_at(stage_list, time_s):
    """Name of the stage that contains time_s (start inclusive, end exclusive, the last
    stage's end inclusive), or "" when none does."""
    for i, s in enumerate(stage_list):
        last = i == len(stage_list) - 1
        if s["start_s"] - _EPS <= time_s < s["end_s"] - _EPS or (last and abs(time_s - s["end_s"]) <= _EPS):
            return s["stage"]
    return ""
