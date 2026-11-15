# Code generated with SI assistance (Claude Code), reviewed by the team.
"""SI draft of the flame's leading edge, from the video pixels only (Linear DOB-43).

This is an automated pixel detector written for the hand-measurement check. It is NOT a hand
measurement and it does NOT use the pipeline's tracker (`track.py`) or any pipeline output, so the
two stay independent. Its points are provenance `SI_EXTRACTED`; a person reviewed the review videos
and accepted them without corrections, which does not make them an independent human measurement.

Rule: inside the band of rows where the flame lives, keep bright, red-hued pixels (the flame is
pink/orange/red; the lit chamber before ignition and the white igniter glow are gray or white),
close small gaps, take the largest blob, and call its rightmost column the leading edge (the flame
spreads to the right in B1, B3, B4, B11 and B13). In tests listed in `DIM_TESTS`, once the strict
rule has found the flame, a more sensitive rule keeps following the faint flame that remains after
the bright phase. Those points are marked `dim` in the `mode` column.

Output: `hand/<TEST>_SI.csv` with `time_s,position_px,mode`, one point per 30 frames (about 1 s)
wherever the edge was found. `position_px` is the image column of the edge, measured from the left
border, growing as the flame advances. Time is frame number / 29.97 frames per second.

Run:  python -m pipeline.video_to_data.si_draft B1 B3 B4 B11 B13     (needs data/raw/files/PSI-25)
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

import cv2
import numpy as np

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
VIDEO_DIR = REPO / "data/raw/files/PSI-25"
HAND_DIR = HERE / "hand"

FILES = {
    "B1": "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4",
    "B3": "PSI-25_Raw Data_BASS_GMT50_SAMPLE_148_TEST_B3.mp4",
    "B4": "PSI-25_Raw Data_BASS_GMT50_SAMPLE_159_TEST_B4.mp4",
    "B11": "PSI-25_Raw Data_BASS_GMT188_SAMPLE_158_TESTB11.mp4",
    "B13": "PSI-25_Raw Data_BASS_GMT188_SAMPLE_162_TESTB13.mp4",
}
DIM_TESTS = {"B3", "B11", "B13"}
FPS = 30000 / 1001
STEP = 30

ROI_Y = (200, 400)       # rows where the flame lives (checked on frames of all five videos)
X_MIN, X_MAX = 8, 712    # ignore the image border artefacts
MIN_AREA = 150           # pixels; smaller blobs are noise
DIM_MIN_AREA = 80
CLOSE = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
OPEN = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))


def _roi_hsv(frame_bgr):
    roi = frame_bgr[ROI_Y[0]:ROI_Y[1], X_MIN:X_MAX]
    return cv2.cvtColor(cv2.GaussianBlur(roi, (3, 3), 0), cv2.COLOR_BGR2HSV)


def strict_mask(frame_bgr):
    h, s, v = (_roi_hsv(frame_bgr)[..., i] for i in range(3))
    red = ((h <= 14) | (h >= 160)) & (s >= 90) & (v >= 90)
    return cv2.morphologyEx(red.astype(np.uint8) * 255, cv2.MORPH_CLOSE, CLOSE)


def dim_mask(frame_bgr):
    hsv = _roi_hsv(frame_bgr)
    colored = (hsv[..., 1] >= 60) & (hsv[..., 2] >= 22)   # any hue: the faint flame is pink below, blue above
    m = cv2.morphologyEx(colored.astype(np.uint8) * 255, cv2.MORPH_OPEN, OPEN)
    return cv2.morphologyEx(m, cv2.MORPH_CLOSE, CLOSE)


def _edge_from_mask(mask, min_area):
    n, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if n <= 1:
        return None
    k = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, _, w, _, area = stats[k]
    return None if area < min_area else int(X_MIN + x + w - 1)


def strict_edge(frame_bgr):
    return _edge_from_mask(strict_mask(frame_bgr), MIN_AREA)


def dim_edge(frame_bgr):
    return _edge_from_mask(dim_mask(frame_bgr), DIM_MIN_AREA)


def detect_all(path: Path, dim: bool = False) -> tuple[list, list]:
    """Edge per frame and the rule that found it. The dim rule is only used after the first strict find."""
    cap = cv2.VideoCapture(str(path))
    edges, modes, ignited = [], [], False
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        x = strict_edge(frame)
        mode = "strict" if x is not None else None
        if x is not None:
            ignited = True
        elif dim and ignited:
            x = dim_edge(frame)
            mode = "dim" if x is not None else None
        edges.append(x)
        modes.append(mode)
    return edges, modes


def saved_rows(edges: list, modes: list, step: int = STEP, fps: float = FPS) -> list[list]:
    """One row [time_s, position_px, mode] per `step` frames, wherever an edge was found."""
    return [[f"{i / fps:.3f}", f"{edges[i]:.1f}", modes[i]] for i in range(0, len(edges), step) if edges[i] is not None]


def write_draft(test: str, video_dir: Path = VIDEO_DIR, out_dir: Path = HAND_DIR) -> Path:
    edges, modes = detect_all(video_dir / FILES[test], dim=test in DIM_TESTS)
    out = out_dir / f"{test}_SI.csv"
    with open(out, "w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["time_s", "position_px", "mode"])
        writer.writerows(saved_rows(edges, modes))
    return out


def main(argv: list[str] | None = None) -> int:
    tests = (argv if argv is not None else sys.argv[1:]) or list(FILES)
    unknown = [t for t in tests if t not in FILES]
    if unknown:
        print(f"Unknown test(s) {unknown}; known: {list(FILES)}", file=sys.stderr)
        return 1
    for test in tests:
        print(f"wrote {write_draft(test).relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
