"use client";

// The plain answer that opens the suppression test bench (Linear DOB-140): what put a droplet
// flame out in FLEX (PSI-69). One mark per test, in a box per oxygen band and added gas; a hollow
// mark is a flame that went out with fuel left (the table's "Extinction"). Above the boxes, the
// same counts as four sentences. Every number is a count of rows in flex_tests.json (answer() in
// lib/suppress.ts): no model output here.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useMemo, type ReactNode } from "react";
import { answer, gasInfo, outcomePoints, percent, type AnswerCell, type FlexTestsFile, type Tally } from "@/lib/suppress";
import { SourceNote } from "@/components/SourceNote";
import { CARD } from "@/components/ui/Card";

const PER_ROW = 8;   // marks in one line of a box
const PITCH = 13;    // distance between mark centres, in pixels
const RADIUS = 5;

/** "30 of 33", the count a sentence turns on. */
function Count({ tally }: { tally: Tally }) {
  return (
    <strong className="font-semibold whitespace-nowrap tabular-nums text-ink">
      {tally.wentOut} of {tally.tests}
    </strong>
  );
}

/** One line of the answer: what was done, then what the tests show. */
function Lever({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 border-t border-line py-3.5 first:border-t-0 first:pt-0 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <dt className="font-display text-[17px] leading-[24px] font-semibold tracking-[-0.01em] text-ink">{name}</dt>
      <dd className="m-0 max-w-[62ch] text-[15px] leading-[23px] text-ink-2">{children}</dd>
    </div>
  );
}

/** The marks of one box: filled while the flame kept burning, hollow when it went out. */
function Marks({ cell }: { cell: AnswerCell }) {
  const lines = Math.ceil(cell.marks.length / PER_ROW);
  return (
    <svg width={PER_ROW * PITCH} height={lines * PITCH} aria-hidden="true" className="block">
      {cell.marks.map((mark, i) => (
        <circle
          key={mark.test_id}
          cx={(i % PER_ROW) * PITCH + PITCH / 2}
          cy={Math.floor(i / PER_ROW) * PITCH + PITCH / 2}
          r={mark.wentOut ? RADIUS - 0.75 : RADIUS}
          className={`mark-in ${mark.wentOut ? "fill-none stroke-ink-3" : "fill-ember-fill"}`}
          strokeWidth={mark.wentOut ? 1.5 : 0}
          style={{ ["--d" as string]: cell.band * 90 + i * 7 }}
        />
      ))}
    </svg>
  );
}

function LegendMark({ wentOut }: { wentOut: boolean }) {
  return (
    <svg width={12} height={12} aria-hidden="true" className="shrink-0">
      <circle cx={6} cy={6} r={wentOut ? 4.25 : 5} className={wentOut ? "fill-none stroke-ink-3" : "fill-ember-fill"} strokeWidth={wentOut ? 1.5 : 0} />
    </svg>
  );
}

export function WhatWorks({ file }: { file: FlexTestsFile }) {
  const { points } = useMemo(() => outcomePoints(file.tests), [file]);
  const a = useMemo(() => answer(points), [points]);
  const { carbon_dioxide: co2, helium, nitrogen } = a.atAir;

  if (a.bands.length === 0) {
    return (
      <section className={`${CARD} p-5 sm:p-7`} data-testid="what-works">
        <p className="text-[15px] text-ink-2">The FLEX table states no oxygen or outcome, so there is nothing to count.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="bench-works" className={`${CARD} p-5 sm:p-7`} data-testid="what-works">
      <h2 id="bench-works" className="font-display text-[22px] leading-[28px] font-semibold tracking-[-0.015em] text-ink">
        What put a flame out in FLEX
      </h2>
      <p className="mt-2 max-w-[68ch] text-[15px] leading-[23px] text-ink">
        {points.length} droplet flames lit on the space station, counted by how they ended.
      </p>

      <dl className="mt-5" data-testid="works-levers">
        {a.oxygen ? (
          <Lever name="Lower the oxygen">
            <Count tally={a.oxygen.low} /> flames went out at {a.oxygen.low.band} oxygen. At {a.oxygen.high.band},{" "}
            <Count tally={a.oxygen.high} /> did.
          </Lever>
        ) : null}
        {co2 ? (
          <Lever name="Add carbon dioxide">
            At {co2.band} oxygen, <Count tally={co2} /> went out.
            {nitrogen ? (
              <>
                {" "}
                With nitrogen only, <Count tally={nitrogen} />.
              </>
            ) : null}
          </Lever>
        ) : null}
        {helium ? (
          <Lever name="Add helium">
            At {helium.band} oxygen, <Count tally={helium} /> went out.
          </Lever>
        ) : null}
        {a.addedGasMaxO2 !== null ? (
          <Lever name="Never tested">
            No FLEX test adds a gas above {percent(a.addedGasMaxO2)} oxygen.
            {a.nitrogenAbove > 0 ? ` The ${a.nitrogenAbove} tests above it are nitrogen only.` : ""}{" "}
            <a href="#never-tested" className="font-medium whitespace-nowrap text-brand underline underline-offset-[3px]">
              See the gaps
            </a>
          </Lever>
        ) : null}
      </dl>

      <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-[14px] text-ink" aria-label="Legend">
        <li className="flex items-center gap-2">
          <LegendMark wentOut={false} />
          Kept burning
        </li>
        <li className="flex items-center gap-2">
          <LegendMark wentOut />
          Went out with fuel left
        </li>
      </ul>

      <div className="mt-3 min-w-0 overflow-x-auto rounded-md border border-line">
        <table className="w-full min-w-[50rem] table-fixed border-collapse text-[14px]" data-testid="works-table">
          <caption className="sr-only">FLEX tests by oxygen and added gas: how many flames went out with fuel left</caption>
          <colgroup>
            <col className="w-[9.5rem]" />
            {a.bands.map((band) => (
              <col key={band.label} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th scope="col" className="px-4 pt-3 pb-2 text-left align-bottom text-[14px] font-semibold text-ink-2">
                Added gas
              </th>
              {a.bands.map((band) => (
                <th key={band.label} scope="col" className={`px-3 pt-3 pb-2 text-left align-bottom font-normal ${band.earthAir ? "bg-surface-sunk" : ""}`}>
                  {band.earthAir ? <span className="block text-[13px] leading-[18px] font-medium text-ink-2">Air on Earth</span> : null}
                  <span className="block font-semibold whitespace-nowrap tabular-nums text-ink">{band.label}</span>
                  <span className="block text-[13px] leading-[18px] text-ink-3">oxygen</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {a.rows.map((row) => (
              <tr key={row.gas}>
                <th scope="row" className="border-t border-line px-4 py-4 text-left align-top text-[15px] font-semibold text-ink">
                  {gasInfo(row.gas).label}
                </th>
                {row.cells.map((cell) => (
                  <td
                    key={cell.band}
                    className={`border-t border-line px-3 py-4 align-top ${a.bands[cell.band].earthAir ? "bg-surface-sunk" : ""}`}
                    data-testid={`works-${row.gas}-${cell.band}`}
                  >
                    {cell.marks.length > 0 ? (
                      <>
                        <Marks cell={cell} />
                        <p className="mt-2 text-[14px] leading-[20px] whitespace-nowrap text-ink-2">
                          <span className="font-semibold tabular-nums text-ink">
                            {cell.wentOut} of {cell.marks.length}
                          </span>{" "}
                          went out
                        </p>
                      </>
                    ) : (
                      <p className="inline-block rounded-sm border border-dashed border-danger/60 bg-danger-soft px-2.5 py-1.5 text-[14px] leading-[20px] font-medium text-danger">
                        Never tested
                      </p>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 space-y-1">
        <SourceNote>
          FLEX table (PSI-69), column &ldquo;Test end&rdquo;. &ldquo;Went out&rdquo; is its &ldquo;Extinction&rdquo;.
        </SourceNote>
        <SourceNote label="Limit">Tests in one box also differ in fuel, pressure and droplet size. These are counts of what was flown.</SourceNote>
      </div>

      <p className="mt-6 flex flex-wrap gap-3">
        <a href="#mixture" className="btn btn-primary">
          Try a mixture
        </a>
        <a href="#tested" className="btn btn-secondary">
          See every test
        </a>
      </p>
    </section>
  );
}
