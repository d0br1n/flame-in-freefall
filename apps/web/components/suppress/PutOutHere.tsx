"use client";

// What would put the flame out sooner at the mixture the sliders hold (Linear DOB-141): the
// model's predicted share burned along two levers, adding carbon dioxide and lowering the oxygen.
// Each lever has one sentence, a small curve with the model's error band and a mark at the
// sliders' position, and a button that moves the sliders to the lowest point. Every point is a
// cell of flex_grid.json (lib/suppress.ts): nothing is computed here, and a point the engine
// shows no prediction for (no real test near, helium) is left out of the curve.
// Plain SVG, no chart package. Code generated with SI assistance (Claude Code), reviewed by the team.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { linearScale, ticks } from "@/lib/chart";
import {
  carbonDioxideCandidates,
  carbonDioxideCurve,
  leverVerdict,
  lowerOxygenCandidates,
  oxygenCurve,
  percent,
  type CurvePoint,
  type Grid,
  type LeverCurve,
  type LeverVerdict,
  type Selection,
} from "@/lib/suppress";

const HEIGHT = 190;
const MARGIN = { top: 14, right: 14, bottom: 40, left: 44 };

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A predicted share as a whole percent: 0.798 -> 80. */
const whole = (share: number) => Math.round(share * 100);

/** The curve's points that have a prediction, split where the engine shows none. */
function runs(points: CurvePoint[]): (CurvePoint & { share: number })[][] {
  const out: (CurvePoint & { share: number })[][] = [];
  let run: (CurvePoint & { share: number })[] = [];
  for (const point of points) {
    if (point.share === null) {
      if (run.length) out.push(run);
      run = [];
    } else {
      run.push({ ...point, share: point.share });
    }
  }
  if (run.length) out.push(run);
  return out;
}

function LeverChart({ curve, errorPoints, xLabel, unit }: { curve: LeverCurve; errorPoints: number; xLabel: string; unit: string }) {
  const [ref, width] = useWidth(420);
  const plot = { left: MARGIN.left, right: Math.max(MARGIN.left + 80, width - MARGIN.right), top: MARGIN.top, bottom: HEIGHT - MARGIN.bottom };
  const xs = curve.points.map((p) => p.x * 100);
  const x = linearScale([Math.min(...xs), Math.max(...xs)], [plot.left + 6, plot.right - 6]);
  const y = linearScale([0, 100], [plot.bottom, plot.top]);
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  const drawn = runs(curve.points);
  const gaps = curve.points.filter((p) => p.share === null);
  const here = curve.current >= 0 ? curve.points[curve.current] : null;
  const xTicks = ticks(Math.min(...xs), Math.max(...xs), Math.max(2, Math.round((plot.right - plot.left) / 70)));
  const hereOnRight = here ? x(here.x * 100) > (plot.left + plot.right) / 2 : false;

  return (
    <div ref={ref} className="w-full">
      <svg width={width} height={HEIGHT} className="block" role="img" aria-label={`Predicted share of the droplet burned against ${xLabel.toLowerCase()}`}>
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1={plot.left} x2={plot.right} y1={y(tick)} y2={y(tick)} className="stroke-line" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={plot.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-ink-3 text-[13px] tabular-nums">
              {tick}%
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick} x={x(tick)} y={plot.bottom + 17} textAnchor="middle" className="fill-ink-3 text-[13px] tabular-nums">
            {tick}%
          </text>
        ))}
        <text x={(plot.left + plot.right) / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-ink-2 text-[13px]">
          {xLabel}
        </text>

        {/* The sliders' own position. */}
        {here ? (
          <g>
            <line x1={x(here.x * 100)} x2={x(here.x * 100)} y1={plot.top} y2={plot.bottom} className="stroke-ink-3" strokeWidth={1} strokeDasharray="3 3" />
            <text x={x(here.x * 100) + (hereOnRight ? -6 : 6)} y={plot.top + 4} dy="0.32em" textAnchor={hereOnRight ? "end" : "start"} className="fill-ink-2 text-[13px] font-medium">
              your mixture
            </text>
          </g>
        ) : null}

        {/* The model's error around each prediction, then the prediction. */}
        {drawn.map((run) => {
          const upper = run.map((p) => `${x(p.x * 100)},${y(clamp(p.share * 100 + errorPoints))}`);
          const lower = run.map((p) => `${x(p.x * 100)},${y(clamp(p.share * 100 - errorPoints))}`).reverse();
          return run.length > 1 ? <polygon key={`band-${run[0].x}`} points={[...upper, ...lower].join(" ")} className="fill-brand/15" /> : null;
        })}
        {drawn.map((run) =>
          run.length > 1 ? (
            <polyline
              key={`line-${run[0].x}`}
              points={run.map((p) => `${x(p.x * 100)},${y(p.share * 100)}`).join(" ")}
              className="fill-none stroke-brand"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}
        {drawn.flat().map((p) => (
          <circle key={p.x} cx={x(p.x * 100)} cy={y(p.share * 100)} r={3} className="fill-brand">
            <title>{`${percent(p.x)} ${unit}: about ${whole(p.share)}% burned`}</title>
          </circle>
        ))}
        {gaps.map((p) => (
          <circle key={p.x} cx={x(p.x * 100)} cy={plot.bottom} r={2.5} className="fill-surface stroke-ink-3" strokeWidth={1.25}>
            <title>{`${percent(p.x)} ${unit}: no prediction`}</title>
          </circle>
        ))}
        {here && here.share !== null ? (
          <circle cx={x(here.x * 100)} cy={y(here.share * 100)} r={6} className="fill-surface stroke-ink" strokeWidth={2} />
        ) : null}
        {here && here.share !== null ? <circle cx={x(here.x * 100)} cy={y(here.share * 100)} r={2.5} className="fill-ink" /> : null}
      </svg>
      {gaps.length > 0 && drawn.length > 0 ? (
        <p className="mt-1 flex items-center gap-1.5 text-[13px] leading-[19px] text-ink-3">
          <svg width={10} height={10} aria-hidden="true" className="shrink-0">
            <circle cx={5} cy={5} r={2.5} className="fill-surface stroke-ink-3" strokeWidth={1.25} />
          </svg>
          No real test near: no prediction.
        </p>
      ) : null}
    </div>
  );
}

function Lever({
  name,
  testId,
  sentence,
  curve,
  errorPoints,
  xLabel,
  unit,
  action,
}: {
  name: string;
  testId: string;
  sentence: ReactNode;
  curve: LeverCurve;
  errorPoints: number;
  xLabel: string;
  unit: string;
  action: ReactNode;
}) {
  const empty = curve.points.every((p) => p.share === null);
  return (
    <div className="flex min-w-0 flex-col" data-testid={testId}>
      <h4 className="font-display text-[17px] leading-[24px] font-semibold tracking-[-0.01em] text-ink">{name}</h4>
      <p className="mt-1 max-w-[52ch] text-[15px] leading-[23px] text-ink-2" data-testid={`${testId}-sentence`}>
        {sentence}
      </p>
      {empty ? null : (
        <div className="mt-3">
          <p className="text-[13px] leading-[19px] text-ink-3">Predicted share of the droplet burned</p>
          <LeverChart curve={curve} errorPoints={errorPoints} xLabel={xLabel} unit={unit} />
        </div>
      )}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

const Strong = ({ children }: { children: ReactNode }) => <strong className="font-semibold whitespace-nowrap tabular-nums text-ink">{children}</strong>;

/** The numbers of a verdict that has two ends. */
function ends(verdict: Exclude<LeverVerdict, { kind: "none" }>) {
  return { from: whole(verdict.from.share!), to: whole(verdict.to.share!) };
}

export function PutOutHere({
  grid,
  sel,
  onPick,
  modelFailsLabel,
}: {
  grid: Grid;
  sel: Selection;
  onPick: (sel: Selection) => void;
  modelFailsLabel: string;
}) {
  const error = grid.errorPoints;
  const co2 = carbonDioxideCurve(grid, sel);
  const co2Verdict = leverVerdict(co2, carbonDioxideCandidates(co2), error);
  const o2 = oxygenCurve(grid, sel);
  const o2Verdict = leverVerdict(o2, lowerOxygenCandidates(o2), error);
  const same = (a: Selection, b: Selection) => a.gas === b.gas && a.added === b.added && a.o2 === b.o2;

  let co2Sentence: ReactNode;
  if (co2Verdict.kind === "drop") {
    const n = ends(co2Verdict);
    co2Sentence = (
      <>
        With <Strong>{percent(co2Verdict.to.x)}</Strong> carbon dioxide the predicted burn falls from about <Strong>{n.from}%</Strong> to about{" "}
        <Strong>{n.to}%</Strong> of the droplet.
      </>
    );
  } else if (co2Verdict.kind === "flat") {
    const n = ends(co2Verdict);
    co2Sentence = (
      <>
        No clear difference here: about <Strong>{n.from}%</Strong> burned with none, about <Strong>{n.to}%</Strong> at best. The model&rsquo;s error is{" "}
        {error} points.
      </>
    );
  } else {
    co2Sentence =
      co2.points[co2.baseline]?.share == null ? (
        <>No prediction without an added gas at this oxygen, so there is nothing to compare with.</>
      ) : (
        <>No prediction with carbon dioxide at this oxygen.</>
      );
  }

  let o2Sentence: ReactNode;
  if (o2.modelFails) {
    o2Sentence = <>No curve with helium: {modelFailsLabel}.</>;
  } else if (o2Verdict.kind === "drop") {
    const n = ends(o2Verdict);
    o2Sentence = (
      <>
        At <Strong>{percent(o2Verdict.to.x)}</Strong> oxygen the predicted burn falls from about <Strong>{n.from}%</Strong> to about <Strong>{n.to}%</Strong>{" "}
        of the droplet.
      </>
    );
  } else if (o2Verdict.kind === "flat") {
    const n = ends(o2Verdict);
    o2Sentence = (
      <>
        No clear difference here: about <Strong>{n.from}%</Strong> burned now, about <Strong>{n.to}%</Strong> at best. The model&rsquo;s error is {error}{" "}
        points.
      </>
    );
  } else if (o2.current === 0) {
    o2Sentence = <>Oxygen is already at the lowest level on the bench.</>;
  } else {
    o2Sentence =
      o2.points[o2.baseline]?.share == null ? (
        <>No prediction at this mixture, so there is nothing to compare with.</>
      ) : (
        <>No prediction at any lower oxygen.</>
      );
  }

  return (
    <section aria-labelledby="put-out-here" className="mt-6 border-t border-line pt-6" data-testid="put-out-here">
      <h3 id="put-out-here" className="font-display text-[19px] leading-[26px] font-semibold tracking-[-0.01em] text-ink">
        What would put it out sooner here
      </h3>
      <p className="mt-1 max-w-[68ch] text-[15px] leading-[23px] text-ink">The model&rsquo;s prediction for your mixture along two levers.</p>

      <div className="mt-5 grid gap-x-8 gap-y-7 lg:grid-cols-2">
        <Lever
          name="Add carbon dioxide"
          testId="lever-co2"
          sentence={co2Sentence}
          curve={co2}
          errorPoints={error}
          xLabel="Carbon dioxide added"
          unit="carbon dioxide"
          action={
            co2Verdict.kind === "drop" && !same(co2Verdict.to.sel, sel) ? (
              <button type="button" className="btn btn-secondary" onClick={() => onPick(co2Verdict.to.sel)}>
                Set carbon dioxide to {percent(co2Verdict.to.x)}
              </button>
            ) : null
          }
        />
        <Lever
          name="Lower the oxygen"
          testId="lever-o2"
          sentence={o2Sentence}
          curve={o2}
          errorPoints={error}
          xLabel="Oxygen"
          unit="oxygen"
          action={
            o2Verdict.kind === "drop" && !same(o2Verdict.to.sel, sel) ? (
              <button type="button" className="btn btn-secondary" onClick={() => onPick(o2Verdict.to.sel)}>
                Set oxygen to {percent(o2Verdict.to.x)}
              </button>
            ) : null
          }
        />
      </div>
    </section>
  );
}
