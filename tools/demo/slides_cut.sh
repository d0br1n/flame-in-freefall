#!/bin/bash
# usage: build.sh <scratch dir> <demo.mp4> <out.mp4>   5 slides (1.5 s each) + captioned demo, 29.45 s
set -e
S="$1"; DEMO="$2"; OUT="$3"
SL=1.5; K=1.341686
T=(0 4.5 11.3 18.9 24.75 28.0 30)
FC=""
for i in 0 1 2 3 4; do FC+="[$i:v]fps=30,format=yuv420p,setsar=1[s$i];"; done
prev="5:v"
for i in 0 1 2 3 4 5; do
  FC+="[$prev][$((6+i)):v]overlay=0:0:enable='between(t,${T[$i]},${T[$((i+1))]}-0.001)'[d$i];"; prev="d$i"
done
FC+="[$prev]setpts=PTS/$K,fps=30,format=yuv420p,setsar=1[demo];[s0][s1][s2][s3][s4][demo]concat=n=6:v=1:a=0[v]"
ffmpeg -v error -y \
  -loop 1 -framerate 30 -t $SL -i "$S/sl-1.png" -loop 1 -framerate 30 -t $SL -i "$S/sl-2.png" \
  -loop 1 -framerate 30 -t $SL -i "$S/sl-3.png" -loop 1 -framerate 30 -t $SL -i "$S/sl-4.png" \
  -loop 1 -framerate 30 -t $SL -i "$S/sl-5.png" -i "$DEMO" \
  -i "$S/ov/o0.png" -i "$S/ov/o1.png" -i "$S/ov/o2.png" -i "$S/ov/o3.png" -i "$S/ov/o4.png" -i "$S/ov/o5.png" \
  -filter_complex "$FC" -map "[v]" -an -t 29.45 -c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -movflags +faststart \
  -metadata title="burnrate: 30 second demo with slides (The Overfitters)" \
  -metadata comment="Five slides, then a screen recording of the live site https://burnrate-psi-rosy.vercel.app sped up 1.3x. Slides, recording and edit made with SI assistance (Claude Code): scripted cursor, camera zoom, step labels. Two slide backgrounds are SI-generated images and are labelled on the slide." \
  "$OUT"
