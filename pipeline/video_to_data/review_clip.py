# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Brightened review clips of the T-series videos (dim blue flames).

The picture below row 90 is multiplied by 6 and clipped at white; the top 90 rows (NASA's
on-screen numbers) stay as recorded. A label under those rows says "brightened x6". The clip
is a way to look, not a measurement. Frames stream through ffmpeg (decode, optional
deinterlace, encode), so memory stays small.
"""
import os
import subprocess

import numpy as np

GAIN = 6
KEEP_ROWS = 90                 # NASA's on-screen numbers sit in these rows
MAX_BYTES = 6_000_000
OUT_FPS = 30
INTERLACED_LIMIT_S = 135.0     # T13: the stretch with the test, from the start
LABEL = "NASA PSI-25 {test}, brightened x{gain}"
# resolution scale and crf tried in this order before any speed-up; then speeds, smallest picture
SCALES = (1.0, 0.75, 0.5)
CRFS = (26, 30, 34)
SPEEDS = (1.5, 2.0, 3.0, 4.0, 6.0, 8.0)


def brighten(frame, gain=GAIN, keep_rows=KEEP_ROWS):
    """Copy of an (h, w, c) uint8 frame with the rows from `keep_rows` down multiplied by `gain`
    and clipped at 255; the rows above are unchanged."""
    out = frame.copy()
    out[keep_rows:] = np.clip(frame[keep_rows:].astype(np.int32) * gain, 0, 255).astype(np.uint8)
    return out


def label_text(test, speed=1.0, gain=GAIN):
    text = LABEL.format(test=test, gain=gain)
    return text + (f", x{speed:g} speed" if speed != 1 else "")


def attempts():
    """(scale, crf, speed) in the order to try: lower resolution and quality first, then speed."""
    out = [(s, c, 1.0) for s in SCALES for c in CRFS]
    out += [(SCALES[-1], CRFS[-1], sp) for sp in SPEEDS]
    return out


def clip_range(duration_s, interlaced):
    """(start_s, end_s) of the clip: the whole video, or the first 135 s of an interlaced one."""
    end = min(duration_s, INTERLACED_LIMIT_S) if interlaced else duration_s
    return 0.0, round(end, 3)


def draw_label(frame, text, top):
    """Burn `text` at the top left, just below row `top`, on a dark box."""
    import cv2
    scale = 0.5 if frame.shape[1] >= 600 else 0.4
    (w, h), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    y0 = top + 2
    cv2.rectangle(frame, (4, y0), (4 + w + 8, y0 + h + base + 6), (0, 0, 0), -1)
    cv2.putText(frame, text, (8, y0 + h + 3), cv2.FONT_HERSHEY_SIMPLEX, scale,
                (255, 255, 255), 1, cv2.LINE_AA)
    return frame


def _probe(video):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
         "stream=width,height,field_order:format=duration", "-of", "default=nw=1", str(video)],
        capture_output=True, text=True, check=True).stdout
    info = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    return int(info["width"]), int(info["height"]), info.get("field_order", ""), \
        float(info["duration"])


def _encode_once(video, path, test, width, height, start, end, deint, scale, crf, speed):
    import cv2
    vf = ("yadif," if deint else "") + f"setpts=(PTS-STARTPTS)/{speed},fps={OUT_FPS}"
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-ss", f"{start}", "-t", f"{end - start}", "-i", str(video),
         "-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"],
        stdout=subprocess.PIPE)
    ow, oh = int(width * scale) // 2 * 2, int(height * scale) // 2 * 2
    top = round(KEEP_ROWS * oh / height)
    text = label_text(test, speed)
    enc = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "bgr24",
         "-s", f"{ow}x{oh}", "-r", str(OUT_FPS), "-i", "-", "-c:v", "libx264",
         "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", str(crf), "-threads", "1",
         "-x264-params", "threads=1:lookahead-threads=1:sliced-threads=0",
         "-fflags", "+bitexact", "-flags:v", "+bitexact", "-map_metadata", "-1",
         "-movflags", "+faststart", str(path)], stdin=subprocess.PIPE)
    size, n = width * height * 3, 0
    while True:
        buf = dec.stdout.read(size)
        if len(buf) < size:
            break
        frame = brighten(np.frombuffer(buf, np.uint8).reshape(height, width, 3))
        if (ow, oh) != (width, height):
            frame = cv2.resize(frame, (ow, oh), interpolation=cv2.INTER_AREA)
        enc.stdin.write(draw_label(frame, text, top).tobytes())
        n += 1
    dec.stdout.close()
    dec.wait()
    enc.stdin.close()
    if enc.wait() != 0 or n == 0:
        raise RuntimeError(f"review clip failed for {test} (frames: {n})")
    return n


def make_review_clip(video, path, test, max_bytes=MAX_BYTES):
    """Write the brightened review clip of `video` to `path`; return the index.json `clip` dict.

    The whole video in real time when it fits under `max_bytes`; otherwise a smaller picture and
    lower quality, and only then a faster clip (the speed is written on the frame).
    """
    width, height, field_order, duration = _probe(video)
    interlaced = field_order not in ("", "progressive", "unknown")
    start, end = clip_range(duration, interlaced)
    for scale, crf, speed in attempts():
        _encode_once(video, path, test, width, height, start, end, interlaced, scale, crf, speed)
        if os.path.getsize(path) <= max_bytes:
            return {"file": os.path.basename(str(path)), "start_s": start, "end_s": end,
                    "speed": speed, "gain": GAIN}
    raise RuntimeError(f"review clip of {test} stays over {max_bytes} bytes")
