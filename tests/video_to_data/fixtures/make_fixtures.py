# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Deterministic synthetic track tables for test_events.py. Not NASA data.

Run `python3 tests/video_to_data/fixtures/make_fixtures.py` to rewrite the CSVs. The test
suite checks that the committed files equal what this script produces.
Phases are (start_s, end_s, kind): kind "dark" = area jitter 0..dark_max, "burn" = 600 +-30.
"""
import csv
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
COLUMNS = ["frame", "time_s", "area_px", "edge_min_px", "edge_max_px", "signal"]
FPS = 30


def regular(step, end):
    return [round(i * step, 3) for i in range(int(round(end / step)) + 1)]


def irregular(end):
    pattern, times, t, k = [0.2, 0.2, 0.5, 0.2, 0.5, 0.5], [0.0], 0.0, 0
    while t + pattern[k % 6] <= end + 1e-9:
        t = round(t + pattern[k % 6], 3)
        times.append(t)
        k += 1
    return times


def build(times, phases, dark_max=3, seed=1, edge_end=None):
    """Rows for `times`. edge_end: leading edge reached at the end of each burn phase."""
    rng = random.Random(seed)
    rows = []
    for t in times:
        area, emin, emax = rng.randint(0, dark_max), "", ""
        for start, end, kind in phases:
            if start <= t < end and kind == "burn":
                area = 600 + rng.randint(-30, 30)
                if edge_end is not None:
                    frac = (t - start) / (end - start)
                    emin, emax = 100.0, round(150.0 + frac * (edge_end - 150.0), 1)
        rows.append([round(t * FPS), t, area, emin, emax, float(area)])
    return rows


def all_fixtures():
    r2, end = regular(0.2, 30.0), 30.0
    burn = lambda a, b: [(a, b, "burn")]
    return {
        "clean_burn": build(r2, burn(8.0, 20.0), seed=1),
        "cut_while_burning": build(regular(0.2, 15.0), burn(8.0, 99.0), seed=2),
        "flicker": build(r2, [(8.0, 12.0, "burn"), (13.0, 20.0, "burn")], seed=3),
        "reignition": build(r2, [(8.0, 14.0, "burn"), (17.0, 22.0, "burn")], seed=4),
        "igniter_spike": build(r2, [(3.0, 3.6, "burn"), (8.0, 20.0, "burn")], seed=5),
        "regular_ref": build(r2, burn(8.0, 20.0), seed=6),
        "irregular": build(irregular(end), burn(8.0, 20.0), seed=7),
        "no_flame": build(r2, [], seed=8),
        "noisy_pre": build(r2, burn(8.0, 20.0), dark_max=10, seed=9),
        "burnout": build(r2, burn(8.0, 20.0), seed=10, edge_end=495.0),
        "edge_short": build(r2, burn(8.0, 20.0), seed=11, edge_end=250.0),
    }


def write_all(directory=HERE):
    for name, rows in all_fixtures().items():
        with open(Path(directory) / f"{name}.csv", "w", newline="") as handle:
            writer = csv.writer(handle, lineterminator="\n")
            writer.writerow(COLUMNS)
            writer.writerows(rows)


if __name__ == "__main__":
    write_all()
