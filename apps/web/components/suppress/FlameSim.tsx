"use client";

// The animated droplet flame of the suppression test bench (Linear DOB-142, DOB-145): an
// illustration driven by the flame temperature engine's numbers for the mixture the sliders hold.
// The droplet ignites and burns, and the flame goes out when the share burned reaches the model's
// prediction; the droplet left stays on screen (rules and timing: lib/flame.ts).
//
// What comes from the engine: the predicted share burned (when the flame goes out, the size of the
// droplet left), the flame ceiling temperature (how bright the flame is drawn) and the droplet
// size at the start (the scale).
//
// What comes from real footage (DOB-145): the look. It is matched by eye to NASA's video of a
// droplet test in the same apparatus, CFI test FLEX-1393 (PSI-39, files "MDCA_View_Movie.mp4" and
// "Droplet_View_Movie.mp4"): glowing igniters, a white-hot flash, then a faint blue-grey sphere
// with a thin edge that fades away, on a black camera picture with coloured sensor specks; and a
// second, backlit camera that shows the droplet as a black disc. That test burned another fuel.
// The seconds and the flame's size are not measured, and the picture says so. Where the engine
// shows no prediction (helium, no real test near, no such mixture) no flame is drawn.
// Drawn by code on a canvas: no generated image or video. The stage copies a camera picture, so
// its colours are fixed and not theme tokens.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useEffect, useMemo, useRef, useState } from "react";
import { PHASE_WORD, fitRadius, frameAt, heat, restFrame, type FlameFrame, type FlamePhase } from "@/lib/flame";
import { shareRange, type Grid, type GridCell } from "@/lib/suppress";

const STAGE_HEIGHT = 284;
/** Below this width the stage is hidden or too narrow to hold the picture. */
const MIN_STAGE_WIDTH = 160;
const PX_PER_MM = 11;
/** Flame radius over the droplet's radius at the start: an illustration choice, not a measurement. */
const FLAME_OVER_DROPLET = 5;
/** The backlit droplet view in the corner: its side and its own scale. */
const INSET = 96;
const INSET_MARGIN = 12;
const INSET_PX_PER_MM = 15;
const SCALE_MM = 2;
const TAU = Math.PI * 2;

type Kind = "predicted" | "model-fails" | "no-test-near" | "impossible";

const rgba = (r: number, g: number, b: number, a: number) => `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

interface Scene {
  /** The droplet's diameter at the start, in mm. */
  d0: number;
  /** The predicted share burned, 0 to 1. */
  final: number;
  /** 0 (coldest mixture on the bench) to 1 (hottest). */
  heat: number;
  /** False where the engine shows no prediction: the droplet alone is drawn. */
  lit: boolean;
}

function disc(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, fill: string | CanvasGradient) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** The camera's fixed coloured specks, the same on every frame, as in the real video. */
const specks = new Map<string, HTMLCanvasElement>();
function sensorSpecks(w: number, h: number): HTMLCanvasElement {
  const key = `${w}x${h}`;
  const known = specks.get(key);
  if (known) return known;
  const layer = document.createElement("canvas");
  layer.width = w;
  layer.height = h;
  const ctx = layer.getContext("2d");
  if (ctx) {
    // A fixed sequence, so the specks do not move between frames or page loads.
    let seed = 20170622;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const tints: [number, number, number][] = [[255, 70, 70], [80, 255, 120], [90, 120, 255], [255, 90, 220], [220, 220, 255]];
    const count = Math.round((w * h) / 520);
    for (let i = 0; i < count; i += 1) {
      const [r, g, b] = tints[Math.floor(next() * tints.length)];
      ctx.fillStyle = rgba(r, g, b, 0.22 + next() * 0.5);
      ctx.fillRect(Math.floor(next() * w), Math.floor(next() * h), 1, 1);
    }
  }
  specks.set(key, layer);
  return layer;
}

/** The colour camera: the flame as the real video shows it. */
function paintFlameView(ctx: CanvasRenderingContext2D, w: number, h: number, frame: FlameFrame, scene: Scene) {
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#050308";
  ctx.fillRect(0, 0, w, h);

  const cx = Math.min(w / 2, (w - INSET - INSET_MARGIN) / 2 + 10);
  const cy = h / 2 - 12;
  const r0 = (scene.d0 * PX_PER_MM) / 2;
  const r = r0 * frame.ratio;
  const reach = fitRadius(FLAME_OVER_DROPLET * r0, cx, cy, h);
  // How far the burn has come, 0 to 1.
  const progress = scene.final > 0 ? Math.min(1, frame.share / scene.final) : 1;

  if (scene.lit && frame.phase === "igniting") {
    // The igniters glow and light the chamber red, then the fuel catches: a white-hot ball.
    const dying = 1 - frame.flame;
    ctx.globalCompositeOperation = "lighter";
    const chamber = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    chamber.addColorStop(0, rgba(210, 70, 30, 0.42 * dying));
    chamber.addColorStop(0.5, rgba(150, 30, 14, 0.2 * dying));
    chamber.addColorStop(1, rgba(60, 8, 4, 0));
    ctx.fillStyle = chamber;
    ctx.fillRect(0, 0, w, h);

    // Two igniter wires, one on each side, drawing back as the flame takes.
    const gap = r0 + 4 + frame.flame * reach * 0.9;
    ctx.lineCap = "round";
    for (const side of [-1, 1]) {
      const x1 = cx + side * gap * 0.82;
      const y1 = cy - side * gap * 0.57;
      const x2 = cx + side * (gap + 34) * 0.82;
      const y2 = cy - side * (gap + 34) * 0.57;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineWidth = 7;
      ctx.strokeStyle = rgba(255, 120, 50, 0.35 * dying);
      ctx.stroke();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = rgba(255, 226, 190, 0.9 * dying);
      ctx.stroke();
    }

    const ball = reach * (0.3 + 0.38 * frame.flame);
    const hot = ctx.createRadialGradient(cx, cy, 0, cx, cy, ball * 1.5);
    hot.addColorStop(0, rgba(255, 252, 244, 0.98 * frame.flame));
    hot.addColorStop(0.6, rgba(255, 240, 226, 0.92 * frame.flame));
    hot.addColorStop(0.75, rgba(255, 196, 170, 0.4 * frame.flame));
    hot.addColorStop(1, rgba(255, 150, 120, 0));
    disc(ctx, cx, cy, ball * 1.5, hot);
  }

  if (scene.lit && frame.flame > 0.002 && frame.phase !== "igniting") {
    const fading = frame.phase === "going-out";
    // The first part of the burn is still bright and warm: a ring with a darker middle.
    const warm = fading ? 0 : Math.max(0, 1 - progress / 0.24);
    const radius = reach * (0.68 + 0.32 * (1 - warm)) * (1 + 0.1 * progress) * (fading ? 1 + 0.1 * (1 - frame.flame) : 1);
    ctx.globalCompositeOperation = "lighter";

    if (warm > 0) {
      const ring = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.25);
      ring.addColorStop(0, rgba(255, 214, 205, 0.34 * warm));
      ring.addColorStop(0.45, rgba(255, 226, 214, 0.5 * warm));
      ring.addColorStop(0.72, rgba(255, 244, 236, 0.92 * warm));
      ring.addColorStop(0.86, rgba(255, 205, 190, 0.4 * warm));
      ring.addColorStop(1, rgba(220, 150, 150, 0));
      disc(ctx, cx, cy, radius * 1.25, ring);
    }

    // The long part: a faint blue-grey sphere seen through, a little brighter at its edge,
    // dimmer as the burn goes on and gone when the flame goes out.
    const strength = frame.flame * (1 - 0.55 * warm) * (0.7 + 0.3 * scene.heat) * (1 - 0.3 * progress);
    const sphere = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.12);
    sphere.addColorStop(0, rgba(104, 122, 168, 0.2 * strength));
    sphere.addColorStop(0.7, rgba(112, 132, 180, 0.26 * strength));
    sphere.addColorStop(0.86, rgba(150, 172, 220, 0.5 * strength));
    sphere.addColorStop(0.9, rgba(176, 196, 236, 0.62 * strength));
    sphere.addColorStop(0.95, rgba(120, 142, 196, 0.24 * strength));
    sphere.addColorStop(1, rgba(90, 110, 170, 0));
    disc(ctx, cx, cy, radius * 1.12, sphere);
  }

  // The droplet: the colour camera shows little of it, a dark bead with a warm glint.
  ctx.globalCompositeOperation = "source-over";
  // The white-hot flash and the bright ring hide it, as the glare does in the real video.
  const glare = !scene.lit ? 0 : frame.phase === "igniting" ? frame.flame : frame.phase === "burning" ? Math.max(0, 1 - progress / 0.24) : 0;
  const seen = 1 - Math.min(1, glare * 1.4);
  if (r > 0.5 && seen > 0.02) {
    const lit = scene.lit ? frame.flame : 0;
    disc(ctx, cx, cy, r, rgba(26, 28, 40, 0.9 * seen));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(150, 164, 200, (0.3 + 0.3 * lit) * seen);
    ctx.stroke();
    ctx.globalCompositeOperation = "lighter";
    disc(ctx, cx - r * 0.2, cy - r * 0.15, Math.max(1.1, r * 0.2), rgba(255, 176, 96, (0.35 + 0.6 * lit) * seen));
  }

  ctx.globalCompositeOperation = "lighter";
  ctx.drawImage(sensorSpecks(Math.round(w), Math.round(h)), 0, 0);
  ctx.globalCompositeOperation = "source-over";
}

/** The backlit camera in the corner: the droplet as a black disc, as the real droplet view shows it. */
function paintDropletView(ctx: CanvasRenderingContext2D, w: number, h: number, frame: FlameFrame, scene: Scene) {
  const x = w - INSET - INSET_MARGIN;
  const y = h - INSET - INSET_MARGIN;
  const cx = x + INSET / 2;
  const cy = y + INSET / 2 - 7;
  const r0 = (scene.d0 * INSET_PX_PER_MM) / 2;
  const r = r0 * frame.ratio;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, INSET, INSET, 6);
  ctx.clip();
  const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, INSET * 0.8);
  light.addColorStop(0, "#d9dadc");
  light.addColorStop(1, "#b4b6b9");
  ctx.fillStyle = light;
  ctx.fillRect(x, y, INSET, INSET);

  if (scene.lit && frame.phase === "igniting") {
    // The two needles that hold the droplet, drawing back.
    const away = r0 + 2 + frame.flame * INSET;
    ctx.lineCap = "butt";
    ctx.lineWidth = 9;
    ctx.strokeStyle = "#0b0b0c";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + side * away * 0.72, cy - side * away * 0.69);
      ctx.lineTo(cx + side * (away + INSET) * 0.72, cy - side * (away + INSET) * 0.69);
      ctx.stroke();
    }
  }
  // The droplet's size at the start, to compare with what is left.
  if (frame.share > 0.01) {
    ctx.beginPath();
    ctx.arc(cx, cy, r0, 0, TAU);
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(20,20,22,0.55)";
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (r > 0.4) disc(ctx, cx, cy, r, "#0b0b0c");

  const bar = SCALE_MM * INSET_PX_PER_MM;
  ctx.fillStyle = "#17181a";
  ctx.fillRect(x + INSET - 8 - bar, y + INSET - 9, bar, 1.5);
  ctx.font = "500 11px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(`${SCALE_MM} mm`, x + 8, y + INSET - 6);
  ctx.restore();

  ctx.beginPath();
  ctx.roundRect(x + 0.5, y + 0.5, INSET - 1, INSET - 1, 6);
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.stroke();
}

function paint(ctx: CanvasRenderingContext2D, w: number, h: number, frame: FlameFrame, scene: Scene) {
  paintFlameView(ctx, w, h, frame, scene);
  paintDropletView(ctx, w, h, frame, scene);
}

/** The quiet picture before Play: the whole droplet, no flame. */
const IDLE_FRAME: FlameFrame = { phase: "out", share: 0, ratio: 1, flame: 0, sinceOut: 0 };

const PHASE_DOT: Record<FlamePhase, string> = {
  igniting: "#ffd9a8",
  burning: "#ff8a47",
  "going-out": "#c9a58c",
  out: "#8f99aa",
};

export function FlameSim({ cell, d0, grid, modelFailsLabel }: { cell: GridCell | null; d0: number; grid: Grid; modelFailsLabel: string }) {
  const kind: Kind = cell === null ? "impossible" : cell.modelFails ? "model-fails" : cell.noTestNear || cell.sharePred === null ? "no-test-near" : "predicted";
  const share = kind === "predicted" ? cell!.sharePred! : 0;
  const temperature = cell?.temperatureK ?? null;

  // The coldest and hottest ceiling temperature on the bench: the brightness scale.
  const [coldest, hottest] = useMemo(() => {
    let low = Infinity;
    let high = -Infinity;
    for (const c of grid.cells.values()) {
      if (c.temperatureK === null) continue;
      low = Math.min(low, c.temperatureK);
      high = Math.max(high, c.temperatureK);
    }
    return [low, high];
  }, [grid]);
  const warmth = heat(temperature, coldest, hottest);

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const number = useRef<HTMLSpanElement>(null);
  const word = useRef<HTMLSpanElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const clock = useRef({ origin: 0, frozen: 0 });
  // The picture waits for Play. A run belongs to the mixture it was started for: when a slider
  // changes the mixture the run no longer matches and the stage goes back to the quiet droplet,
  // so editing never restarts the animation (it only starts again when Play is pressed).
  const mixtureKey = `${kind}|${share}|${warmth}|${d0}`;
  const [run, setRun] = useState<{ key: string; paused: boolean } | null>(null);
  const active = run !== null && run.key === mixtureKey;
  const paused = active && run.paused;
  const [still, setStill] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setStill(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  useEffect(() => {
    const element = canvas.current;
    const holder = stage.current;
    const ctx = element?.getContext("2d");
    if (!element || !holder || !ctx) return;

    let width = holder.clientWidth;
    let visible = true;
    let request = 0;
    const size = () => {
      width = holder.clientWidth;
      if (width < MIN_STAGE_WIDTH) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      element.width = Math.round(width * ratio);
      element.height = Math.round(STAGE_HEIGHT * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    size();

    let shown = "";
    const render = (seconds: number) => {
      // A hidden stage (another section is open) has no width: nothing to draw (DOB-146).
      if (width < MIN_STAGE_WIDTH) return;
      const lit = kind === "predicted";
      const frame = !lit ? restFrame(0) : still ? restFrame(share) : !active ? IDLE_FRAME : frameAt(seconds, share);
      paint(ctx, width, STAGE_HEIGHT, frame, { d0, final: share, heat: warmth, lit });
      if (!lit) return;
      const idle = !still && !active;
      const text = `${Math.round(frame.share * 100)}%|${frame.phase}|${idle}`;
      if (text === shown) return;
      shown = text;
      if (number.current) number.current.textContent = `${Math.round(frame.share * 100)}%`;
      if (word.current) word.current.textContent = idle ? "Ready" : PHASE_WORD[frame.phase];
      if (dot.current) dot.current.style.background = PHASE_DOT[frame.phase];
    };

    const animated = kind === "predicted" && !still && active && !paused;
    const tick = () => {
      const seconds = performance.now() / 1000 - clock.current.origin;
      clock.current.frozen = seconds;
      render(seconds);
      if (animated && visible) request = requestAnimationFrame(tick);
    };
    if (animated) {
      request = requestAnimationFrame(tick);
    } else {
      render(clock.current.frozen);
    }

    const resize = new ResizeObserver(() => {
      size();
      if (!animated || !visible) render(clock.current.frozen);
    });
    resize.observe(holder);
    const watch = new IntersectionObserver(([entry]) => {
      const was = visible;
      visible = entry.isIntersecting;
      if (visible && !was && animated) {
        // Carry on from where the picture stopped.
        clock.current.origin = performance.now() / 1000 - clock.current.frozen;
        request = requestAnimationFrame(tick);
      }
    });
    watch.observe(holder);

    return () => {
      cancelAnimationFrame(request);
      resize.disconnect();
      watch.disconnect();
    };
  }, [kind, share, warmth, d0, active, paused, still]);

  function onButton() {
    const now = performance.now() / 1000;
    if (!active) {
      // Play: the burn starts from the ignition.
      clock.current.origin = now;
      clock.current.frozen = 0;
      setRun({ key: mixtureKey, paused: false });
    } else {
      if (paused) clock.current.origin = now - clock.current.frozen;
      setRun({ key: mixtureKey, paused: !paused });
    }
  }

  const range = kind === "predicted" ? shareRange(share, grid.errorPoints) : null;
  const summary =
    kind === "predicted"
      ? `Illustration driven by the model: the flame goes out after about ${range!.value}% of the droplet has burned.`
      : kind === "model-fails"
        ? `No flame is drawn with helium: ${modelFailsLabel}.`
        : kind === "no-test-near"
          ? "No flame is drawn: no real FLEX test is near this mixture."
          : "No flame is drawn: there is no such mixture.";

  return (
    <figure className="m-0" data-testid="flame-sim" data-state={kind}>
      <div ref={stage} className="relative overflow-hidden rounded-md bg-[#050308]" style={{ height: STAGE_HEIGHT }}>
        <canvas ref={canvas} aria-hidden="true" className="block h-full w-full" />

        <p className="absolute top-3 left-3 m-0 rounded-full border border-white/20 bg-black/35 px-2.5 py-1 text-[13px] leading-[18px] font-medium text-white/90">
          Illustration driven by the model
        </p>

        {kind === "predicted" && !still ? (
          <button
            type="button"
            onClick={onButton}
            className={`absolute inline-flex min-h-8 cursor-pointer items-center rounded-full border border-white/25 px-3 text-[13px] font-medium text-white/90 transition-colors duration-150 hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white max-sm:min-h-11 ${
              active ? "top-2.5 right-3 bg-black/35" : "top-[calc(50%-12px)] left-[calc(50%-48px)] min-h-11 bg-black/55 px-6 text-[15px]"
            }`}
          >
            {active && !paused ? "Pause" : "Play"}
          </button>
        ) : null}

        {kind === "predicted" ? (
          <div className="absolute bottom-3 left-4" style={{ maxWidth: `calc(100% - ${INSET + INSET_MARGIN + 28}px)` }} aria-hidden="true">
            <p className="m-0 flex items-center gap-2 text-[13px] leading-[18px] font-medium text-white/85">
              <span ref={dot} className="inline-block h-2 w-2 rounded-full" style={{ background: PHASE_DOT.out }} />
              <span ref={word}>{PHASE_WORD.out}</span>
            </p>
            <p className="m-0 mt-0.5 flex flex-wrap items-baseline gap-x-2 text-white">
              <span ref={number} className="font-display text-[34px] leading-[38px] font-semibold tracking-[-0.02em] tabular-nums">
                {range!.value}%
              </span>
              <span className="text-[14px] text-white/80">of the droplet burned</span>
            </p>
          </div>
        ) : (
          <p
            className="absolute bottom-3 left-4 m-0 max-w-[40ch] text-[15px] leading-[22px] font-medium text-white/90"
            style={{ right: INSET + INSET_MARGIN + 16 }}
          >
            {summary}
          </p>
        )}

        <p
          className="absolute m-0 text-[13px] leading-[16px] font-medium text-white/80"
          style={{ right: INSET_MARGIN, bottom: INSET_MARGIN + INSET + 5 }}
          aria-hidden="true"
        >
          Droplet, backlit
        </p>
      </div>
      <figcaption className={kind === "predicted" ? "mt-2 max-w-[62ch] text-[13px] leading-[19px] text-ink-3" : "sr-only"}>
        <span className="sr-only">{summary} </span>
        {kind === "predicted"
          ? "The flame goes out at the predicted share burned, and the droplet left is that size. The look follows NASA video of a droplet test in the same apparatus (CFI test FLEX-1393, PSI-39), which burned another fuel. Time and flame size are not measured."
          : null}
      </figcaption>
    </figure>
  );
}
