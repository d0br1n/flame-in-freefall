"use client";

// Measured, no model (DOB-87): every FLEX test (PSI-69) as one dot, oxygen across, how the test
// ended down the side, colour (blue steps, a dark edge on every dot) and shape by the gas added
// to the air, as on the tests chart. A dashed band marks 30 to 34%
// oxygen, the Moon-base-like air of the challenge text. Hover shows the test; click opens it in
// the tests explorer. The counts are also given as a table below the plot (lib/suppress.ts).
// Plain SVG, no chart package. Code generated with SI assistance (Claude Code), reviewed by the team.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { linearScale, nearestPoint, shapePath, ticks } from "@/lib/chart";
import { GASES, OUTCOMES, gasInfo, percent, testHref, type OutcomePoint } from "@/lib/suppress";
import { seriesFill } from "@/components/tests/series";

const MARGIN = { top: 30, right: 18, bottom: 46, left: 100 };
const BAND = 86;           // height of one outcome row, in pixels
const MARK_R = 5;
const HIT_RADIUS = 12;
const X_DOMAIN: [number, number] = [10, 36];   // oxygen, % of the gas: FLEX spans 12 to 34
const REGION: [number, number] = [30, 34];     // challenge text: "likely 30% oxygen or more at 10.2 psi or less"

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

export function OutcomePlot({ points }: { points: OutcomePoint[] }) {
  const router = useRouter();
  const [ref, width] = useWidth(720);
  const height = MARGIN.top + BAND * OUTCOMES.length + MARGIN.bottom;
  const plot = { left: MARGIN.left, right: Math.max(MARGIN.left + 120, width - MARGIN.right), top: MARGIN.top, bottom: height - MARGIN.bottom };
  const x = linearScale(X_DOMAIN, [plot.left, plot.right]);
  const rowCentre = (outcome: OutcomePoint["outcome"]) => plot.top + BAND * (OUTCOMES.indexOf(outcome) + 0.5);
  const pixels = useMemo(
    () => points.map((p) => ({ x: x(p.o2 * 100), y: rowCentre(p.outcome) + p.jitter * (BAND - 2 * MARK_R - 6) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, width],
  );
  const [active, setActive] = useState(-1);
  const xTicks = ticks(X_DOMAIN[0], X_DOMAIN[1], Math.max(3, Math.round((plot.right - plot.left) / 80)));

  function at(event: { currentTarget: Element; clientX: number; clientY: number }) {
    const box = event.currentTarget.getBoundingClientRect();
    return nearestPoint(pixels, event.clientX - box.left, event.clientY - box.top, HIT_RADIUS);
  }

  const activePoint = active >= 0 ? points[active] : null;
  const activePixel = active >= 0 ? pixels[active] : null;

  return (
    <figure aria-label="How each FLEX test ended, by oxygen and added gas" data-testid="outcome-plot">
      <ul className="flex flex-wrap gap-2 text-[14px]" aria-label="Legend">
        {GASES.map((gas) => (
          <li key={gas.key} className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 font-medium text-ink">
            <svg width={14} height={14} aria-hidden="true">
              <path d={shapePath(gas.shape, MARK_R)} transform="translate(7 7)" className={`${seriesFill(gas.slot)} stroke-blue-950/60`} strokeWidth={0.75} />
            </svg>
            {gas.label} <span className="tabular-nums text-ink-2">({points.filter((p) => p.gas === gas.key).length})</span>
          </li>
        ))}
      </ul>
      <div ref={ref} className="relative mt-3 w-full rounded-md border border-line bg-surface">
        <svg
          width={width}
          height={height}
          className="block cursor-crosshair select-none"
          aria-hidden="true"
          onPointerMove={(event) => setActive(at(event))}
          onPointerLeave={() => setActive(-1)}
          onClick={(event) => {
            const index = at(event);
            if (index >= 0) router.push(testHref(points[index].test_id));
          }}
        >
          {/* The Moon-base-like air: a light band behind the dots. */}
          <rect x={x(REGION[0])} y={plot.top} width={x(REGION[1]) - x(REGION[0])} height={plot.bottom - plot.top} className="fill-accent/10 stroke-accent" strokeWidth={1} strokeDasharray="6 3" />
          <text x={x(REGION[1])} y={plot.top - 10} textAnchor="end" className="fill-accent text-[13px] font-semibold">
            30 to 34% oxygen
          </text>

          {xTicks.map((tick) => (
            <g key={tick}>
              <line x1={x(tick)} x2={x(tick)} y1={plot.top} y2={plot.bottom} className="stroke-rule" strokeWidth={1} shapeRendering="crispEdges" />
              <text x={x(tick)} y={plot.bottom + 18} textAnchor="middle" className="fill-ink-2 text-[13px] tabular-nums">
                {tick}
              </text>
            </g>
          ))}
          {OUTCOMES.map((outcome, i) => (
            <g key={outcome}>
              {i > 0 ? (
                <line x1={plot.left} x2={plot.right} y1={plot.top + BAND * i} y2={plot.top + BAND * i} className="stroke-rule" strokeWidth={1} shapeRendering="crispEdges" />
              ) : null}
              <text x={plot.left - 12} y={rowCentre(outcome)} dy="0.32em" textAnchor="end" className="fill-ink text-[14px] font-semibold">
                {outcome}
              </text>
            </g>
          ))}
          <line x1={plot.left} x2={plot.right} y1={plot.bottom} y2={plot.bottom} className="stroke-ink-2" strokeWidth={1} shapeRendering="crispEdges" />
          <text x={(plot.left + plot.right) / 2} y={height - 8} textAnchor="middle" className="fill-ink text-[14px]">
            Oxygen (% of the gas)
          </text>

          {points.map((p, i) => {
            const gas = gasInfo(p.gas);
            return (
              <g key={p.test_id} transform={`translate(${pixels[i].x} ${pixels[i].y})`}>
                <path
                  d={shapePath(gas.shape, MARK_R)}
                  className={`mark-in ${seriesFill(gas.slot)} ${i === active ? "stroke-ink" : "stroke-blue-950/60"}`}
                  style={{ ["--d" as string]: Math.min(700, Math.round(pixels[i].x * 0.45)) }}
                  strokeWidth={i === active ? 2 : 0.75}
                  opacity={active >= 0 && i !== active ? 0.55 : 0.9}
                />
              </g>
            );
          })}
        </svg>
        {activePoint && activePixel ? (
          <div
            role="tooltip"
            data-testid="outcome-tooltip"
            className="pointer-events-none absolute z-10 w-max max-w-[16rem] rounded-sm border border-control bg-card px-3 py-2 text-[0.875rem] leading-snug"
            style={{
              left: Math.min(activePixel.x + 12, Math.max(0, width - 220)),
              top: Math.max(0, activePixel.y - 70),
            }}
          >
            <p className="font-mono text-[0.875rem]">{activePoint.test_id}</p>
            <p>
              {activePoint.fuel}, {gasInfo(activePoint.gas).label.toLowerCase()}
            </p>
            <p className="tabular-nums">
              Oxygen {percent(activePoint.o2)}
              {activePoint.pressure_atm !== null ? `, ${activePoint.pressure_atm} atm` : ""}
            </p>
            <p>Ended: {activePoint.outcome}</p>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
