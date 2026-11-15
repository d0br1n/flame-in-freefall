# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Flame events from a flame-area-over-time series: ignition, extinction, how the test ended.

Input is one test's per-frame track table (the CSV written by the flame tracker): `time_s`
and `area_px` always, plus optional `edge_min_px` / `edge_max_px`. Sampling may be irregular,
so every duration here is computed from `time_s`, never from a sample count.

The rules and thresholds below are the team's own (Linear DOB-39). They are not taken from
any NASA or published method. Every number used is returned in `thresholds`, so a reader
can see exactly what was applied.

Rules
- The area is smoothed with a short median filter (default 3 samples).
- Thresholds come from the pre-ignition noise of the SAME series: from the samples whose time
  lies in the given `pre_ignition` range, level = median and spread = 1.4826 * MAD (MAD scaled
  so that it equals the standard deviation for normal noise). The margin above the level is
  max(k * spread, floor), so a noise-free series (spread 0) still gets a usable threshold:
  high = level + max(k_high * spread, high_floor_px), low = level + max(k_low * spread,
  low_floor_px). Defaults: k_high 8, k_low 4, high floor 40 px, low floor 15 px.
- Ignition: the first time the smoothed area stays above `high` for at least 1.0 s. Reported
  at the first sample of that run.
- Extinction: the first time after ignition that the smoothed area stays below `low` for at
  least 2.0 s and does not come back afterwards. "Comes back" means a run above `high` that
  lasts at least the ignition hold (1.0 s), so one noisy sample after the flame is out does
  not undo the extinction. If it does come back the flame was not out: the search continues
  and the flag `reignition` is set. Reported at the first sample of the dark run.
- A run lasts from its first sample to the time of the next sample (the first sample that
  breaks it); a run that reaches the last sample ends at that sample.
- Censored: the series ends with no qualifying extinction (flame still present at the end).
  Then `extinction_time_s` and `burn_duration_s` are None and `censored` is True.
- No flame: ignition None, outcome `no_flame`.
- Outcome: `no_flame`, `censored`, `burnout` or `unclassified`. `burnout` is assigned only
  when `sample_end_px`, `direction` (+1 or -1) and `edges` are all given and the leading
  edge (edge_max_px for +1, edge_min_px for -1, extreme over the 2.0 s before extinction)
  was within `edge_tolerance_px` (default 10 px, a team choice) of the sample end.
  `quench`, `blow_off` and `fan_off` are valid labels of the wider schema but need the flow
  history, which this module does not have, so it never returns them.

Limits (also in `LIMITS`): see the constant below. In short, extinction time here is the
time the flame leaves the video, not proof of extinction.
"""
import argparse
import csv
import json
import math
import statistics
import sys

LIMITS = [
    "A dim blue flame can vanish from the video before it is truly out.",
    "The extinction time is the time the flame leaves the video, not proof of extinction.",
    "The thresholds and hold times are the team's own rules, not a published method.",
    "quench, blow_off and fan_off need the flow history and are never assigned here.",
]

_EPS = 1e-9
_MAD_TO_SIGMA = 1.4826
_FLOAT_COLS = ("time_s", "edge_min_px", "edge_max_px", "signal")


def _opt_float(text):
    if text is None or str(text).strip() == "":
        return None
    value = float(text)
    return None if math.isnan(value) else value


def load_track(path):
    """Read a track CSV into a list of dict rows (frame int, area_px int, floats or None)."""
    rows = []
    with open(path, newline="", encoding="utf-8") as handle:
        for raw in csv.DictReader(handle):
            row = {"frame": int(raw["frame"]), "time_s": float(raw["time_s"]),
                   "area_px": int(float(raw["area_px"]))}
            for col in _FLOAT_COLS[1:]:
                row[col] = _opt_float(raw.get(col))
            rows.append(row)
    return rows


def _median_filter(values, window):
    if window < 1 or window % 2 == 0:
        raise ValueError("smooth window must be a positive odd number of samples")
    half = window // 2
    return [statistics.median(values[max(0, i - half):i + half + 1])
            for i in range(len(values))]


def _runs(mask):
    """(first, last) index pairs of consecutive True values."""
    start = None
    for i, flag in enumerate(mask):
        if flag and start is None:
            start = i
        elif not flag and start is not None:
            yield start, i - 1
            start = None
    if start is not None:
        yield start, len(mask) - 1


def _duration(times, first, last):
    end = times[last + 1] if last + 1 < len(times) else times[last]
    return end - times[first]


def _sustained_above(times, mask, hold_s, after_index=0):
    """First run (first, last) of `mask` at or after `after_index` lasting >= hold_s."""
    for first, last in _runs(mask):
        if first >= after_index and _duration(times, first, last) >= hold_s - _EPS:
            return first, last
    return None


def _leading_edge(times, edges, idx, direction, window_s):
    lo = times[idx] - window_s
    vals = [edges[k] for k in range(idx + 1) if times[k] >= lo - _EPS
            and edges[k] is not None and not math.isnan(edges[k])]
    if not vals:
        return None
    return max(vals) if direction > 0 else min(vals)


def detect_events(times, areas, pre_ignition, smooth_window=3, k_high=8.0, k_low=4.0,
                  high_floor_px=40.0, low_floor_px=15.0, min_on_s=1.0, min_off_s=2.0,
                  edges=None, sample_end_px=None, direction=None, edge_tolerance_px=10.0,
                  edge_window_s=2.0):
    """Find ignition and extinction in one test's area series.

    times: seconds, non-decreasing. areas: flame pixels per sample, same length.
    pre_ignition: (t0, t1) seconds; the samples inside set the noise level and spread.
    edges: optional list of (edge_min_px, edge_max_px) per sample, None where no flame.
    sample_end_px, direction (+1 or -1): where the sample ends along the spread axis and which
    way the flame spreads; both are needed, with `edges`, for the outcome `burnout`.
    Returns a dict: ignition_time_s, extinction_time_s, burn_duration_s, censored, outcome,
    thresholds, peak_area_px, flags (list of str), limits.
    """
    n = len(times)
    if n != len(areas) or (edges is not None and len(edges) != n):
        raise ValueError("times, areas and edges must have the same length")
    if n == 0:
        raise ValueError("empty series")
    if any(b < a for a, b in zip(times, times[1:])):
        raise ValueError("times must be non-decreasing")
    if direction not in (None, 1, -1):
        raise ValueError("direction must be +1, -1 or None")
    t0, t1 = pre_ignition
    smooth = _median_filter([float(a) for a in areas], smooth_window)

    flags = []
    pre = [smooth[i] for i in range(n) if t0 - _EPS <= times[i] <= t1 + _EPS]
    if len(pre) < 3:
        flags.append("short_pre_ignition")
    if pre:
        level = statistics.median(pre)
        spread = _MAD_TO_SIGMA * statistics.median([abs(v - level) for v in pre])
    else:
        level, spread = 0.0, 0.0
    if level >= high_floor_px:
        flags.append("flame_in_pre_ignition")
    high = level + max(k_high * spread, high_floor_px)
    low = level + max(k_low * spread, low_floor_px)
    if low > high:
        raise ValueError("low threshold above high threshold; check k and floor parameters")
    thresholds = {
        "level_px": level, "spread_px": spread, "high_px": high, "low_px": low,
        "k_high": k_high, "k_low": k_low, "high_floor_px": high_floor_px,
        "low_floor_px": low_floor_px, "smooth_window": smooth_window,
        "min_on_s": min_on_s, "min_off_s": min_off_s, "pre_ignition_s": [t0, t1],
        "n_pre_samples": len(pre), "edge_tolerance_px": edge_tolerance_px,
    }

    result = {"ignition_time_s": None, "extinction_time_s": None, "burn_duration_s": None,
              "censored": False, "outcome": "no_flame", "thresholds": thresholds,
              "peak_area_px": None, "flags": flags, "limits": list(LIMITS)}

    above = [v > high for v in smooth]
    ign = _sustained_above(times, above, min_on_s)
    if ign is None:
        return result
    ign_idx = ign[0]
    result["ignition_time_s"] = times[ign_idx]

    below = [v < low for v in smooth]
    ext_idx = None
    for first, last in _runs(below):
        if first <= ign_idx or _duration(times, first, last) < min_off_s - _EPS:
            continue
        if _sustained_above(times, above, min_on_s, after_index=last + 1):
            if "reignition" not in flags:
                flags.append("reignition")
            continue
        ext_idx = first
        break

    end = ext_idx if ext_idx is not None else n - 1
    result["peak_area_px"] = max(smooth[ign_idx:end + 1])
    if ext_idx is None:
        result["censored"] = True
        result["outcome"] = "censored"
        return result
    result["extinction_time_s"] = times[ext_idx]
    result["burn_duration_s"] = times[ext_idx] - times[ign_idx]
    result["outcome"] = "unclassified"
    if sample_end_px is not None and direction is not None:
        if edges is None:
            flags.append("no_edge_data")
        else:
            col = 1 if direction > 0 else 0
            lead = _leading_edge(times, [e[col] if e is not None else None for e in edges],
                                 ext_idx, direction, edge_window_s)
            if lead is None:
                flags.append("no_edge_data")
            elif abs(lead - sample_end_px) <= edge_tolerance_px:
                result["outcome"] = "burnout"
    return result


def main(argv=None):
    ap = argparse.ArgumentParser(description="Detect flame ignition and extinction in a track CSV.")
    ap.add_argument("track_csv")
    ap.add_argument("--pre-start", type=float, required=True, help="pre-ignition range start, s")
    ap.add_argument("--pre-end", type=float, required=True, help="pre-ignition range end, s")
    ap.add_argument("--sample-end-px", type=float)
    ap.add_argument("--direction", type=int, choices=(1, -1))
    args = ap.parse_args(argv)
    rows = load_track(args.track_csv)
    edges = None
    if any(r["edge_max_px"] is not None for r in rows):
        edges = [(r["edge_min_px"], r["edge_max_px"]) for r in rows]
    res = detect_events([r["time_s"] for r in rows], [r["area_px"] for r in rows],
                        (args.pre_start, args.pre_end), edges=edges,
                        sample_end_px=args.sample_end_px, direction=args.direction)
    json.dump(res, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
