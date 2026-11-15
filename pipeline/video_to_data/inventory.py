# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Video inventory for PSI-25 (BASS-II): what is one second of video in each file?

Three pieces, the first two pure (stdlib only, tested with committed fixtures):

* inventory_row(probe)     turns ffprobe JSON into one inventory row.
* classify_time_base(...)  tells a real-time video from a slideshow of held stills,
                           from the list of consecutive-frame differences.
* main()                   runs ffprobe and ffmpeg over the videos in downloads.csv and
                           writes videos.csv next to it.

Run (needs ffmpeg, ffprobe and data/raw on disk, none of which the CI gate has):
    uv run --python 3.12 --with-requirements pipeline/video_to_data/requirements.txt \
        python -m pipeline.video_to_data.inventory

Print the README count table from videos.csv and manifest.csv (no ffmpeg needed):
    python -m pipeline.video_to_data.inventory --counts

Add --new-only to keep the rows already in videos.csv and measure only the videos that are
new in downloads.csv (run fetch --register-only first). Without it every video is measured
again.

The difference between two frames is the mean absolute pixel difference of the two
frames after scaling to DIFF_SIZE and converting to 8-bit grey (0 = identical, 255 = black
versus white). Held stills show as a run of near-zero differences with one jump per still.
"""
import csv
import json
import re
import subprocess
import sys
import time
from fractions import Fraction
from pathlib import Path
from statistics import median

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DOWNLOADS = HERE / "downloads.csv"
VIDEOS = HERE / "videos.csv"

DIFF_SIZE = (180, 120)  # width, height used when decoding for differences

COLUMNS = [
    "file_name", "test", "is_still_sequence_name", "readable", "width", "height", "fps",
    "frame_count",
    "duration_s", "codec", "field_order", "time_base_kind", "frames_per_still",
    "distinct_images", "overlay_text", "scale_reference", "flame_video", "notes",
]

# What a person (or the SI) saw when looking at real frames of each file. Everything else in
# videos.csv is measured by code. Keyed by file name.
# Written on every row whose file nobody has looked at. Measured on the 48 readable B-series
# files on 2026-11-14: the automatic call agrees with the eye on the files in OBSERVATIONS, but
# it also calls several plain and second-view videos held_stills although nearly every frame
# changes (a periodic jump every 16 frames is enough to trigger it). Treat it as a screening
# flag for those files, not as a finding.
NOT_VIEWED = ("Automatic call from frame differences only; nobody has viewed this file. "
              "For plain and second-view files the call is unreliable: a periodic jump in "
              "compressed video can look like held stills.")

OBSERVATIONS = {
    "PSI-25_Raw Data_BASS_GMT188_SAMPLE_153_TESTB6_Still_Sequence.mp4": {
        "overlay_text": "yes", "scale_reference": "no", "flame_video": "yes",
        "notes": ("Screen recording of the Nikon D300S playback screen. Counter reads 35/80 at "
                  "the start and 80/80 at the end, camera clock 07/08/2014 08:43:03 to 08:43:49, "
                  "so about 1.02 s between stills. Flame is a small thumbnail, no ruler or "
                  "sample edge visible."),
    },
    "PSI-25_Raw Data_BASS_GMT190_SAMPLE_133_TEST_T23_Still_Sequence.mp4": {
        "overlay_text": "yes", "scale_reference": "no", "flame_video": "yes",
        "notes": ("Nikon playback screen. Only stills 201/203 to 203/203 move (camera clock "
                  "07/10/2014 14:56:12 to 14:56:14); the last still is held for most of the "
                  "file. Too short to track a flame."),
    },
    "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1.mp4": {
        "overlay_text": "yes", "scale_reference": "no", "flame_video": "yes",
        "notes": ("Real-time side-view video camera with a data overlay in the top rows: FUEL, "
                  "AIR, FAN, RAD and a clock (example 02/20/14 10:09:50, FAN 62, RAD 0.87). "
                  "The clock advances about 1 s per 30 frames. Display date is one day later "
                  "than the real date (ReadMe). Flame is two bright lobes on a dark "
                  "background, no ruler or sample edge visible."),
    },
    "PSI-25_Raw Data_BASS_GMT50_SAMPLE_147_TEST_B1_Still_Sequence.mp4": {
        "overlay_text": "yes", "scale_reference": "no", "flame_video": "yes",
        "notes": ("Same test as the plain B1 video but a different camera: the Nikon D300S "
                  "top view, shown as a screen recording of its playback screen. Starts with "
                  "about 134 black frames, then stills 10/57 to 57/57 (camera clock 02/19/2014 "
                  "10:03:42 to 10:04:33, about 1.09 s between stills). Last still held longer."),
    },
    "PSI-25_Raw Data_BASS_GMT50_SAMPLE_156_TEST_B5_Still_Sequence.mp4": {
        "overlay_text": "yes", "scale_reference": "no", "flame_video": "yes",
        "notes": ("Nikon playback screen. Counter 160/206 to 206/206, camera clock 02/19/2014 "
                  "12:08:28 to 12:09:15, about 1.02 s between stills. Flame is a small "
                  "thumbnail."),
    },
    "PSI-25_Raw Data_BASS_GMT50_SAMPLE_159_TEST_B4_Still_Sequence.mp4": {
        "overlay_text": "yes", "scale_reference": "no", "flame_video": "yes",
        "notes": ("Nikon playback screen. Counter 76/137 to 137/137, camera clock 02/19/2014 "
                  "11:50:15 to 11:51:18, about 1.03 s between stills. Flame is a small "
                  "thumbnail. The counter spans 62 stills, the difference count is one more."),
    },
    "PSI-25_Raw Data_T13-post-burn-picture-camera-monitor.mp4": {
        "overlay_text": "yes", "scale_reference": "no", "flame_video": "no",
        "notes": ("Not a flame video: a camera filming a monitor that shows a Nikon playback "
                  "screen of a post-burn picture (57/57, date 04/11/2014). Time base not "
                  "assessed."),
    },
}


def parse_test(file_name):
    """Test id from a PSI-25 file name: 'TESTB6' -> B6, 'TEST_B1' -> B1, 'TEST_T23' -> T23.

    Also reads 'Data_T13-post-burn...'. Returns '' when no test id is found.
    """
    m = re.search(r"TEST_?([A-Z]\d{1,2})(?![0-9])", file_name)
    if m is None:
        m = re.search(r"_([A-Z]\d{1,2})-", file_name)
    return m.group(1) if m else ""


def _fraction(text):
    try:
        value = Fraction(text)
    except (TypeError, ValueError, ZeroDivisionError):
        return None
    return value if value > 0 else None


def inventory_row(probe, file_name=""):
    """One inventory row (a dict) from ffprobe JSON (-print_format json -show_streams -show_format).

    Takes the first video stream. A value ffprobe does not give stays '' (unknown).
    """
    streams = [s for s in probe.get("streams", []) if s.get("codec_type") == "video"]
    if not streams:
        raise ValueError("no video stream in ffprobe output")
    s = streams[0]
    fmt = probe.get("format", {})
    fps = _fraction(s.get("avg_frame_rate")) or _fraction(s.get("r_frame_rate"))
    duration = s.get("duration", fmt.get("duration"))
    try:
        duration_s = round(float(duration), 3)
    except (TypeError, ValueError):
        duration_s = ""
    nb = s.get("nb_frames")
    frame_count = int(nb) if isinstance(nb, str) and nb.isdigit() else ""
    name = file_name or Path(fmt.get("filename", "")).name
    return {
        "file_name": name,
        "test": parse_test(name),
        "is_still_sequence_name": "yes" if "still_sequence" in name.lower() else "no",
        "width": s.get("width", ""),
        "height": s.get("height", ""),
        "fps": round(float(fps), 3) if fps else "",
        "frame_count": frame_count,
        "duration_s": duration_s,
        "codec": s.get("codec_name", ""),
        "field_order": s.get("field_order", ""),
    }


def _jump_indices(diffs, min_jump, jump_ratio, window, merge_within):
    """Indices where a difference stands out from its neighbours; touching ones merge."""
    found = []
    for i, d in enumerate(diffs):
        if d <= min_jump:
            continue
        around = diffs[max(0, i - window): i + window + 1]
        if d > jump_ratio * (median(around) + 0.01):
            found.append(i)
    merged = []
    for i in found:
        if merged and i - merged[-1] <= merge_within:
            if diffs[i] > diffs[merged[-1]]:
                merged[-1] = i
        else:
            merged.append(i)
    return merged


def classify_time_base(diffs, min_jump=0.15, jump_ratio=4.0, window=15, merge_within=3,
                       min_jumps=2, regularity=0.7):
    """Real-time video or a slideshow of held stills, from consecutive-frame differences.

    diffs[i] is the difference between frame i and frame i+1. A jump is a difference above
    min_jump that is also above jump_ratio times the median of its neighbours (a duplicated
    frame is a difference of zero, so it is never a jump). The sequence is held_stills when
    there are at least min_jumps jumps and at least `regularity` of the gaps between jumps are
    a whole number of the typical gap (give or take one frame). Otherwise real_time.

    Returns a dict: kind ('real_time' or 'held_stills'), frames_per_still (mean gap, 1 for
    real_time), distinct_images, gap_min, gap_max, constant (every gap equal, held_stills only).
    A gap that is a whole number k (2 or more) of typical gaps, give or take one frame, means
    k-1 changes too small to see: they are counted. A longer gap that fits no whole number is a
    still held for longer (the last still of a sequence often is): counted once. Two jumps
    closer than 0.6 of the typical gap are one change, counted once. With only a few jumps the
    call rests on little evidence: check the on-screen counter too.
    """
    diffs = [float(d) for d in diffs]
    real_time = {"kind": "real_time", "frames_per_still": 1,
                 "distinct_images": sum(1 for d in diffs if d > 0) + 1 if diffs else 0,
                 "gap_min": None, "gap_max": None, "constant": None}
    jumps = _jump_indices(diffs, min_jump, jump_ratio, window, merge_within)
    if len(jumps) < min_jumps:
        return real_time
    gaps = [b - a for a, b in zip(jumps, jumps[1:])]
    typical = median(gaps)
    if typical < 3:
        return real_time
    on_grid = 0
    for g in gaps:
        k = max(1, round(g / typical))
        if abs(g - k * typical) <= 1:
            on_grid += 1
    if on_grid / len(gaps) < regularity:
        return real_time

    kept = [jumps[0]]
    for j in jumps[1:]:
        if j - kept[-1] < 0.6 * typical:
            if diffs[j] > diffs[kept[-1]]:
                kept[-1] = j
        else:
            kept.append(j)
    kept_gaps = [b - a for a, b in zip(kept, kept[1:])]
    images = len(kept) + 1
    for g in kept_gaps:
        k = round(g / typical)
        if k >= 2 and abs(g - k * typical) <= 1:
            images += k - 1
    clean = [g for g in kept_gaps if abs(g - typical) <= 1]
    return {
        "kind": "held_stills",
        "frames_per_still": round(sum(clean) / len(clean), 2),
        "distinct_images": images,
        "gap_min": min(clean),
        "gap_max": max(clean),
        "constant": len(set(clean)) == 1,
    }


def read_downloads(path=DOWNLOADS):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def unreadable_row(file_name, reason):
    """Row for a file that ffprobe cannot open: named, flagged, nothing measured."""
    return {
        "file_name": file_name,
        "test": parse_test(file_name),
        "is_still_sequence_name": "yes" if "Still_Sequence" in file_name else "no",
        "readable": "no",
        "notes": "Not readable as downloaded from PSI: %s" % (reason.strip() or "ffprobe failed"),
    }


def _ffprobe(path):
    """ffprobe's JSON for one file, or (None, reason) when the file cannot be opened."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_streams", "-show_format",
         str(path)], capture_output=True)
    if out.returncode != 0:
        lines = out.stderr.decode("utf-8", "replace").strip().splitlines()
        # Keep ffmpeg's own message, without the memory address it prints in brackets.
        reason = lines[0].split("] ", 1)[-1] if lines else ""
        return None, reason
    return json.loads(out.stdout), ""


def frame_diffs(path):
    """Mean absolute grey difference between consecutive frames, at DIFF_SIZE (needs numpy)."""
    import numpy as np

    w, h = DIFF_SIZE
    size = w * h
    diffs = []
    prev = None
    # Streamed frame by frame: a 665 s video held as float32 needs several GB.
    with subprocess.Popen(
            ["ffmpeg", "-v", "error", "-i", str(path), "-vf", f"scale={w}:{h},format=gray",
             "-f", "rawvideo", "-"], stdout=subprocess.PIPE) as proc:
        while True:
            buf = proc.stdout.read(size)
            if len(buf) < size:
                break
            cur = np.frombuffer(buf, np.uint8).astype(np.float32)
            if prev is not None:
                diffs.append(float(np.abs(cur - prev).mean()))
            prev = cur
    if proc.returncode:
        raise subprocess.CalledProcessError(proc.returncode, "ffmpeg")
    return diffs


def read_videos(path=VIDEOS):
    """Rows of an existing videos.csv by file name ({} when the file is missing)."""
    if not Path(path).exists():
        return {}
    with open(path, newline="", encoding="utf-8") as fh:
        return {r["file_name"]: r for r in csv.DictReader(fh)}


def build_rows(root=ROOT, downloads=DOWNLOADS, keep=None, log=None):
    """One row per video in downloads.csv, in that order.

    keep: rows already measured, by file name. They are copied as they are, nothing is
    measured again for them. log: called with a line of text after each file.
    """
    keep = keep or {}
    rows = []
    items = [i for i in read_downloads(downloads) if i["kind"] == "video"]
    for n, item in enumerate(items, 1):
        if item["file_name"] in keep:
            rows.append({c: keep[item["file_name"]].get(c, "") for c in COLUMNS})
            continue
        path = root / item["local_path"]
        probe, reason = _ffprobe(path)
        if probe is None:
            rows.append(unreadable_row(item["file_name"], reason))
            if log:
                log("%d/%d not readable %s" % (n, len(items), item["file_name"]))
            continue
        row = inventory_row(probe, item["file_name"])
        row["readable"] = "yes"
        tb = classify_time_base(frame_diffs(path))
        row["time_base_kind"] = tb["kind"]
        row["frames_per_still"] = tb["frames_per_still"]
        row["distinct_images"] = tb["distinct_images"]
        seen = OBSERVATIONS.get(item["file_name"], {})
        for key in ("overlay_text", "scale_reference", "flame_video", "notes"):
            row[key] = seen.get(key, "")
        if not seen:
            row["notes"] = NOT_VIEWED
        rows.append(row)
        if log:
            log("%d/%d %s %s" % (n, len(items), row["time_base_kind"], item["file_name"]))
    return rows


def write_videos_csv(rows, path=VIDEOS):
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=COLUMNS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def count_table(video_rows, manifest_rows):
    """Markdown table of videos by investigator and kind of view.

    Each video is counted once, first match wins: not readable, still sequence (by file
    name), second view (manifest), else main view. Investigator comes from manifest.csv.
    """
    by_name = {m["file_name"]: m for m in manifest_rows}
    kinds = ("main", "second view", "still sequence", "not readable")
    counts = {}
    for r in video_rows:
        who = by_name[r["file_name"]]["investigator"].strip()
        if r["readable"] != "yes":
            kind = "not readable"
        elif r["is_still_sequence_name"] == "yes":
            kind = "still sequence"
        elif by_name[r["file_name"]]["view"] == "second":
            kind = "second view"
        else:
            kind = "main"
        counts.setdefault(who, dict.fromkeys(kinds, 0))[kind] += 1
    lines = ["| Investigator | " + " | ".join(kinds) + " | total |",
             "|---|" + "---|" * (len(kinds) + 1)]
    totals = dict.fromkeys(kinds, 0)
    for who in sorted(counts):
        lines.append("| %s | %s | %d |" % (who, " | ".join(str(counts[who][k]) for k in kinds),
                                           sum(counts[who].values())))
        for k in kinds:
            totals[k] += counts[who][k]
    lines.append("| all | %s | %d |" % (" | ".join(str(totals[k]) for k in kinds),
                                       sum(totals.values())))
    return "\n".join(lines)


def main(argv=None):
    args = argv if argv is not None else sys.argv[1:]
    if "--counts" in args:
        with open(HERE / "manifest.csv", newline="", encoding="utf-8") as fh:
            print(count_table(list(read_videos().values()), list(csv.DictReader(fh))))
        return
    new_only = "--new-only" in args
    keep = read_videos() if new_only else None
    rows = build_rows(keep=keep, log=lambda t: print(time.strftime("%H:%M:%S"), t, flush=True))
    write_videos_csv(rows)
    print(f"wrote {VIDEOS} ({len(rows)} rows)")


if __name__ == "__main__":
    main()
