# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Flame-edge track -> spread rate with an honest interval (Linear DOB-40).

Input: leading-edge position against time, taken from the per-frame track table
(columns frame, time_s, area_px, edge_min_px, edge_max_px, signal). Always use time_s: sampling
is 2 to 5 rows per second and may be irregular.

Position convention used in this module: the "advance coordinate" grows when the flame advances
in its direction. `leading_edge` builds it: direction +1 uses edge_max_px, direction -1 uses
-edge_min_px. A positive rate therefore means the flame advanced in its direction, and a
direction -1 series gives the same rate as the mirrored direction +1 series.

Method
- Rate: Theil-Sen slope (median of pairwise slopes) of position against time over a steady
  window. Never frame-to-frame differences.
- Steady window: the longest stretch of sliding windows whose Theil-Sen slope stays within a
  relative tolerance of the median sliding-window slope.
- Interval: moving-block bootstrap over time on the residuals of the Theil-Sen fit (residuals of
  a tracked edge are correlated, so an ordinary bootstrap would be too narrow). With a pixel
  scale and its relative uncertainty, the two half-widths are combined in quadrature; the scale
  relative uncertainty is read as a half-width at the same confidence level as the interval.
- Second estimate: `ols_rate` is an ordinary least-squares line through the same edge positions
  in the same window. The issue asks for "a line fitted to the kymograph edge"; no kymograph
  image exists yet, so this stands in for it. A kymograph-based estimate can replace it later
  without changing the output keys.
- Units: with scale_px_per_mm the rate is mm/s; without it px/s and the flag `no_scale`.
  A scale is never invented.

Flags are kept in the output; a flagged result is never dropped. `steady_under_20s` is the 20 s
criterion in Linear DOB-40 (not a quotation of the source paper). No threshold here was tuned to
match any published number.

Everything is pure and deterministic: every random step takes a seed.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import sys

import numpy as np

CI_LEVEL = 0.95
RATE_RANGE_MM_S = (0.005, 10.0)
MAX_BOOT_PAIRS = 6000  # speed cap on the pairs used inside the bootstrap loop


# ---------------------------------------------------------------- input

def leading_edge(rows, direction):
    """Return (times, positions) arrays from track-table rows.

    rows: iterable of dicts (csv.DictReader rows or the tracker's own dicts) with time_s,
    edge_min_px, edge_max_px. Rows with an empty or non-finite edge are dropped. Positions are
    the advance coordinate (see module docstring). Output is sorted by time.
    """
    if direction not in (1, -1):
        raise ValueError("direction must be +1 or -1")
    key = "edge_max_px" if direction == 1 else "edge_min_px"
    ts, ps = [], []
    for r in rows:
        raw_t, raw_p = r.get("time_s"), r.get(key)
        if raw_t in (None, "") or raw_p in (None, ""):
            continue
        t, p = float(raw_t), float(raw_p)
        if not (math.isfinite(t) and math.isfinite(p)):
            continue
        ts.append(t)
        ps.append(direction * p)
    order = np.argsort(ts, kind="stable")
    return np.asarray(ts, dtype=float)[order], np.asarray(ps, dtype=float)[order]


# ---------------------------------------------------------------- slopes

def _pairs(n):
    return np.triu_indices(n, k=1)


def _theil_sen_batch(times, ys, pairs=None):
    """Theil-Sen slope for each row of ys (shape (B, n)) against shared times."""
    n = len(times)
    i, j = pairs if pairs is not None else _pairs(n)
    dt = times[j] - times[i]
    ok = dt > 0
    i, j, dt = i[ok], j[ok], dt[ok]
    if dt.size == 0:
        return np.full(ys.shape[0], np.nan)
    return np.median((ys[:, j] - ys[:, i]) / dt, axis=1)


def theil_sen(times, positions):
    """Theil-Sen fit. Returns (slope, intercept): slope = median of pairwise slopes,
    intercept = median of (position - slope * time). Pairs with equal times are skipped."""
    t = np.asarray(times, dtype=float)
    y = np.asarray(positions, dtype=float)
    if t.size < 2:
        raise ValueError("need at least 2 points")
    slope = float(_theil_sen_batch(t, y[None, :])[0])
    if not math.isfinite(slope):
        raise ValueError("all times are equal")
    return slope, float(np.median(y - slope * t))


def ols(times, positions):
    """Ordinary least-squares slope and intercept."""
    t = np.asarray(times, dtype=float)
    y = np.asarray(positions, dtype=float)
    tm, ym = t.mean(), y.mean()
    den = float(np.sum((t - tm) ** 2))
    if den == 0:
        raise ValueError("all times are equal")
    slope = float(np.sum((t - tm) * (y - ym)) / den)
    return slope, float(ym - slope * tm)


# ---------------------------------------------------------------- steady window

def steady_window(times, positions, width_s=5.0, rel_tol=0.35, min_points=6):
    """Longest stretch in which the sliding-window slope stays within rel_tol of its median.

    Sliding windows start at every sample time t_i and cover [t_i, t_i + width_s]; a window with
    fewer than min_points samples is ignored. Returns (start_s, end_s, info) where start/end are
    the first and last sample times of the winning stretch, and info has `median_slope`,
    `n_windows`, `found` (False when no window qualified: then start/end are the full range).
    """
    t = np.asarray(times, dtype=float)
    y = np.asarray(positions, dtype=float)
    full = (float(t[0]), float(t[-1])) if t.size else (float("nan"), float("nan"))
    starts, slopes = [], []
    for a in range(t.size):
        if t[a] + width_s > t[-1] + 1e-9:
            break
        b = int(np.searchsorted(t, t[a] + width_s, side="right"))
        if b - a < min_points:
            continue
        starts.append(a)
        slopes.append(_theil_sen_batch(t[a:b], y[None, a:b])[0])
    if not starts:
        return full[0], full[1], {"median_slope": None, "n_windows": 0, "found": False}
    slopes = np.asarray(slopes)
    med = float(np.median(slopes))
    good = np.abs(slopes - med) <= rel_tol * abs(med)
    best = None  # (duration, first_index_in_starts, last_index_in_starts)
    k = 0
    while k < len(good):
        if not good[k]:
            k += 1
            continue
        m = k
        while m + 1 < len(good) and good[m + 1]:
            m += 1
        b_last = int(np.searchsorted(t, t[starts[m]] + width_s, side="right")) - 1
        dur = t[b_last] - t[starts[k]]
        if best is None or dur > best[0]:
            best = (dur, starts[k], b_last)
        k = m + 1
    if best is None:
        return full[0], full[1], {"median_slope": med, "n_windows": len(starts), "found": False}
    return float(t[best[1]]), float(t[best[2]]), {
        "median_slope": med, "n_windows": len(starts), "found": True}


# ---------------------------------------------------------------- interval

def block_bootstrap_ci(times, positions, block_s=2.0, n_boot=1000, level=CI_LEVEL, seed=0):
    """Moving-block bootstrap interval for the Theil-Sen slope (units of position per time).

    The residuals of the Theil-Sen fit are resampled in overlapping blocks of block_s seconds
    (converted to a whole number of samples with the median sampling step), added back onto the
    fitted line, and the slope is re-estimated with Theil-Sen. Returns (low, high) percentile
    interval. Seeded.
    """
    t = np.asarray(times, dtype=float)
    y = np.asarray(positions, dtype=float)
    n = t.size
    slope, icpt = theil_sen(t, y)
    fitted = slope * t + icpt
    resid = (y - fitted) * math.sqrt(n / max(1, n - 2))  # small-sample inflation (2 fitted parameters)
    dt_med = float(np.median(np.diff(t)))
    blk = int(min(n, max(1, round(block_s / dt_med)))) if dt_med > 0 else 1
    n_blocks = -(-n // blk)
    n_starts = n - blk + 1
    rng = np.random.default_rng(seed)
    pairs = _pairs(n)
    if len(pairs[0]) > MAX_BOOT_PAIRS:
        # long windows: re-estimate each resample from a fixed seeded subset of the pairs
        # (the point estimate itself always uses every pair)
        pick = np.sort(rng.choice(len(pairs[0]), size=MAX_BOOT_PAIRS, replace=False))
        pairs = (pairs[0][pick], pairs[1][pick])
    out = np.empty(n_boot)
    chunk = max(1, int(2_000_000 // max(1, len(pairs[0]))))
    offs = np.arange(blk)
    done = 0
    while done < n_boot:
        c = min(chunk, n_boot - done)
        st = rng.integers(0, n_starts, size=(c, n_blocks))
        idx = (st[:, :, None] + offs[None, None, :]).reshape(c, -1)[:, :n]
        out[done:done + c] = _theil_sen_batch(t, fitted[None, :] + resid[idx], pairs)
        done += c
    lo, hi = np.percentile(out, [50 * (1 - level), 100 - 50 * (1 - level)])
    return float(lo), float(hi)


# ---------------------------------------------------------------- the fit

def _rel(a, b):
    """Relative difference of a from b (|a-b| / |b|); 0 when both are 0."""
    if b == 0:
        return 0.0 if a == 0 else float("inf")
    return abs(a - b) / abs(b)


def fit_spread_rate(times, positions, scale_px_per_mm=None, scale_rel_unc=None, seed=0, *,
                    width_s=5.0, rel_tol=0.35, min_window_points=6, block_s=2.0,
                    n_boot=1000, level=CI_LEVEL, min_points=10,
                    min_travel_mm=5.0, min_travel_px=20.0, disagree_tol=0.25):
    """Spread rate with an interval and flags.

    times (s) and positions (px, advance coordinate, see `leading_edge`). Returns a dict:
    rate, unit ("mm/s" or "px/s"), ci_low, ci_high, ci_method, window_start_s, window_end_s,
    n_points (points inside the window), travel (same length unit as the rate; fitted line over
    the window), ols_rate (least squares over the same window), rel_diff (|ols - ts| / |ts|),
    flags (list). Extra keys: seed, scale_px_per_mm, scale_rel_unc.
    A flagged result is never dropped. With fewer than 3 points the rate is None and the flag
    `insufficient_data` is set.
    """
    t = np.asarray(times, dtype=float)
    y = np.asarray(positions, dtype=float)
    keep = np.isfinite(t) & np.isfinite(y)
    t, y = t[keep], y[keep]
    order = np.argsort(t, kind="stable")
    t, y = t[order], y[order]
    scale = scale_px_per_mm
    unit = "mm/s" if scale else "px/s"
    flags = []
    if not scale:
        flags.append("no_scale")
    base = {"rate": None, "unit": unit, "ci_low": None, "ci_high": None, "ci_method": None,
            "window_start_s": None, "window_end_s": None, "n_points": int(t.size),
            "travel": None, "ols_rate": None, "rel_diff": None, "flags": flags,
            "seed": seed, "scale_px_per_mm": scale, "scale_rel_unc": scale_rel_unc}
    if t.size < 3 or t[-1] <= t[0]:
        flags.append("insufficient_data")
        return base

    w0, w1, info = steady_window(t, y, width_s, rel_tol, min_window_points)
    if not info["found"]:
        flags.append("no_steady_window")  # fell back to the whole series
    sel = (t >= w0) & (t <= w1)
    tw, yw = t[sel], y[sel]
    if tw.size < 3 or tw[-1] <= tw[0]:
        flags.append("insufficient_data")
        base.update(window_start_s=float(w0), window_end_s=float(w1), n_points=int(tw.size))
        return base

    slope_px, _ = theil_sen(tw, yw)
    ols_px, _ = ols(tw, yw)
    lo_px, hi_px = block_bootstrap_ci(tw, yw, block_s, n_boot, level, seed)
    div = scale if scale else 1.0
    rate, ols_rate = slope_px / div, ols_px / div
    lo, hi = lo_px / div, hi_px / div
    method = (f"moving-block bootstrap of Theil-Sen fit residuals (block {block_s:g} s, "
              f"{n_boot} resamples, {level * 100:g}% percentile interval)")
    if scale and scale_rel_unc:
        # half-widths of the statistical interval and of the scale uncertainty, in quadrature
        d_scale = abs(rate) * scale_rel_unc
        lo = rate - math.hypot(rate - lo, d_scale)
        hi = rate + math.hypot(hi - rate, d_scale)
        method += (f"; combined in quadrature with the pixel-scale relative uncertainty "
                   f"({scale_rel_unc:g}, read as a half-width at the same confidence level)")
    elif scale:
        method += "; no scale uncertainty given, so none is included"
    duration = float(tw[-1] - tw[0])
    travel = rate * duration
    rel_diff = _rel(ols_rate, rate)

    if duration < 20.0:  # the 20 s criterion in Linear DOB-40
        flags.append("steady_under_20s")
    if duration < 10.0:
        flags.append("short_window")
    if rate < 0:
        flags.append("negative_rate")
    if scale and not (RATE_RANGE_MM_S[0] <= abs(rate) <= RATE_RANGE_MM_S[1]):
        flags.append("rate_out_of_range")
    if abs(travel) < (min_travel_mm if scale else min_travel_px):
        flags.append("short_travel")
    if tw.size < min_points:
        flags.append("few_points")
    if rel_diff > disagree_tol:
        flags.append("estimates_disagree")

    base.update(rate=float(rate), ci_low=float(lo), ci_high=float(hi), ci_method=method,
                window_start_s=float(tw[0]), window_end_s=float(tw[-1]), n_points=int(tw.size),
                travel=float(travel), ols_rate=float(ols_rate), rel_diff=float(rel_diff))
    return base


def fit_segments(times, positions, step_times=None, scale_px_per_mm=None, scale_rel_unc=None,
                 seed=0, **kwargs):
    """One rate per flow segment (stepped flow).

    step_times: times (s) at which the flow velocity changes. With known step times the series is
    cut there and each segment is fitted on its own (segment i uses seed + i). Returns a list of
    fit_spread_rate dicts, each with `segment`, `segment_start_s`, `segment_end_s`. With
    step_times None or empty the whole test gets one rate and the flag `flow_steps_not_resolved`.
    Extra keyword arguments go to fit_spread_rate.
    """
    t = np.asarray(times, dtype=float)
    y = np.asarray(positions, dtype=float)
    if not step_times:
        res = fit_spread_rate(t, y, scale_px_per_mm, scale_rel_unc, seed, **kwargs)
        res["flags"].append("flow_steps_not_resolved")
        res.update(segment=0, segment_start_s=float(t.min()), segment_end_s=float(t.max()))
        return [res]
    edges = [-math.inf] + sorted(float(s) for s in step_times) + [math.inf]
    out = []
    for k in range(len(edges) - 1):
        m = (t >= edges[k]) & (t < edges[k + 1]) if k < len(edges) - 2 else (t >= edges[k])
        res = fit_spread_rate(t[m], y[m], scale_px_per_mm, scale_rel_unc, seed + k, **kwargs)
        res.update(segment=k,
                   segment_start_s=float(t[m].min()) if m.any() else None,
                   segment_end_s=float(t[m].max()) if m.any() else None)
        out.append(res)
    return out


# ---------------------------------------------------------------- CLI

def main(argv=None):
    p = argparse.ArgumentParser(description="Spread rate from a flame track CSV.")
    p.add_argument("track_csv")
    p.add_argument("--direction", type=int, choices=(1, -1), required=True)
    p.add_argument("--scale-px-per-mm", type=float, default=None)
    p.add_argument("--scale-rel-unc", type=float, default=None)
    p.add_argument("--step-times", type=float, nargs="*", default=None)
    p.add_argument("--seed", type=int, default=0)
    a = p.parse_args(argv)
    with open(a.track_csv, newline="") as f:
        rows = list(csv.DictReader(f))
    t, y = leading_edge(rows, a.direction)
    if a.step_times is not None:
        res = fit_segments(t, y, a.step_times, a.scale_px_per_mm, a.scale_rel_unc, a.seed)
    else:
        res = fit_spread_rate(t, y, a.scale_px_per_mm, a.scale_rel_unc, a.seed)
    json.dump(res, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
