# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Pitch-deck video of BASS-II test B1 (PSI-25) with burnrate's tracked flame edge.

Input: data/modules/video-to-data/PSI-25_B1_overlay.mp4 (the site's own tracked clip, 10 fps,
one frame per 0.2 s of NASA video, starting at ignition 10.41 s). Every number drawn comes from
data/modules/video-to-data/evidence.json / results.csv for PSI-25/B1:
  ignition 10.41 s, fan voltage begins to fall 36.003 s, flame gone 37.604 s (+1.601 s),
  spread 9.649 px/s (95% 9.578 to 9.741), 22.2% O2, 100 micron PMMA film 2 cm wide.
NASA's report (NASA/TM-20210011385): flame extinguished within 2 s of the flow being cut off.

Needs opencv-python-headless, imageio-ffmpeg, numpy, pillow and the Geist Mono and Figtree
variable fonts (google/fonts repository).
Usage: python tools/deck/render_b1.py <overlay.mp4> <font_dir> <out_prefix>
Writes <out_prefix>-annotated.mp4 and <out_prefix>-clean.mp4 (1920x1080, 30 fps, H.264).
"""
import sys

import cv2
import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC, FONTS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, FPS = 1920, 1080, 30

IGN, FAN_DROP, GONE = 10.41, 36.003, 37.604
RATE = 9.649
FAST_END = 34.0  # source time where the slow-down starts
FAST = 3.0  # speed of the first part (x real time)
HOLD = 3.0  # seconds held on the dark frame at the end

# Source frames: frame i shows NASA time IGN + 0.2 i.
cap = cv2.VideoCapture(SRC)
frames = []
while True:
    ok, f = cap.read()
    if not ok:
        break
    f[452:480, 0:140] = 0  # the pipeline's small green debug label
    frames.append(f)
src_t = [IGN + 0.2 * i for i in range(len(frames))]
END_T = src_t[-1]


def frame_at(t):
    i = min(range(len(src_t)), key=lambda k: abs(src_t[k] - t))
    return frames[i]


# Output timeline: (output second) -> NASA time.
fast_len = (FAST_END - IGN) / FAST
slow_len = END_T - FAST_END + 0.2
total = fast_len + slow_len + HOLD


def nasa_time(s):
    if s < fast_len:
        return IGN + s * FAST, FAST
    if s < fast_len + slow_len:
        return FAST_END + (s - fast_len), 1.0
    return END_T, None


def font(name, size, weight):
    f = ImageFont.truetype(f"{FONTS}/{name}", size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


mono = font("GeistMono%5Bwght%5D.ttf", 30, 500)
mono_s = font("GeistMono%5Bwght%5D.ttf", 24, 400)
mono_b = font("GeistMono%5Bwght%5D.ttf", 34, 600)
big = font("Figtree%5Bwght%5D.ttf", 64, 700)
mid = font("Figtree%5Bwght%5D.ttf", 34, 500)

EMBER = (255, 122, 69)
ALARM = (255, 84, 84)
CYAN = (110, 220, 235)
DIM = (150, 156, 166)
WHITE = (240, 242, 245)

VID_H = 960
VID_W = 1440
VX, VY = (W - VID_W) // 2, 40


def compose(s, annotated):
    t, speed = nasa_time(s)
    base = np.zeros((H, W, 3), np.uint8)
    f = frame_at(t)
    if speed is None:  # final hold: the frame after the flame is gone, fading
        f = (frames[-1] * max(0.0, 1 - (s - fast_len - slow_len) / 1.0)).astype(np.uint8)
    vid = cv2.resize(f, (VID_W, VID_H), interpolation=cv2.INTER_CUBIC)
    if annotated:  # fade the bottom of the clip so the caption reads over the tracker lines
        ramp = np.clip((np.arange(VID_H) - (VID_H - 260)) / 120.0, 0, 1)[:, None, None]
        vid = (vid * (1 - ramp)).astype(np.uint8)
    base[VY:VY + VID_H, VX:VX + VID_W] = vid
    img = Image.fromarray(cv2.cvtColor(base, cv2.COLOR_BGR2RGB))
    d = ImageDraw.Draw(img)

    # Source credit, always (both versions).
    credit = "NASA PSI-25 BASS-II · test B1 · Space Station, 20 Feb 2014 · flame edge tracked by burnrate (SI-assisted code)"
    d.text((40, H - 46), credit, font=mono_s, fill=DIM)

    if not annotated:
        return img

    # Top-left: what it is.
    d.text((40, 36), "REAL FIRE IN ORBIT", font=mono_b, fill=EMBER)
    d.text((40, 80), "22.2% oxygen · acrylic film", font=mono_s, fill=DIM)

    # Top-right: clock and speed.
    clock = f"t = {min(t, GONE):5.1f} s"
    d.text((W - 40, 36), clock, font=mono_b, fill=WHITE, anchor="ra")
    if speed is not None:
        d.text((W - 40, 80), "x3 speed" if speed > 1 else "real time", font=mono_s, fill=DIM, anchor="ra")

    # Right column: live readouts.
    y = 200
    if t >= IGN + 1.0:
        d.text((W - 40, y), "SPREAD (AVG)", font=mono_s, fill=DIM, anchor="ra")
        d.text((W - 40, y + 30), f"{RATE:.1f} px/s", font=mono_b, fill=CYAN, anchor="ra")
    y += 110
    if t >= FAN_DROP:
        d.text((W - 40, y), "FAN", font=mono_s, fill=DIM, anchor="ra")
        d.text((W - 40, y + 30), "SLOWING", font=mono_b, fill=ALARM, anchor="ra")
    elif t >= IGN:
        d.text((W - 40, y), "FAN", font=mono_s, fill=DIM, anchor="ra")
        d.text((W - 40, y + 30), "ON", font=mono_b, fill=WHITE, anchor="ra")
    y += 110
    if t >= GONE:
        d.text((W - 40, y), "FLAME", font=mono_s, fill=DIM, anchor="ra")
        d.text((W - 40, y + 30), "GONE", font=mono_b, fill=EMBER, anchor="ra")

    # Lower-centre caption at the key moment.
    if t >= GONE or speed is None:
        d.text((W // 2, H - 190), "Flame gone 1.6 s after the fan slowed", font=big, fill=WHITE, anchor="ma")
        d.text((W // 2, H - 112), "NASA's report: within 2 s", font=mid, fill=DIM, anchor="ma")
    elif t >= FAN_DROP:
        d.text((W // 2, H - 190), "The fan slows…", font=big, fill=WHITE, anchor="ma")
    return img


for annotated, suffix in ((True, "annotated"), (False, "clean")):
    path = f"{OUT}-{suffix}.mp4"
    w = imageio_ffmpeg.write_frames(path, (W, H), fps=FPS, codec="libx264", pix_fmt_out="yuv420p",
                                    quality=None, bitrate=None, macro_block_size=1,
                                    output_params=["-crf", "22", "-preset", "slow", "-movflags", "+faststart"])
    w.send(None)
    n = int(total * FPS)
    for k in range(n):
        w.send(np.ascontiguousarray(np.asarray(compose(k / FPS, annotated))))
    w.close()
    print(path, f"{total:.1f} s", n, "frames")

# Poster frames for review and for the deck's <video poster>.
for s, name in ((fast_len * 0.5, "mid"), (fast_len + (FAN_DROP - FAST_END) + 0.5, "fan"), (fast_len + (GONE - FAST_END) + 0.1, "out")):
    compose(s, True).save(f"{OUT}-{name}.jpg", quality=88)
