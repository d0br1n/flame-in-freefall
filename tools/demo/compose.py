"""Compose the raw capture into the final video: the page inside a window that floats on a
gradient, a camera that zooms into each interaction, a large cursor, captions and a corner label.

usage: compose.py <capture dir> <out.mp4> [--preview] [--no-captions]
Environment: CRF (default 16) and PRESET (default slow) for the H.264 encode, FIGTREE_TTF for the font,
LABEL for the corner label.
Made with SI (Claude Code).
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SRC, DST = sys.argv[1], sys.argv[2]
PREVIEW = "--preview" in sys.argv
CAPTIONS_ON = "--no-captions" not in sys.argv
# Figtree (SIL OFL 1.1), the site's interface font. Not in git: download it once, see README.md.
FONT = os.environ.get("FIGTREE_TTF", os.path.join(os.path.dirname(os.path.abspath(__file__)), "Figtree.ttf"))

OW, OH, FPS = 1920, 1080, 60
WIN_X, WIN_Y, WIN_W, BAR, CON_H = 240, 50, 1440, 40, 900
RADIUS = 14
TITLE = "burnrate-psi-rosy.vercel.app"
# The corner label. The SI note stays in the file metadata (see the ffmpeg command below).
SI_LABEL = os.environ.get("LABEL", "Screen recording of the live site")

tl = json.load(open(os.path.join(SRC, "timeline.json")))
END = tl["end"]
PAGE_W = tl["page"][0]
S0 = WIN_W / PAGE_W


def font(size, weight=600):
    f = ImageFont.truetype(FONT, size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


def ease(u):
    u = max(0.0, min(1.0, u))
    return 4 * u * u * u if u < 0.5 else 1 - pow(-2 * u + 2, 3) / 2


# ---------- static scene, drawn once at 2x ----------
def build_scene():
    k = 2
    w, h = OW * k, OH * k
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    d = np.clip((xx / w) * 0.62 + (yy / h) * 0.38, 0, 1)[..., None]
    c0, c1, c2 = (np.array(c, np.float32) for c in ((176, 200, 255), (86, 120, 246), (30, 52, 205)))
    g = np.where(d < 0.5, c0 + (c1 - c0) * (d / 0.5), c1 + (c2 - c1) * ((d - 0.5) / 0.5))
    glow = np.exp(-(((xx - 0.08 * w) / (0.5 * w)) ** 2 + ((yy - 0.02 * h) / (0.6 * h)) ** 2))[..., None]
    g = np.clip(g + glow * 26, 0, 255).astype(np.uint8)
    img = Image.fromarray(g, "RGB")

    box = [WIN_X * k, WIN_Y * k, (WIN_X + WIN_W) * k, (WIN_Y + BAR + CON_H) * k]
    sh = Image.new("L", (w, h), 0)
    ImageDraw.Draw(sh).rounded_rectangle([box[0], box[1] + 26 * k, box[2], box[3] + 26 * k], RADIUS * k, fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(34 * k))
    img.paste(Image.new("RGB", (w, h), (12, 18, 70)), (0, 0), sh)

    d2 = ImageDraw.Draw(img)
    d2.rounded_rectangle(box, RADIUS * k, fill=(246, 248, 253))
    d2.line([box[0], (WIN_Y + BAR) * k - 1, box[2], (WIN_Y + BAR) * k - 1], fill=(224, 229, 241), width=k)
    cy = (WIN_Y + BAR / 2) * k
    for i, col in enumerate(((255, 95, 87), (254, 188, 46), (40, 200, 64))):
        cx = (WIN_X + 22 + i * 20) * k
        d2.ellipse([cx - 6.5 * k, cy - 6.5 * k, cx + 6.5 * k, cy + 6.5 * k], fill=col)
    f = font(15 * k, 500)
    tw = d2.textlength(TITLE, font=f)
    d2.text(((WIN_X + WIN_W / 2) * k - tw / 2, cy), TITLE, font=f, fill=(96, 104, 128), anchor="lm")

    m = Image.new("L", (w, h), 0)
    dm = ImageDraw.Draw(m)
    dm.rounded_rectangle(box, RADIUS * k, fill=255)
    dm.rectangle([0, 0, w, (WIN_Y + BAR) * k - 1], fill=0)
    bg2 = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    m2 = np.array(m)
    return ({1: cv2.resize(bg2, (OW, OH), interpolation=cv2.INTER_AREA), 2: bg2},
            {1: cv2.resize(m2, (OW, OH), interpolation=cv2.INTER_AREA), 2: m2})


def build_cursor(hpx=320):
    pts = [(0, 0), (0, 0.82), (0.19, 0.645), (0.325, 0.96), (0.45, 0.905), (0.315, 0.6), (0.565, 0.6)]
    pad = hpx * 0.14
    size = int(hpx + pad * 2)
    P = [(pad + x * hpx, pad + y * hpx) for x, y in pts]
    sh = Image.new("L", (size, size), 0)
    ImageDraw.Draw(sh).polygon([(x + hpx * 0.015, y + hpx * 0.05) for x, y in P], fill=120)
    sh = sh.filter(ImageFilter.GaussianBlur(hpx * 0.045))
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    img.paste(Image.new("RGBA", (size, size), (0, 0, 0, 255)), (0, 0), sh)
    d = ImageDraw.Draw(img)
    d.polygon(P, fill=(255, 255, 255, 255))
    d.line(P + [P[0]], fill=(255, 255, 255, 255), width=int(hpx * 0.085), joint="curve")
    d.polygon(P, fill=(12, 12, 14, 255))
    return np.array(img), pad / size, hpx / size  # rgba, tip offset as a share, arrow height as a share


def build_caption(text):
    f = font(33, 600)
    tmp = ImageDraw.Draw(Image.new("L", (10, 10)))
    tw = int(tmp.textlength(text, font=f))
    padx, hh = 26, 56
    img = Image.new("RGBA", (tw + padx * 2, hh), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, tw + padx * 2 - 1, hh - 1], 16, fill=(8, 12, 40, 224))
    d.text((padx, hh / 2 - 1), text, font=f, fill=(255, 255, 255, 255), anchor="lm")
    return np.array(img)


def build_label():
    f = font(15, 500)
    tmp = ImageDraw.Draw(Image.new("L", (10, 10)))
    tw = int(tmp.textlength(SI_LABEL, font=f))
    img = Image.new("RGBA", (tw + 20, 26), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, tw + 19, 25], 8, fill=(8, 12, 40, 150))
    d.text((10, 12), SI_LABEL, font=f, fill=(255, 255, 255, 235), anchor="lm")
    return np.array(img)


def blend(dst, rgba, x, y, alpha=1.0):
    """Alpha-blend an RGBA (RGB order) sprite onto a BGR frame at integer x, y."""
    h, w = rgba.shape[:2]
    x0, y0, x1, y1 = max(x, 0), max(y, 0), min(x + w, dst.shape[1]), min(y + h, dst.shape[0])
    if x1 <= x0 or y1 <= y0:
        return
    s = rgba[y0 - y:y1 - y, x0 - x:x1 - x]
    a = (s[..., 3:4].astype(np.float32) / 255.0) * alpha
    roi = dst[y0:y1, x0:x1].astype(np.float32)
    dst[y0:y1, x0:x1] = (roi + (s[..., 2::-1].astype(np.float32) - roi) * a).astype(np.uint8)


# ---------- camera ----------
def scene_xy(px, py):
    return WIN_X + px * S0, WIN_Y + BAR + py * S0


segs = []


def cam_at(t):
    z, cx, cy = 1.0, OW / 2, OH / 2
    for s in segs:
        if t < s["t"]:
            break
        e = ease((t - s["t"]) / s["dur"])
        z0, x0, y0 = s["from"]
        z1, x1, y1 = s["to"]
        z, cx, cy = z0 + (z1 - z0) * e, x0 + (x1 - x0) * e, y0 + (y1 - y0) * e
    return z, cx, cy


for kf in tl["cams"]:
    start = cam_at(kf["t"])
    if kf["x"] is None:
        to = (kf["z"], OW / 2, OH / 2)
    else:
        sx, sy = scene_xy(kf["x"], kf["y"])
        hx, hy = OW / 2 / kf["z"], OH / 2 / kf["z"]
        to = (kf["z"], min(max(sx, hx), OW - hx), min(max(sy, hy), OH - hy))
    segs.append({"t": kf["t"], "dur": kf["dur"], "from": start, "to": to})

cur = np.array(tl["cursor"], np.float64)


def cursor_at(t):
    return float(np.interp(t, cur[:, 0], cur[:, 1])), float(np.interp(t, cur[:, 0], cur[:, 2]))


def click_scale(t):
    s = 1.0
    for c in tl["clicks"]:
        u = (t - c + 0.05) / 0.28
        if 0 <= u <= 1:
            s = min(s, 1 - 0.2 * np.sin(np.pi * u))
    return s


# ---------- render ----------
bg, mask = build_scene()
cur_img, tip, arrow_share = build_cursor()
caps = [(a, b, build_caption(txt)) for a, b, txt in tl["captions"]] if CAPTIONS_ON else []
label = build_label()
frames = tl["frames"]
step = 6 if PREVIEW else 1
size = "960x540" if PREVIEW else f"{OW}x{OH}"
cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{OW}x{OH}",
       "-r", str(FPS // step), "-i", "-", "-an", "-c:v", "libx264", "-preset", os.environ.get("PRESET", "slow"),
       "-crf", "23" if PREVIEW else os.environ.get("CRF", "16"), "-pix_fmt", "yuv420p", "-s", size, "-movflags", "+faststart",
       "-metadata", "title=burnrate: 30 second demo (The Overfitters)",
       "-metadata", "comment=Screen recording of the live site https://burnrate-psi-rosy.vercel.app. "
                    "Recorded and edited with SI (Claude Code): scripted cursor, camera zoom, captions.",
       DST]
ff = subprocess.Popen(cmd, stdin=subprocess.PIPE)

fi, raw_full, raw_half = -1, None, None
total = int(round(END * FPS))
for n in range(0, total, step):
    t = n / FPS
    j = fi
    while j + 1 < len(frames) and frames[j + 1]["t"] <= t:
        j += 1
    j = max(j, 0)
    if j != fi:
        fi = j
        raw_full = cv2.imread(os.path.join(SRC, "frames", frames[fi]["f"]))
        raw_half = None
    z, cx, cy = cam_at(t)
    tx, ty = OW / 2 - cx * z, OH / 2 - cy * z
    k = 1 if z < 1.12 else 2
    M = np.float32([[z / k, 0, tx], [0, z / k, ty]])
    out = cv2.warpAffine(bg[k], M, (OW, OH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    m = cv2.warpAffine(mask[k], M, (OW, OH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
    s = z * WIN_W / raw_full.shape[1]
    if s < 0.62:
        if raw_half is None:
            raw_half = cv2.resize(raw_full, None, fx=0.5, fy=0.5, interpolation=cv2.INTER_AREA)
        src, sc = raw_half, s * 2
    else:
        src, sc = raw_full, s
    Mc = np.float32([[sc, 0, tx + WIN_X * z], [0, sc, ty + (WIN_Y + BAR) * z]])
    flag = cv2.INTER_LINEAR if abs(sc - 1) > 0.002 else cv2.INTER_NEAREST
    con = cv2.warpAffine(src, Mc, (OW, OH), flags=flag, borderMode=cv2.BORDER_REPLICATE)
    ys, xs = np.where(m.any(axis=1))[0], np.where(m.any(axis=0))[0]
    if len(ys) and len(xs):
        y0, y1, x0, x1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
        a = m[y0:y1, x0:x1, None].astype(np.float32) / 255.0
        roi = out[y0:y1, x0:x1].astype(np.float32)
        out[y0:y1, x0:x1] = (roi + (con[y0:y1, x0:x1].astype(np.float32) - roi) * a).astype(np.uint8)

    px, py = cursor_at(t)
    sx, sy = scene_xy(px, py)
    ox, oy = sx * z + tx, sy * z + ty
    arrow_h = 31 * z * click_scale(t)
    side = max(8, int(round(arrow_h / arrow_share)))
    spr = cv2.resize(cur_img, (side, side), interpolation=cv2.INTER_AREA)
    blend(out, spr, int(round(ox - tip * side)), int(round(oy - tip * side)))

    for a0, a1, im in caps:
        if a0 <= t <= a1:
            al = min(1.0, (t - a0) / 0.22, (a1 - t) / 0.22)
            rise = int(round((1 - ease(min(1.0, (t - a0) / 0.3))) * 10))
            blend(out, im, (OW - im.shape[1]) // 2, OH - 14 - im.shape[0] + rise, al)
    blend(out, label, OW - label.shape[1] - 14, 12)
    ff.stdin.write(out.tobytes())
ff.stdin.close()
ff.wait()
print("wrote", DST)
