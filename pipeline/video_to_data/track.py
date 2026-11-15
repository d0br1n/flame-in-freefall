# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Flame tracker: where is the flame in every sampled frame of one video (Linear DOB-37).

Input: one video file (any h264/avi/mp4 that OpenCV can decode; built for the PLAIN PSI-25
BASS-II side-view videos: black background, red/pink flame, usually two parallel lobes).
Output, into the folder given with --out: the track table CSV (the interface to `events.py`
and `fit.py`), a kymograph PNG and three overlay stills (start, middle, end of the lit range).

Colour rule: the issue text proposed "blue minus half of (red + green)". The gate measurement
of 2026-11-14 (research/video-gate-2026-11-14/README.md, Linear DOB-33) showed that this rule
FAILS on the red flames of these videos (its region sat on a cool fringe, not on the flame), so
it was replaced by plain brightness: the maximum of the colour channels. That rule outlined the
flame in the gate run on the plain B1 video.

Method (all measurement is in pure functions on numpy arrays; only `iter_sampled` reads video)
1. Sampling: `fps` samples per second (default 5). Sample k reads source frame
   round(k * source_fps / fps); `time_s` = source frame index / source fps (real-time video).
2. Signal = brightness (max colour channel, 0..255). With --pre-ignition t0,t1 the per-pixel
   median of the sampled frames in that range is subtracted (the background), else nothing is.
3. Masks: rows above --mask-top (default 90) are dropped (the FUEL/AIR/FAN/RAD text overlay and
   clock sit in rows about 32 to 80); an optional igniter box is excluded; an optional region
   of interest restricts everything else. Boxes are x0,y0,x1,y1 (x1,y1 exclusive).
4. Hysteresis threshold on the signal: pixels at or above `low` that are connected (8-way) to a
   pixel at or above `high`; then a 3x3 morphological opening; then the flame is ALL connected
   regions of at least `min_area` px that lie within `max_dist` px of the largest region, so
   both lobes of the flame are kept and a far reflection is dropped.
5. Edges: the flame's extent along the spread axis (x by default, or y), from the 1st and 99th
   percentiles of the flame pixel coordinates (not single extreme pixels). Positions are in
   pixels of the source frame (pixel index along the axis); no scale reference is visible in
   the videos, so there is no conversion to mm here.

Defaults and how they were chosen:
- min_area 40 px (the gate's flame-size floor), max_dist 60 px (the two lobes of the gate B1
  flame are about 40 px apart edge to edge), opening 3x3, percentiles 1 and 99, mask_top 90.
- high 180, low 120 brightness units (0..255). First version (a priori, from the gate rule
  "max channel above 90"): high 90, low 50. Run on the six plain B-series videos of PSI-25 it
  found the flame but also the lit room: B3, B4 and B5 start with the room lights on (grey
  equipment panel, 99.9th percentile of brightness about 102 to 107 below row 90, 17 to 19 %
  of pixels at or above 50), giving 64 to 104 false samples before ignition. The defaults were
  therefore changed ONCE, for all videos together, to sit above that lit-room level: low 120
  (above the 99.9th percentile), high 180. Flame cores are saturated (255). Cost: a very dim
  flame is lost (B3 after about 28 s peaks at 69 to 83 and is invisible to any such rule).
- Noise-relative option (`noise_thresholds`, CLI --noise-relative, needs --pre-ignition):
  sigma = 1.4826 * MAD of the background-subtracted signal over the pre-ignition frames (floor
  2 units); high = 8 sigma, low = 4 sigma, the same multipliers as events.py uses on area.

Track table columns (exactly): frame, time_s, area_px, edge_min_px, edge_max_px, signal.
`area_px` is the number of flame pixels (0 when no flame), edges are empty when there is no
flame, `signal` is the mean of the (background-subtracted, if used) signal inside the flame
(0 when none). Output is deterministic: the same video and parameters give byte-identical files.

Limits: a very dim flame (below `low`) is not seen; an igniter that glows must be excluded with
--igniter-box; a flame that leaves the frame or merges with a far second structure is clipped;
the ignition glow lights the whole scene and is counted as flame while it lasts; a lit room
(no subtraction) is bright everywhere, so give --pre-ignition for videos that start lit.

Usage: python -m pipeline.video_to_data.track VIDEO --out DIR [--fps 5] [--mask-top 90]
       [--axis x] [--igniter-box x0,y0,x1,y1] [--roi x0,y0,x1,y1] [--pre-ignition t0,t1]
       [--name NAME]
"""
from __future__ import annotations

import argparse
import csv
import os
import sys
from dataclasses import dataclass, replace

import cv2
import numpy as np

COLUMNS = ["frame", "time_s", "area_px", "edge_min_px", "edge_max_px", "signal"]
_MAD_TO_SIGMA = 1.4826


@dataclass(frozen=True)
class Params:
    """Tracker settings. See the module docstring for how the defaults were chosen."""
    high: float = 180.0
    low: float = 120.0
    min_area: int = 40
    max_dist: float = 60.0
    opening: int = 3
    pct_lo: float = 1.0
    pct_hi: float = 99.0
    mask_top: int = 90
    axis: str = "x"
    igniter_box: tuple | None = None
    roi: tuple | None = None


# ---------------------------------------------------------------- pure measurement functions

def signal_from_rgb(frame_rgb):
    """Brightness signal: the maximum colour channel (int16, 0..255). Input is H x W x 3 RGB."""
    return frame_rgb.max(axis=2).astype(np.int16)


def make_valid_mask(shape, mask_top=90, igniter_box=None, roi=None):
    """Boolean H x W mask of the pixels the tracker may use."""
    h, w = shape
    valid = np.ones((h, w), dtype=bool)
    if roi is not None:
        x0, y0, x1, y1 = roi
        inside = np.zeros((h, w), dtype=bool)
        inside[max(y0, 0):max(y1, 0), max(x0, 0):max(x1, 0)] = True
        valid &= inside
    valid[:max(mask_top, 0), :] = False
    if igniter_box is not None:
        x0, y0, x1, y1 = igniter_box
        valid[max(y0, 0):max(y1, 0), max(x0, 0):max(x1, 0)] = False
    return valid


def background_median(signals):
    """Per-pixel median of a list of signal images (float32)."""
    if len(signals) == 0:
        raise ValueError("no frames to build a background from")
    return np.median(np.stack([np.asarray(s, dtype=np.float32) for s in signals]), axis=0)


def noise_thresholds(signals, background, valid, k_high=8.0, k_low=4.0, floor=2.0):
    """(high, low) from the pre-ignition noise: sigma = 1.4826 * MAD of (signal - background)."""
    diffs = np.concatenate([(np.asarray(s, dtype=np.float32) - background)[valid]
                            for s in signals])
    med = np.median(diffs)
    sigma = max(_MAD_TO_SIGMA * float(np.median(np.abs(diffs - med))), floor)
    return k_high * sigma, k_low * sigma


def hysteresis_mask(sig, valid, high, low):
    """Pixels >= low, 8-connected to at least one pixel >= high; both inside `valid`."""
    lo = valid & (sig >= low)
    n, labels = cv2.connectedComponents(lo.astype(np.uint8), connectivity=8)
    if n <= 1:
        return np.zeros(sig.shape, dtype=bool)
    keep = np.zeros(n, dtype=bool)
    keep[np.unique(labels[valid & (sig >= high)])] = True
    keep[0] = False
    return keep[labels]


def open_mask(mask, size=3):
    """Morphological opening with a size x size square (size 0 or 1: no opening)."""
    if size <= 1:
        return mask
    kernel = np.ones((size, size), dtype=np.uint8)
    return cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, kernel).astype(bool)


def select_flame(mask, min_area=40, max_dist=60.0):
    """Keep every region of >= min_area px within max_dist px of the largest one."""
    n, labels, stats, _ = cv2.connectedComponentsWithStats(mask.astype(np.uint8), connectivity=8)
    areas = stats[:, cv2.CC_STAT_AREA].copy()
    areas[0] = 0
    if n <= 1 or areas.max() < min_area:
        return np.zeros(mask.shape, dtype=bool)
    biggest = int(np.argmax(areas))
    dist = cv2.distanceTransform((labels != biggest).astype(np.uint8), cv2.DIST_L2,
                                 cv2.DIST_MASK_PRECISE)
    keep = np.zeros(n, dtype=bool)
    for lab in range(1, n):
        if areas[lab] >= min_area and (lab == biggest or dist[labels == lab].min() <= max_dist):
            keep[lab] = True
    return keep[labels]


def flame_mask(sig, valid, p):
    """The flame region of one signal image (steps 4 of the module docstring)."""
    sig = np.asarray(sig, dtype=np.float32)
    mask = hysteresis_mask(sig, valid, p.high, p.low)
    mask = open_mask(mask, p.opening)
    return select_flame(mask, p.min_area, p.max_dist)


def measure(mask, sig, p):
    """Area, edges along the spread axis (percentiles of pixel coordinates), mean signal."""
    area = int(mask.sum())
    if area == 0:
        return {"area_px": 0, "edge_min_px": None, "edge_max_px": None, "signal": 0.0}
    ys, xs = np.nonzero(mask)
    coord = xs if p.axis == "x" else ys
    lo, hi = np.percentile(coord, [p.pct_lo, p.pct_hi])
    return {"area_px": area, "edge_min_px": float(lo), "edge_max_px": float(hi),
            "signal": float(np.asarray(sig, dtype=np.float32)[mask].mean())}


def profile_along_axis(sig, valid, axis="x"):
    """Brightness profile along the spread axis: the maximum over the other axis (valid only)."""
    s = np.where(valid, np.asarray(sig, dtype=np.float32), 0.0)
    return s.max(axis=0) if axis == "x" else s.max(axis=1)


def track_signals(signals, p, background=None, valid=None):
    """Track a list of signal images. Returns (measurements, masks, profiles)."""
    if p.axis not in ("x", "y"):
        raise ValueError("axis must be 'x' or 'y'")
    if valid is None:
        valid = make_valid_mask(np.asarray(signals[0]).shape, p.mask_top, p.igniter_box, p.roi)
    out, masks, profiles = [], [], []
    for s in signals:
        s = np.asarray(s, dtype=np.float32)
        if background is not None:
            s = s - background
        m = flame_mask(s, valid, p)
        out.append(measure(m, s, p))
        masks.append(m)
        profiles.append(profile_along_axis(s, valid, p.axis))
    return out, masks, profiles


def sample_indices(src_fps, fps):
    """Generator of source frame indices for the sampling rate: round(k * src_fps / fps)."""
    k = 0
    while True:
        yield int(round(k * src_fps / fps))
        k += 1


# ---------------------------------------------------------------- the one video reading function

def iter_sampled(path, fps=5.0, signal_fn=signal_from_rgb, want=None):
    """Yield (source_frame_index, signal image, rgb frame or None) at `fps` samples per second.

    Decodes sequentially with OpenCV (deterministic). `want` (a set of source frame indices) makes
    it yield the RGB frame only for those indices, else None, to keep memory small.
    Use `video_info` for the source fps.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"cannot open video: {path}")
    src_fps = cap.get(cv2.CAP_PROP_FPS)
    if not src_fps or src_fps <= 0:
        cap.release()
        raise ValueError("video reports no frame rate")
    targets = sample_indices(src_fps, fps)
    nxt = next(targets)
    idx = 0
    try:
        while True:
            if not cap.grab():
                break
            while nxt < idx:
                nxt = next(targets)
            if idx == nxt:
                ok, bgr = cap.retrieve()
                if not ok:
                    break
                rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
                yield idx, signal_fn(rgb), (rgb if want is not None and idx in want else None)
                nxt = next(targets)
            idx += 1
    finally:
        cap.release()


def video_info(path):
    """(source fps, frame count, width, height) of a video."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise ValueError(f"cannot open video: {path}")
    info = (float(cap.get(cv2.CAP_PROP_FPS)), int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)))
    cap.release()
    return info


# ---------------------------------------------------------------- outputs

def _fmt(value, nd):
    return "" if value is None else f"{value:.{nd}f}"


def write_track_csv(path, frames, times, rows):
    """Write the track table (columns COLUMNS). Deterministic number formatting."""
    with open(path, "w", newline="", encoding="utf-8") as handle:
        w = csv.writer(handle, lineterminator="\n")
        w.writerow(COLUMNS)
        for f, t, r in zip(frames, times, rows):
            w.writerow([int(f), f"{t:.6f}", int(r["area_px"]), _fmt(r["edge_min_px"], 2),
                        _fmt(r["edge_max_px"], 2), f"{r['signal']:.2f}"])


def render_kymograph(profiles, times, rows, axis="x", min_height=400):
    """Kymograph image (BGR uint8): rows = time (down), columns = position along the axis."""
    img = np.clip(np.stack(profiles), 0, 255).astype(np.uint8)
    rep = max(1, int(np.ceil(min_height / len(profiles))))
    big = np.repeat(img, rep, axis=0)
    bgr = cv2.cvtColor(big, cv2.COLOR_GRAY2BGR)
    for i, r in enumerate(rows):
        for key, colour in (("edge_min_px", (255, 255, 0)), ("edge_max_px", (255, 0, 255))):
            if r[key] is not None:
                x = int(round(r[key]))
                if 0 <= x < bgr.shape[1]:
                    bgr[i * rep:(i + 1) * rep, max(x - 1, 0):x + 2] = colour
    pad = 18
    canvas = np.zeros((bgr.shape[0] + pad, bgr.shape[1], 3), dtype=np.uint8)
    canvas[pad:] = bgr
    label = f"time {times[0]:.1f}-{times[-1]:.1f} s down; position along {axis} (px) across"
    cv2.putText(canvas, label, (3, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1)
    return canvas


def render_overlay(rgb, mask, row, p, label):
    """RGB frame -> BGR image with the region outline (green) and the two edges drawn."""
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    contours, _ = cv2.findContours(mask.astype(np.uint8), cv2.RETR_EXTERNAL,
                                   cv2.CHAIN_APPROX_NONE)
    cv2.drawContours(bgr, contours, -1, (0, 255, 0), 1)
    h, w = mask.shape
    for key, colour in (("edge_min_px", (255, 255, 0)), ("edge_max_px", (255, 0, 255))):
        v = row[key]
        if v is None:
            continue
        v = int(round(v))
        if p.axis == "x":
            cv2.line(bgr, (v, 0), (v, h - 1), colour, 1)
        else:
            cv2.line(bgr, (0, v), (w - 1, v), colour, 1)
    cv2.putText(bgr, label, (4, h - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
    return bgr


def save_jpeg(path, bgr, max_bytes=150_000):
    """Write a JPEG under max_bytes by lowering the quality (and then the size) as needed."""
    img = bgr
    for _ in range(4):
        for q in (90, 80, 70, 60, 50, 40):
            ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, q])
            if ok and len(buf) < max_bytes:
                with open(path, "wb") as handle:
                    handle.write(buf.tobytes())
                return
        img = cv2.resize(img, (img.shape[1] * 3 // 4, img.shape[0] * 3 // 4),
                         interpolation=cv2.INTER_AREA)
    raise RuntimeError("could not make the overlay small enough")


def lit_range_indices(rows):
    """Row indices (start, middle, end) of the lit range, or None when never lit."""
    lit = [i for i, r in enumerate(rows) if r["area_px"] > 0]
    if not lit:
        return None
    return lit[0], lit[len(lit) // 2], lit[-1]


# ---------------------------------------------------------------- the whole job

def track_video(video, out_dir, fps=5.0, p=None, pre_ignition=None, noise_relative=False,
                name=None, signal_fn=signal_from_rgb):
    """Track one video and write the CSV, kymograph and overlays. Returns a summary dict."""
    p = p or Params()
    name = name or os.path.splitext(os.path.basename(str(video)))[0]
    os.makedirs(out_dir, exist_ok=True)
    src_fps, _, _, _ = video_info(video)

    background, thresholds = None, {"high": p.high, "low": p.low}
    if pre_ignition is not None:
        t0, t1 = pre_ignition
        pre = [s for idx, s, _ in iter_sampled(video, fps, signal_fn) if t0 <= idx / src_fps <= t1]
        if not pre:
            raise ValueError("no sampled frame inside the pre-ignition range")
        background = background_median(pre)
        if noise_relative:
            valid0 = make_valid_mask(background.shape, p.mask_top, p.igniter_box, p.roi)
            hi, lo = noise_thresholds(pre, background, valid0)
            p = replace(p, high=hi, low=lo)
            thresholds = {"high": hi, "low": lo}
    elif noise_relative:
        raise ValueError("--noise-relative needs --pre-ignition")

    frames, times, rows, profiles = [], [], [], []
    valid = None
    for idx, s, _ in iter_sampled(video, fps, signal_fn):
        if valid is None:
            valid = make_valid_mask(s.shape, p.mask_top, p.igniter_box, p.roi)
        r, _, prof = track_signals([s], p, background, valid)
        frames.append(idx)
        times.append(idx / src_fps)
        rows.append(r[0])
        profiles.append(prof[0])
    if not frames:
        raise ValueError("no frames decoded")

    csv_path = os.path.join(out_dir, f"{name}_track.csv")
    write_track_csv(csv_path, frames, times, rows)
    kymo_path = os.path.join(out_dir, f"{name}_kymograph.png")
    cv2.imwrite(kymo_path, render_kymograph(profiles, times, rows, p.axis))

    overlays = []
    pick = lit_range_indices(rows)
    if pick is not None:
        want = {frames[i] for i in pick}
        for idx, s, rgb in iter_sampled(video, fps, signal_fn, want=want):
            if rgb is None:
                continue
            i = frames.index(idx)
            sub = s.astype(np.float32) - (background if background is not None else 0)
            m = flame_mask(sub, valid, p)
            for which in [k for k, j in zip(("start", "middle", "end"), pick) if j == i]:
                path = os.path.join(out_dir, f"{name}_overlay_{which}.jpg")
                save_jpeg(path, render_overlay(rgb, m, rows[i], p, f"{name} t={times[i]:.2f}s"))
                overlays.append(path)
    lit = [r for r in rows if r["area_px"] > 0]
    return {"name": name, "csv": csv_path, "kymograph": kymo_path, "overlays": sorted(overlays),
            "n_samples": len(rows), "n_lit": len(lit), "src_fps": src_fps,
            "thresholds": thresholds, "params": p.__dict__ | {"fps": fps}}


# ---------------------------------------------------------------- CLI

def _box(text):
    parts = [int(float(v)) for v in text.split(",")]
    if len(parts) != 4:
        raise argparse.ArgumentTypeError("expected x0,y0,x1,y1")
    return tuple(parts)


def _range(text):
    parts = [float(v) for v in text.split(",")]
    if len(parts) != 2 or parts[1] < parts[0]:
        raise argparse.ArgumentTypeError("expected t0,t1 with t1 >= t0")
    return tuple(parts)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m pipeline.video_to_data.track",
                                 description="Track the flame in one video.")
    ap.add_argument("video")
    ap.add_argument("--out", required=True, help="output folder")
    ap.add_argument("--fps", type=float, default=5.0, help="samples per second (default 5)")
    ap.add_argument("--mask-top", type=int, default=Params.mask_top)
    ap.add_argument("--axis", choices=["x", "y"], default="x")
    ap.add_argument("--igniter-box", type=_box, default=None, metavar="x0,y0,x1,y1")
    ap.add_argument("--roi", type=_box, default=None, metavar="x0,y0,x1,y1")
    ap.add_argument("--pre-ignition", type=_range, default=None, metavar="t0,t1")
    ap.add_argument("--noise-relative", action="store_true",
                    help="thresholds from the pre-ignition noise (needs --pre-ignition)")
    ap.add_argument("--high", type=float, default=Params.high)
    ap.add_argument("--low", type=float, default=Params.low)
    ap.add_argument("--min-area", type=int, default=Params.min_area)
    ap.add_argument("--max-dist", type=float, default=Params.max_dist)
    ap.add_argument("--name", default=None)
    a = ap.parse_args(argv)
    p = Params(high=a.high, low=a.low, min_area=a.min_area, max_dist=a.max_dist,
               mask_top=a.mask_top, axis=a.axis, igniter_box=a.igniter_box, roi=a.roi)
    s = track_video(a.video, a.out, a.fps, p, a.pre_ignition, a.noise_relative, a.name)
    print(f"{s['name']}: {s['n_lit']} of {s['n_samples']} samples with a flame; csv {s['csv']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
