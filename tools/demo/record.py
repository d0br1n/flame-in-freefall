"""Drive the live burnrate site with a scripted cursor and save a raw capture.

Writes into the output directory: frames/*.jpg (the page at 2x), and timeline.json with the
frame times, the cursor path, the clicks, the camera keyframes and the captions. compose.py
turns that into the final video. Made with SI (Claude Code).

The route (15 Nov, chosen by Iustin): Overview (wide, no zoom), Scenarios, the Artemis II
scenario of April 2026 scrolled down to its 15 flames, Video to Data test B1 (the NASA clip with
the tracked flame edge beside its chart, one still framing), then the Suppression test bench,
where carbon dioxide is added and the oxygen is lowered until no real FLEX test is near and the
page shows no prediction.
"""
import asyncio
import base64
import json
import math
import os
import sys
import time

from playwright.async_api import async_playwright

BASE = "https://burnrate-psi-rosy.vercel.app"
OUT = sys.argv[1]
W, H, DPR = 1440, 900, 2
END = 29.45

# Every line restates what the page on screen says at that moment (checked on the live site).
CAPTIONS = [
    (0.15, 4.3, "The Overfitters present burnrate: NASA flame tests, traced to source."),
    (4.7, 10.8, "What burnrate would have shown: cut the fans. 7 of 8 burning flames went out within 2 s."),
    (11.9, 18.3, "Our tracker follows the flame in NASA's own BASS-II videos and charts where it was."),
    (19.5, 24.6, "Add carbon dioxide: less of the droplet is predicted to burn."),
    (24.9, 27.9, "No real NASA test near your mixture? No prediction."),
    (28.1, 29.4, "Built on NASA open data."),
]


def ease(u):
    u = max(0.0, min(1.0, u))
    return 4 * u * u * u if u < 0.5 else 1 - pow(-2 * u + 2, 3) / 2


class Rec:
    def __init__(self, page, cdp):
        self.page, self.cdp = page, cdp
        self.t0 = None
        self.frames, self.cursor, self.clicks, self.cams, self.notes = [], [], [], [], []
        self.mx, self.my = 820.0, 600.0
        self.n = 0
        self.on = False

    def now(self):
        return time.time() - self.t0

    async def on_frame(self, ev):
        try:
            await self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})
        except Exception:
            pass
        if not self.on:
            return
        t = ev["metadata"]["timestamp"] - self.t0
        name = f"{self.n:05d}.jpg"
        self.n += 1
        with open(os.path.join(OUT, "frames", name), "wb") as f:
            f.write(base64.b64decode(ev["data"]))
        self.frames.append({"t": t, "f": name})

    async def at(self, t):
        d = t - self.now()
        if d > 0:
            await asyncio.sleep(d)
        elif d < -0.25:
            self.notes.append(f"late by {-d:.2f}s at step {t}")

    async def move(self, x, y, dur, straight=False):
        x0, y0 = self.mx, self.my
        dist = math.hypot(x - x0, y - y0)
        nx, ny = (-(y - y0) / dist, (x - x0) / dist) if dist > 1 else (0, 0)
        bend = 0.0 if straight else min(40.0, dist * 0.07)
        start = self.now()
        while True:
            u = (self.now() - start) / dur
            e = ease(u)
            arc = math.sin(math.pi * e) * bend
            px, py = x0 + (x - x0) * e + nx * arc, y0 + (y - y0) * e + ny * arc
            await self.page.mouse.move(px, py)
            self.cursor.append([round(self.now(), 4), round(px, 2), round(py, 2)])
            if u >= 1:
                break
            await asyncio.sleep(1 / 70)
        self.mx, self.my = x, y

    async def click(self):
        self.clicks.append(round(self.now(), 4))
        await self.page.mouse.down()
        await asyncio.sleep(0.07)
        await self.page.mouse.up()

    async def drag(self, x, dur):
        """Press, slide along the row to x, release: for the range sliders."""
        self.clicks.append(round(self.now(), 4))
        await self.page.mouse.down()
        await asyncio.sleep(0.08)
        await self.move(x, self.my, dur, straight=True)
        await asyncio.sleep(0.08)
        self.clicks.append(round(self.now(), 4))
        await self.page.mouse.up()

    async def scroll(self, dy, dur):
        start, done = self.now(), 0.0
        while True:
            u = (self.now() - start) / dur
            want = dy * ease(u)
            await self.page.mouse.wheel(0, want - done)
            done = want
            if u >= 1:
                break
            await asyncio.sleep(1 / 70)

    def cam(self, z, x=None, y=None, dur=1.0):
        self.cams.append({"t": round(self.now(), 4), "z": z, "x": x, "y": y, "dur": dur})

    async def box(self, loc):
        b = await loc.bounding_box()
        return b["x"], b["y"], b["width"], b["height"]


def thumb_x(x, w, frac):
    """Centre of a range input's thumb (thumb about 20 px wide) at a share of its travel."""
    return x + 10 + (w - 20) * frac


async def main():
    os.makedirs(os.path.join(OUT, "frames"), exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True,
                                          args=["--force-device-scale-factor=2"])
        ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=DPR)
        page = await ctx.new_page()
        cdp = await ctx.new_cdp_session(page)
        r = Rec(page, cdp)
        cdp.on("Page.screencastFrame", lambda ev: asyncio.ensure_future(r.on_frame(ev)))

        # Warm every page first so the recorded navigations are quick.
        for path in ("/scenarios", "/scenarios/artemis-2", "/spread", "/spread/B1", "/suppress", "/"):
            await page.goto(BASE + path, wait_until="networkidle")
            await page.wait_for_timeout(1000)
        await page.mouse.move(r.mx, r.my)
        await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W * DPR,
                                                "maxHeight": H * DPR, "everyNthFrame": 1})
        await page.wait_for_timeout(500)
        r.t0 = time.time()
        r.on = True
        await page.mouse.move(r.mx + 1, r.my)
        r.cursor.append([0.0, r.mx, r.my])

        # 1. Overview, wide and brief: straight to Scenarios.
        await r.at(0.3)
        x, y, w, h = await r.box(page.locator("a[href='/scenarios']").first)
        await r.move(x + 60, y + h / 2, 1.1)
        await r.at(1.65)
        await r.click()
        card = page.locator("main a[href='/scenarios/artemis-2']").first
        await card.wait_for(state="visible", timeout=6000)

        # 2. Scenarios: the two cards, then the most recent one (Artemis II, April 2026), scrolled.
        await r.at(1.9)
        r.cam(1.35, 839, 380, 0.8)
        x, y, w, h = await r.box(card)
        await r.move(x + w * 0.45, y + h * 0.5, 0.8)
        await r.at(3.4)
        await r.click()
        again = page.get_by_role("button", name="Play again")
        await again.wait_for(state="attached", timeout=6000)
        await r.at(3.6)
        r.cam(1.4, 838, 320, 0.7)
        await r.move(700, 260, 0.7)
        # Scroll down past "what happened" and "what burnrate would have shown" to the 15 flames.
        # The page starts their clock when the card comes into view: 3 s of fan, then it slows.
        await r.at(4.6)
        r.cam(1.4, 838, 460, 1.4)
        x, y, w, h = await r.box(again)
        await r.scroll(y - 140, 2.0)
        await r.at(6.7)
        x, y, w, h = await r.box(page.locator("[data-testid='artemis2-race']"))
        r.notes.append(f"race box {x:.0f},{y:.0f},{w:.0f},{h:.0f}")
        r.cam(1.42, x + w / 2, y + h / 2 - 25, 0.8)
        await r.move(x + w - 150, y + h - 40, 0.9)
        await r.at(7.8)
        await r.move(x + 170, y + 34, 0.9)  # to the "Fan turned down" line as it changes
        await r.at(9.7)
        await r.move(x + w * 0.5, y + h - 30, 1.0)

        # 3. Video to Data: test B1, the NASA clip with the tracked edge beside its chart.
        await r.at(10.9)
        r.cam(1.0, dur=0.7)
        x, y, w, h = await r.box(page.locator("a[href='/spread']").first)
        await r.move(x + 75, y + h / 2, 0.75)
        await r.at(11.75)
        await r.click()
        b1 = page.locator("main a[href='/spread/B1']").first
        await b1.wait_for(state="visible", timeout=6000)
        await r.at(12.0)
        x, y, w, h = await r.box(b1)
        await r.move(x + w / 2, y + h / 2, 0.5)
        await r.at(12.6)
        await r.click()
        video = page.locator("main video").first
        await video.wait_for(state="visible", timeout=6000)
        await r.at(12.9)
        vx, vy, vw, vh = await r.box(video)
        r.notes.append(f"video box {vx:.0f},{vy:.0f},{vw:.0f},{vh:.0f}")
        # One calm framing for the whole part: the clip on the left, its chart on the right.
        r.cam(1.6, 835, vy + vh / 2 + 41, 0.9)
        await r.move(vx + vw / 2, vy + vh / 2, 0.6)
        await r.at(13.7)
        await r.click()
        await r.at(13.95)
        await r.move(930, vy + 14, 1.0)  # park on the blank space beside "Where the flame was"

        # 4. Suppression test bench: add carbon dioxide, then lower the oxygen.
        await r.at(18.5)
        r.cam(1.0, dur=0.7)
        x, y, w, h = await r.box(page.locator("a[href='/suppress']").first)
        await r.move(x + 80, y + h / 2, 0.7)
        await r.at(19.3)
        await r.click()
        tab = page.locator("button[role='tab']", has_text="Try a mixture").first
        await tab.wait_for(state="visible", timeout=6000)
        await r.at(19.6)
        x, y, w, h = await r.box(tab)
        await r.move(x + 70, y + h / 2, 0.45)
        await r.at(20.15)
        await r.click()
        o2 = page.locator("main input[type='range']").first
        await o2.wait_for(state="visible", timeout=6000)
        await r.at(20.35)
        await r.move(700, 520, 0.25)
        r.cam(1.5, 905, 505, 0.8)
        await r.scroll(200, 0.45)
        await r.at(21.1)
        x, y, w, h = await r.box(page.locator("main label", has_text="Carbon dioxide").first)
        await r.move(x + 70, y + h / 2, 0.5)
        await r.at(21.7)
        await r.click()
        co2 = page.locator("main input[type='range']").nth(1)
        await co2.wait_for(state="visible", timeout=4000)
        await r.at(21.85)
        x, y, w, h = await r.box(co2)
        r.notes.append(f"co2 box {x:.0f},{y:.0f},{w:.0f},{h:.0f}")
        await r.move(thumb_x(x, w, 0), y + h / 2, 0.4)
        await r.at(22.35)
        await r.drag(thumb_x(x, w, 1) + 4, 0.85)
        await r.at(23.5)
        await r.move(1356, 744, 0.6)  # beside the predicted share, clear of the number
        await r.at(24.9)
        x, y, w, h = await r.box(o2)
        r.notes.append(f"o2 box {x:.0f},{y:.0f},{w:.0f},{h:.0f}")
        await r.move(thumb_x(x, w, 9 / 22), y + h / 2, 0.5)
        await r.at(25.5)
        await r.drag(thumb_x(x, w, 0) - 4, 0.8)
        await r.at(26.55)
        await r.move(1185, 418, 0.6)  # above the "No flame is drawn" line
        await r.at(27.7)
        r.cam(1.0, dur=0.9)
        await r.at(28.0)
        await r.move(1010, 560, 0.9)
        await r.at(END + 0.3)
        r.on = False
        r.notes.append("oxygen " + await o2.input_value() + ", carbon dioxide " + await co2.input_value())
        await cdp.send("Page.stopScreencast")
        await browser.close()

    json.dump({"end": END, "page": [W, H], "dpr": DPR, "frames": r.frames, "cursor": r.cursor,
               "clicks": r.clicks, "cams": r.cams, "captions": CAPTIONS, "notes": r.notes},
              open(os.path.join(OUT, "timeline.json"), "w"))
    n = len(r.frames)
    print(f"frames={n} avg_fps={n / END:.1f} notes={r.notes}")


asyncio.run(main())
