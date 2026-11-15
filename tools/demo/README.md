# Demo video recorder

Makes `submission/demo/burnrate-demo.mp4`: a 29.45 second screen recording of the live site
(https://burnrate-psi-rosy.vercel.app). Written with SI (Claude Code) on 15 Nov 2026.

The look follows the short product videos Vic Giurgiu posts on X (for example
https://x.com/PiticVic/status/2121256775379018232): the app in a window that floats on a
gradient, a camera that zooms into each click and back out, a large cursor, 60 frames per
second, no sound. Only the look is borrowed. No frame, asset or code of his is used. We add what his videos do not have: English captions, and a corner label that says the video
is a screen recording of the live site. SI use is declared in the file's comment metadata and in
`submission/SI_USAGE.md` (the corner label named SI until Iustin shortened it on 15 Nov).

## Two steps

1. `record.py <dir>` drives the real site in headless Google Chrome with a scripted cursor
   (real moves, clicks and scrolls) and saves the page at 2x plus a timeline: frame times,
   cursor path, clicks, camera keyframes, captions.
2. `compose.py <dir> <out.mp4>` draws the window, the gradient, the camera moves, the cursor,
   the captions and the corner label over that capture and encodes H.264. `--preview` renders a quick
   small version. `--no-captions` leaves the captions out.

The route is in `record.py`: Overview (wide, no zoom), Scenarios, the Artemis II scenario (April
2026) scrolled down to its 15 flames, Video to Data test B1 (the clip with the tracked edge
beside its chart, one still framing), then the Suppression test bench, where carbon dioxide is
added and the oxygen is lowered until the page shows no prediction. Iustin chose it on 15 Nov.

Nothing on the page is drawn or changed by the tool: every pixel inside the window is the live
site as it answered during the recording. The captions are the lines of
`submission/DEMO_SCRIPT.md`.

## Run

```bash
uv venv .venv && uv pip install --python .venv/bin/python playwright opencv-python-headless numpy pillow
curl -sSL -o tools/demo/Figtree.ttf "https://github.com/google/fonts/raw/main/ofl/figtree/Figtree%5Bwght%5D.ttf"
.venv/bin/python tools/demo/record.py /tmp/demo-capture
CRF=12 PRESET=veryfast .venv/bin/python tools/demo/compose.py /tmp/demo-capture /tmp/demo-master.mp4
# two passes to a fixed size, so the file stays under the 10 MB limit of the gate
ffmpeg -y -i /tmp/demo-master.mp4 -an -c:v libx264 -preset slow -b:v 2500k -pass 1 -f null /dev/null
ffmpeg -y -i /tmp/demo-master.mp4 -an -c:v libx264 -preset slow -b:v 2500k -pass 2 -pix_fmt yuv420p \
  -movflags +faststart -map_metadata 0 submission/demo/burnrate-demo.mp4
python3 .claude/skills/space-apps-judging/scripts/check.py
```

Needs Google Chrome (for H.264 playback of the flame clip) and FFmpeg on the machine. The
camera keyframes live in the capture's `timeline.json`, so framing can be changed and the video
composed again without recording again.

## The cut with slides

`slides_cut.sh <work dir> <demo.mp4> <out.mp4>` makes
`submission/demo/burnrate-demo-30s-with-slides.mp4`: the five slides of
`submission/demo-deck/` for 1.5 s each, then the recording at 1.3x with a label for every step
(29.43 s in all). Written with SI (Claude Code) on 15 Nov 2026. The work dir must hold the slide
frames `sl-1.png` to `sl-5.png` and the labels `ov/o0.png` to `ov/o5.png`:

```bash
W=/tmp/slides-cut; mkdir -p $W/ov
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CH" --headless=new --no-pdf-header-footer --virtual-time-budget=8000 \
  --print-to-pdf=submission/demo-deck/burnrate-demo-deck.pdf "file://$PWD/submission/demo-deck/index.html"
pdftoppm -r 96 -png submission/demo-deck/burnrate-demo-deck.pdf $W/sl
for i in 0 1 2 3 4 5; do "$CH" --headless=new --hide-scrollbars --default-background-color=00000000 \
  --window-size=1920,1080 --virtual-time-budget=6000 --screenshot=$W/ov/o$i.png \
  "file://$PWD/tools/demo/step-labels.html?i=$i"; done
tools/demo/slides_cut.sh $W submission/demo/burnrate-demo.mp4 submission/demo/burnrate-demo-30s-with-slides.mp4
```

The label texts and the times they switch are in `step-labels.html` and at the top of
`slides_cut.sh`. Needs Google Chrome, Poppler (`pdftoppm`) and FFmpeg.
