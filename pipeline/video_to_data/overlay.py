# Code generated with SI assistance (Claude Code), reviewed by the team.
"""On-screen data reader for the plain real-time BASS-II videos (PSI-25).

Each plain video has a text overlay burned in at the top of the frame: a label line
``FUEL  AIR  FAN  RAD``, the values under the labels (for example ``-2``, ``5``, ``62``,
``0.13``) and a clock line ``02/20/14 10:09:45``. This module reads those lines with
template matching (no OCR engine). The templates are in ``overlay_glyphs.json``.

What the numbers are (NASA's PSI-25 ReadMe and the BASS-II Summary Report, page 13). FAN is
the fan voltage times ten ("fan voltage x10", maximum 122 = 12.2 V); it is NOT an air speed and
this module never converts it. AIR is NASA's measured duct flow speed in cm/s; its sensor takes
about a minute to respond, so it lags behind any change. RAD is NASA's radiometer read-out,
uncalibrated and relative. The field labelled FUEL shows, by elimination, NASA's N2 flow rate in
cm3/min (the report lists N2 flow rate, fan voltage, air velocity and radiometer signal and does
not name the label). All are copied as shown.

What it reads and what it cannot. The 720 px frame cuts off the right end of the RAD
value (the 20th character cell sticks out of the frame), so only the first three
characters of the RAD value are always whole; the fourth is read from its visible part.
RAD readings are display numbers and are returned as read, nothing more.

Pure functions (no file access): ``read_cells``, ``parse_values``, ``parse_clock``,
``fan_changes``, ``fan_drop_time``, ``clock_rate``. ``main`` is the command line:
``python -m pipeline.video_to_data.overlay <video> --out <csv> [--fps 5]``.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path
from typing import NamedTuple, Optional, Sequence

import cv2
import numpy as np

# ---------------------------------------------------------------------------
# Character cell grid (frame pixels; frame is 720 x 480).
#
# Measured by hand on real frames of the 18 readable Bhattacharjee main-view videos
# (B1 to B13, B15 twice, B16, B19, B21, B22; the three unreadable files B14, B18, B20
# were not measured). Method: the median of 40 frames per video (so the clock digits
# blur away and the fixed label text stays), then
#   * row extents from the row brightness profile: label glyphs fill rows 31 to 45,
#     value glyphs 49 to 63, clock glyphs 67 to 81 (row pitch 18, glyph height 15);
#   * glyph width 25 px (columns 2 to 26 of a 28 px cell window), cell pitch about
#     28.4 to 28.7 px (the font is a fixed-size character generator, 20 columns);
#   * the x of column 0 and the pitch from the centroids of the F stem (column 0) and
#     the R stem (column 16) of the label line.
# Result: the row positions are identical in every video. The horizontal origin and the
# pitch are NOT the same in every video: the left edge of column 0 sits at x = 156.0
# (B1) to 161.8 (B13) and the pitch is 28.44 (B1) to 28.73 (B15, B16, B19), so the
# grid is slightly different per video (and constant inside one video, checked on 40
# frames each). The reader therefore fits (X, pitch, dy) on every frame from the fixed
# label text ``FUEL  AIR  FAN  RAD``; the constants below are the search ranges around
# the measured values.
# ---------------------------------------------------------------------------
FRAME_W, FRAME_H = 720, 480
GLYPH_W, GLYPH_H = 25, 15  # template size in px
ROW_Y = (31, 49, 67)  # top of glyph row: labels, values, clock
JITTER = 1  # per-cell search of +/- 1 px after the fit
X_RANGE = (150.0, 168.0)  # search range of the x of glyph column 0
X_STEP = 0.5
PITCH_RANGE = (28.3, 28.9)
PITCH_STEP = 0.05
DY_RANGE = (-1, 0, 1)
CROP = (150, 28, 720, 84)  # x0, y0, x1, y1 of the strip kept for fixtures

LABEL_TEXT = "FUEL  AIR  FAN  RAD"  # line 1, character columns 0 to 18
VALUES_COLS = 20
CLOCK_COLS = 17
CLOCK_BLANK_COL = 8  # clock line is 'dd/mm/yy hh:mm:ss': column 8 is the gap

# Reading thresholds (set on the real frames, see tests).
MIN_CONTRAST = 55.0  # grey levels between background and stroke, else the cell is blank
BLANK_INK = 14  # fewer ink pixels than this in the core columns: blank cell
CORE = (4, 21)  # glyph columns that count for the blank test (a neighbour's edge can leak in at the sides)
MIN_SCORE = 0.60  # Jaccard score of a character; lower: unreadable ('?')
MIN_MARGIN = 0.05  # best minus second best DIFFERENT character; lower: unreadable
EVIDENCE_MIN = 0.8  # close call: share of the winner's own pixels present minus share of the rival's own pixels present (0.6 gave wrong 8s in a check, 0.8 none)
MIN_LABEL_SCORE = 0.60  # fit quality of the label line; lower: no overlay in the frame

GLYPH_FILE = Path(__file__).with_name("overlay_glyphs.json")

CSV_COLUMNS = ["time_s", "frame", "fuel", "air", "fan", "rad", "clock", "score"]


# ---------------------------------------------------------------------------
# Glyph templates
# ---------------------------------------------------------------------------
_GLYPHS: Optional[tuple[list[str], np.ndarray]] = None


def load_glyphs() -> tuple[list[str], np.ndarray]:
    """Return (character per template, bool array (K, GLYPH_H, GLYPH_W)). Variants of one
    character are separate templates with the same character."""
    global _GLYPHS
    if _GLYPHS is None:
        data = json.loads(GLYPH_FILE.read_text())
        chars: list[str] = []
        maps: list[np.ndarray] = []
        for ch, variants in data["glyphs"].items():
            for rows in variants:
                maps.append(np.array([[c == "1" for c in r] for r in rows], dtype=bool))
                chars.append(ch)
        _GLYPHS = (chars, np.stack(maps))
    return _GLYPHS


# ---------------------------------------------------------------------------
# Cell extraction and matching
# ---------------------------------------------------------------------------
def _binarise(patch: np.ndarray, valid: np.ndarray) -> np.ndarray:
    """Ink mask of a cell: pixels above the midpoint between background and stroke
    level of that cell. Flat cells (no stroke) give an empty mask."""
    vals = patch[valid]
    if vals.size == 0:
        return np.zeros(patch.shape, dtype=bool)
    lo, hi = np.percentile(vals, 5), np.percentile(vals, 97)
    if hi - lo < MIN_CONTRAST:
        return np.zeros(patch.shape, dtype=bool)
    return (patch > lo + 0.5 * (hi - lo)) & valid


def cut_cell(gray: np.ndarray, x: float, y: int) -> tuple[np.ndarray, np.ndarray]:
    """Binarised patch (GLYPH_H + 2*JITTER, GLYPH_W + 2*JITTER) around the glyph box whose
    top-left is (round(x), y), and its validity mask (False outside the frame)."""
    xi = int(round(x)) - JITTER
    yi = y - JITTER
    h, w = GLYPH_H + 2 * JITTER, GLYPH_W + 2 * JITTER
    patch = np.zeros((h, w), dtype=np.float32)
    valid = np.zeros((h, w), dtype=bool)
    fh, fw = gray.shape
    xa, xb = max(xi, 0), min(xi + w, fw)
    ya, yb = max(yi, 0), min(yi + h, fh)
    if xb > xa and yb > ya:
        patch[ya - yi : yb - yi, xa - xi : xb - xi] = gray[ya:yb, xa:xb]
        valid[ya - yi : yb - yi, xa - xi : xb - xi] = True
    return _binarise(patch, valid), valid


def _match_cell(
    ink: np.ndarray, valid: np.ndarray, chars: list[str], tpl: np.ndarray
) -> tuple[str, float, float]:
    """Best character for one cell: (char, score, margin). Score is the Jaccard index of
    the ink masks over the visible pixels, best of the 3x3 pixel shifts. A cell with
    (almost) no ink is blank with score 1 minus its ink share."""
    n_ink = int(ink[:, 1 + CORE[0] : 1 + CORE[1]].sum())
    if n_ink < BLANK_INK:
        return " ", 1.0 - n_ink / (2.0 * BLANK_INK), 1.0
    n = 2 * JITTER + 1
    win = np.lib.stride_tricks.sliding_window_view(ink, (GLYPH_H, GLYPH_W)).reshape(n * n, -1)
    vwin = np.lib.stride_tricks.sliding_window_view(valid, (GLYPH_H, GLYPH_W)).reshape(n * n, -1)
    p = (win & vwin).astype(np.float32)  # (shifts, pixels)
    t = tpl.reshape(len(tpl), -1).astype(np.float32)  # (templates, pixels)
    inter = p @ t.T
    union = p.sum(axis=1, keepdims=True) + vwin.astype(np.float32) @ t.T - inter
    jac_all = inter / np.maximum(union, 1.0)  # (shifts, templates)
    jac = jac_all.max(axis=0)  # best shift per template
    shift_of = jac_all.argmax(axis=0)
    best: dict[str, int] = {}  # char -> index of its best template
    for k in np.nonzero(jac > 0.3)[0]:
        c = chars[k]
        if c not in best or jac[k] > jac[best[c]]:
            best[c] = int(k)
    if not best:
        return "?", 0.0, 0.0
    order = sorted(best.items(), key=lambda kv: -jac[kv[1]])
    top, k_top = order[0]
    score = float(jac[k_top])
    second = float(jac[order[1][1]]) if len(order) > 1 else 0.0
    gap = score - second
    if gap >= MIN_MARGIN:
        return top, score, gap
    # Close call (6/8/9, 3/8, ...): decide only on the pixels where the candidates differ.
    close = [(c, k) for c, k in order if score - jac[k] < MIN_MARGIN]
    ev = {}
    for c, k in close:
        pk = (win[shift_of[k]] & vwin[shift_of[k]])
        vals = []
        for c2, k2 in close:
            if c2 == c:
                continue
            only_a = tpl[k].reshape(-1) & ~tpl[k2].reshape(-1)
            only_b = tpl[k2].reshape(-1) & ~tpl[k].reshape(-1)
            fa = (pk & only_a).sum() / max(1, only_a.sum())
            fb = (pk & only_b).sum() / max(1, only_b.sum())
            vals.append(fa - fb)
        ev[c] = min(vals)
    winner = max(ev, key=ev.get)
    if ev[winner] >= EVIDENCE_MIN:
        return winner, float(jac[best[winner]]), MIN_MARGIN
    return top, score, gap


def _fit_grid(gray: np.ndarray) -> tuple[float, float, int, float]:
    """Fit (X, pitch, dy) of the character grid on the label line. Returns (dy, X, pitch, score): the score is the mean
    Jaccard score of the label letters at the fitted grid (0 when no overlay)."""
    chars, tpl = load_glyphs()
    letters = sorted({c for c in LABEL_TEXT if c != " "})
    cols = [(i, c) for i, c in enumerate(LABEL_TEXT) if c != " "]
    xs = np.arange(X_RANGE[0], X_RANGE[1] + 1e-9, X_STEP)
    ps = np.arange(PITCH_RANGE[0], PITCH_RANGE[1] + 1e-9, PITCH_STEP)
    best = (0.0, X_RANGE[0], 28.5, 0)
    for dy in DY_RANGE:
        y = ROW_Y[0] + dy
        strip = gray[y : y + GLYPH_H, :].astype(np.float32)
        if strip.shape[0] < GLYPH_H or strip.max() < MIN_CONTRAST:
            continue
        hi = float(np.percentile(strip, 99.0))
        sb = (strip > 0.5 * hi).astype(np.float32)
        if hi < MIN_CONTRAST:
            continue
        box = cv2.boxFilter(sb, -1, (GLYPH_W, GLYPH_H), normalize=False, anchor=(0, 0), borderType=cv2.BORDER_CONSTANT)
        resp: dict[str, np.ndarray] = {}
        for letter in letters:
            r = None
            for k in np.nonzero(np.array(chars) == letter)[0]:
                t = tpl[k].astype(np.float32)
                inter = cv2.matchTemplate(sb, t, cv2.TM_CCORR)[0]
                union = box[0, : inter.shape[0]] + t.sum() - inter
                j = inter / np.maximum(union, 1.0)
                r = j if r is None else np.maximum(r, j)
            resp[letter] = r
        for X in xs:
            for P in ps:
                tot = 0.0
                for col, letter in cols:
                    xi = int(round(X + col * P))
                    r = resp[letter]
                    if 0 <= xi < r.shape[0]:
                        tot += r[max(xi - 1, 0) : xi + 2].max()
                score = tot / len(cols)
                if score > best[0]:
                    best = (score, float(X), float(P), dy)
    return best[3], best[1], best[2], best[0]


class OverlayRead(NamedTuple):
    """Result of ``read_cells``. Unreadable characters are '?', blank cells ' '."""

    values: str  # 20 characters: FUEL, AIR, FAN, RAD values on the label columns
    clock: str  # 17 characters: dd/mm/yy hh:mm:ss as shown (date order is the display's)
    values_scores: list[float]
    clock_scores: list[float]
    label_score: float  # how well the label line fits (0: no overlay in this frame)


def _to_canvas(gray: np.ndarray, origin: tuple[int, int]) -> np.ndarray:
    if gray.ndim == 3:
        gray = cv2.cvtColor(gray, cv2.COLOR_BGR2GRAY)
    if gray.shape == (FRAME_H, FRAME_W) and origin == (0, 0):
        return gray
    canvas = np.zeros((FRAME_H, FRAME_W), dtype=gray.dtype)
    h = min(gray.shape[0], FRAME_H - origin[1])
    w = min(gray.shape[1], FRAME_W - origin[0])
    canvas[origin[1] : origin[1] + h, origin[0] : origin[0] + w] = gray[:h, :w]
    return canvas


def read_cells(gray_frame: np.ndarray, origin: tuple[int, int] = (0, 0)) -> OverlayRead:
    """Read the value line and the clock line of one frame.

    ``gray_frame`` is a full 720x480 gray (or BGR) frame, or a strip cut out of it whose
    top-left corner sits at ``origin`` (x, y) in frame pixels (the test fixtures use
    ``CROP[:2]``). The grid is fitted on the fixed label line first; when the label line
    is not found the frame has no overlay and every character is '?' with score 0."""
    gray = _to_canvas(gray_frame, origin)
    dy, X, P, label_score = _fit_grid(gray)
    if label_score < MIN_LABEL_SCORE:
        return OverlayRead("?" * VALUES_COLS, "?" * CLOCK_COLS, [0.0] * VALUES_COLS, [0.0] * CLOCK_COLS, label_score)
    chars, tpl = load_glyphs()
    out_lines: list[str] = []
    out_scores: list[list[float]] = []
    for row, ncols in ((1, VALUES_COLS), (2, CLOCK_COLS)):
        text, scores = [], []
        y = ROW_Y[row] + dy
        for col in range(ncols):
            if row == 2 and col == CLOCK_BLANK_COL:
                text.append(" ")  # the gap between date and time: always blank, not read
                scores.append(1.0)
                continue
            ink, valid = cut_cell(gray, X + col * P, y)
            c, s, margin = _match_cell(ink, valid, chars, tpl)
            if c not in " " and (s < MIN_SCORE or margin < MIN_MARGIN):
                c = "?"
            text.append(c)
            scores.append(round(s, 3))
        out_lines.append("".join(text))
        out_scores.append(scores)
    return OverlayRead(out_lines[0], out_lines[1], out_scores[0], out_scores[1], round(label_score, 3))


# ---------------------------------------------------------------------------
# Parsing
# ---------------------------------------------------------------------------
def _field_number(text: str, integer: bool) -> Optional[float]:
    t = text.strip()
    if not t or "?" in t:
        return None
    pat = r"-?\d+" if integer else r"-?\d+(\.\d+)?"
    if not re.fullmatch(pat, t):
        return None
    return int(t) if integer else float(t)


def parse_values(line: str) -> tuple[Optional[int], Optional[int], Optional[int], Optional[float]]:
    """Split the 20-character value line into (fuel, air, fan, rad). Fields on the label
    columns: FUEL 0 to 4, AIR 5 to 9, FAN 10 to 14, RAD 15 to 19. A field with any
    unreadable character or an odd shape is None, never a guess. FAN is the fan voltage
    times ten, not an air speed."""
    line = line.ljust(VALUES_COLS)
    return (
        _field_number(line[0:5], True),
        _field_number(line[5:10], True),
        _field_number(line[10:15], True),
        _field_number(line[15:20], False),
    )


def parse_clock(line: str) -> Optional[tuple[str, int]]:
    """Parse ``dd/mm/yy hh:mm:ss`` into (date text, seconds of day), or None. The date text
    is returned as displayed (the display date is one day off the real date, per the
    ReadMe, so it is not interpreted)."""
    m = re.fullmatch(r"(\d\d/\d\d/\d\d) (\d\d):(\d\d):(\d\d)", line.strip().ljust(17)[:17].rstrip())
    if not m:
        return None
    hh, mm, ss = int(m.group(2)), int(m.group(3)), int(m.group(4))
    if hh > 23 or mm > 59 or ss > 59:
        return None
    return m.group(1), hh * 3600 + mm * 60 + ss


# ---------------------------------------------------------------------------
# Series analysis
# ---------------------------------------------------------------------------
def _segments(times: Sequence[float], fans: Sequence[Optional[float]], min_hold_s: float, min_step: float):
    """Level segments of a FAN series: (start time, level, end time).

    A new raw segment starts when a reading is at least ``min_step`` away from the FIRST
    reading of the current segment (so 61/62 flicker stays one segment). Raw segments that
    last less than ``min_hold_s`` (one-sample glitches, the middle of a fast fall or rise) are
    dropped, then neighbours whose levels differ by less than ``min_step`` are merged. The
    level of a segment is its most frequent reading."""
    pts = [(float(t), float(f)) for t, f in zip(times, fans) if f is not None and t is not None]
    if not pts:
        return []
    pts.sort()
    dt = float(np.median(np.diff([p[0] for p in pts]))) if len(pts) > 1 else 0.2
    raw: list[list] = []
    for t, f in pts:
        if raw and abs(f - raw[-1][2][0]) < min_step:
            raw[-1][2].append(f)
            raw[-1][1] = t
        else:
            raw.append([t, t, [f]])
    segs = []
    for i, (t0, t1, vals) in enumerate(raw):
        end = raw[i + 1][0] if i + 1 < len(raw) else t1 + dt
        vs, counts = np.unique(vals, return_counts=True)
        level = float(vs[np.argmax(counts)])
        segs.append([t0, level, end])
    kept = [s for s in segs if s[2] - s[0] >= min_hold_s]
    merged: list[list] = []
    for s in kept:
        if merged and abs(s[1] - merged[-1][1]) < min_step:
            merged[-1][2] = s[2]
        else:
            merged.append(list(s))
    return merged


def fan_changes(
    times: Sequence[float],
    fans: Sequence[Optional[float]],
    min_hold_s: float = 1.0,
    min_step: float = 2,
) -> list[tuple[float, float, float]]:
    """Sustained changes of the FAN setting: [(time_s, from, to), ...].

    The time is that of the first reading of the new level. A change counts when the new
    level is at least ``min_step`` away from the old one and holds for ``min_hold_s``;
    the display flickers by one unit (61/62), and that is not a change. Unreadable
    samples (None) are skipped. A slow ramp (for example +1 every 2 s) is reported as a
    staircase: one change each time the reading is ``min_step`` units away from where the
    previous level began, i.e. one change per ``min_step`` units of ramp. A change that
    comes less than ``min_hold_s`` before the end of the series is not reported."""
    segs = _segments(times, fans, min_hold_s, min_step)
    out = []
    for a, b in zip(segs, segs[1:]):
        out.append((b[0], _num(a[1]), _num(b[1])))
    return out


def _num(x: float):
    return int(x) if float(x).is_integer() else x


def fan_fall_times(
    times: Sequence[float],
    fans: Sequence[Optional[float]],
    min_hold_s: float = 1.0,
    min_step: float = 2,
    chain_s: float = 10.0,
    flicker: float = 1,
) -> Optional[tuple[float, float, float, float]]:
    """The last sustained fall of the FAN reading: (fall_start_s, settled_s, level_before,
    level_after), or None when there is no fall.

    ``settled_s`` is the time the reading settled at its new low level (the first reading of
    the last downward level from ``fan_changes``; downward changes that follow each other
    within ``chain_s`` seconds are one chain and ``level_before`` is the level before the
    chain). ``fall_start_s`` is the time the reading began to fall: the time of the first
    reading below ``level_before - flicker`` after which no reading returns to
    ``level_before - flicker`` or above before ``settled_s``. A ramp is read this way because
    each intermediate value is held for less than ``min_hold_s``, so ``fan_changes`` only
    registers the end of the ramp. Unreadable samples (None) are skipped, never counted as a
    fall; flicker of ``flicker`` units before the fall does not move the start earlier; a brief
    dip that recovers is not the start."""
    ch = fan_changes(times, fans, min_hold_s, min_step)
    downs = [i for i, (_, a, b) in enumerate(ch) if b < a]
    if not downs:
        return None
    i = downs[-1]
    first = i
    while first - 1 >= 0 and ch[first - 1][2] < ch[first - 1][1] and ch[first][0] - ch[first - 1][0] <= chain_s:
        first -= 1
    settled = ch[i][0]
    before, after = ch[first][1], ch[i][2]
    threshold = before - flicker
    pts = sorted((float(t), float(f)) for t, f in zip(times, fans) if f is not None and t is not None)
    pts = [p for p in pts if p[0] <= settled]
    start = None
    for k in range(len(pts) - 1, -1, -1):
        if pts[k][1] >= threshold:
            start = pts[k + 1][0] if k + 1 < len(pts) else settled
            break
    if start is None:
        start = pts[0][0] if pts else settled
    return start, settled, _num(before), _num(after)


def fan_drop_time(
    times: Sequence[float],
    fans: Sequence[Optional[float]],
    min_hold_s: float = 1.0,
    min_step: float = 2,
    chain_s: float = 10.0,
    flicker: float = 1,
) -> Optional[float]:
    """Time the last sustained fall of the FAN reading BEGAN (``fall_start_s`` of
    ``fan_fall_times``), or None. It is not the time the reading settled at the new level;
    ``fan_fall_times`` returns that too."""
    fall = fan_fall_times(times, fans, min_hold_s, min_step, chain_s, flicker)
    return None if fall is None else fall[0]


def clock_rate(
    times: Sequence[float], clock_seconds: Sequence[Optional[float]]
) -> tuple[Optional[float], int]:
    """Seconds of clock per second of video time, and the number of readings used.

    Theil-Sen slope (median of pairwise slopes, over pairs at least half the span apart,
    capped at 10 s), so single misreads do not move it, and the 1 s resolution of the
    clock costs little. Missing readings (None) are ignored; a jump back of more than
    12 h is taken as midnight. Returns (None, n) with fewer than 2 readings or a span
    under 2 s."""
    pts = [(float(t), float(c)) for t, c in zip(times, clock_seconds) if t is not None and c is not None]
    n = len(pts)
    if n < 2:
        return None, n
    pts.sort()
    t = np.array([p[0] for p in pts])
    c = np.array([p[1] for p in pts])
    wrap = np.cumsum(np.concatenate([[0], np.diff(c) < -43200])) * 86400.0
    c = c + wrap
    span = t[-1] - t[0]
    if span < 2.0:
        return None, n
    min_sep = min(10.0, span / 2.0)
    dt = t[None, :] - t[:, None]
    dc = c[None, :] - c[:, None]
    iu = np.triu_indices(n, k=1)
    dt, dc = dt[iu], dc[iu]
    ok = dt >= min_sep
    if not ok.any():
        return None, n
    return float(np.median(dc[ok] / dt[ok])), n


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------
def read_video(path: str, fps: float = 5.0) -> list[dict]:
    """Read the overlay on frames sampled at ``fps`` per second. One dict per sample with
    the CSV columns (None where unreadable) plus the raw lines."""
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise SystemExit(f"cannot open video: {path}")
    vfps = cap.get(cv2.CAP_PROP_FPS) or 29.97
    step = vfps / fps
    rows: list[dict] = []
    idx, k = 0, 0
    while True:
        target = int(round(k * step))
        ok = True
        while idx < target and ok:
            ok = cap.grab()
            idx += 1
        if not ok:
            break
        ok, frame = cap.read()
        if not ok:
            break
        idx += 1
        g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        res = read_cells(g)
        fuel, air, fan, rad = parse_values(res.values)
        clk = parse_clock(res.clock)
        used = [s for c, s in zip(res.values + res.clock, res.values_scores + res.clock_scores) if c != " "]
        rows.append(
            {
                "time_s": round(target / vfps, 3),
                "frame": target,
                "fuel": fuel,
                "air": air,
                "fan": fan,
                "rad": rad,
                "clock": clk[1] if clk else None,
                "score": round(float(np.mean(used)), 3) if used else 0.0,
                "date": clk[0] if clk else None,
                "values_line": res.values,
                "clock_line": res.clock,
            }
        )
        k += 1
    cap.release()
    return rows


def write_csv(rows: list[dict], out: str) -> None:
    """Write the sample rows with exactly ``CSV_COLUMNS`` (empty cell = unreadable).
    ``clock`` is the displayed clock as seconds of day."""
    with open(out, "w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(CSV_COLUMNS)
        for r in rows:
            w.writerow(["" if r[c] is None else r[c] for c in CSV_COLUMNS])


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Read the on-screen FUEL/AIR/FAN/RAD values and clock from a plain BASS-II video.")
    ap.add_argument("video", help="path to a plain real-time video (.mp4)")
    ap.add_argument("--out", required=True, help="CSV to write")
    ap.add_argument("--fps", type=float, default=5.0, help="samples per second of video (default 5)")
    a = ap.parse_args(argv)
    rows = read_video(a.video, a.fps)
    write_csv(rows, a.out)
    times = [r["time_s"] for r in rows]
    fans = [r["fan"] for r in rows]
    n = len(rows)
    n_fan = sum(r["fan"] is not None for r in rows)
    n_clk = sum(r["clock"] is not None for r in rows)
    print(f"samples {n}, FAN read {n_fan}, clock read {n_clk}")
    for t, f0, f1 in fan_changes(times, fans):
        print(f"FAN change at {t:.2f} s: {f0} -> {f1}")
    drop = fan_drop_time(times, fans)
    print(f"fan drop began: {'none' if drop is None else f'{drop:.2f} s'}")
    rate, used = clock_rate(times, [r["clock"] for r in rows])
    print(f"clock rate: {'n/a' if rate is None else f'{rate:.4f}'} clock s per video s ({used} samples)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
