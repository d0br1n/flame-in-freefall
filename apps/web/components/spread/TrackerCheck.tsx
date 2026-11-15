"use client";

// The tracker's check against SI flame markings, under the list of the Video to Data page
// (DOB-159). Every number comes from the engine's validation.json (comparison "val-si-px"); the
// verdict compares the file's result with the file's own pass rule. It is shown whether it
// passes or not: on the current data it does not, and one test accounts for most of it.
import { ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { StatusPill } from "@/components/ui/StatusPill";
import { useApi } from "@/lib/api";
import { moduleFileUrl } from "@/lib/evidence";
import { flagWords, parseTrackerCheck, trackerCheckLine, trackerCheckVerdict, VALIDATION_FILE } from "@/lib/spread";

const CELL = "border-b border-line px-3 py-1.5 align-middle";

export function TrackerCheckNote({ moduleId }: { moduleId: string }) {
  const raw = useApi<unknown>(`/modules/${encodeURIComponent(moduleId)}/files/${VALIDATION_FILE}`);
  // A note under the list: with no file, or no such comparison in it, there is nothing to state.
  const check = raw.status === "ok" ? parseTrackerCheck(raw.data) : null;
  if (!check) return null;
  const worst = check.worst;
  const others = worst ? check.pairs.filter((pair) => pair !== worst && pair.percent !== null).map((pair) => pair.percent as number) : [];
  return (
    <section data-testid="tracker-check" data-passes={check.passes === null ? "unknown" : String(check.passes)} aria-labelledby="tracker-check-title" className="max-w-[75ch]">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 id="tracker-check-title" className="text-[15px] font-semibold text-ink">
          Check: the tracker against SI flame markings
        </h3>
        <StatusPill tone={check.passes === true ? "ok" : check.passes === false ? "warn" : "neutral"} data-testid="tracker-check-verdict">
          {trackerCheckVerdict(check)}
        </StatusPill>
        {/* The markings are SI's: the same badge as every other value SI read. */}
        <ProvenanceBadge tag="SI_EXTRACTED" />
      </div>
      <p className="mt-1 text-[15px] font-semibold tabular-nums text-ink" data-testid="tracker-check-line">
        {trackerCheckLine(check)}
      </p>
      <p className="mt-1 text-[15px] leading-[23px] text-ink-2">
        SI marked the flame front on frames of {check.n} tests and a team member checked the markings. The spread rate from those markings is
        set against the tracker&apos;s rate.{check.rule ? ` Our rule for a pass: ${check.rule}.` : ""}
        {worst && worst.percent !== null && others.length > 0 ? (
          <span data-testid="tracker-check-worst">
            {" "}
            Test {worst.label} accounts for most of the difference ({worst.percent.toFixed(1)}%); the other {others.length} differ by{" "}
            {Math.min(...others).toFixed(1)}% to {Math.max(...others).toFixed(1)}%.
          </span>
        ) : null}
      </p>
      {check.pairs.length > 0 ? (
        <div className="mt-3 overflow-x-auto rounded-md border border-line bg-surface">
          <table data-testid="tracker-check-table" className="w-full min-w-[30rem] border-collapse text-[15px] text-ink [&_tbody_tr:last-child>*]:border-b-0">
            <caption className="sr-only">Spread rate per test: the tracker against the SI markings</caption>
            <thead className="border-b border-line bg-surface-sunk text-left text-[14px]">
              <tr>
                <th scope="col" className={`${CELL} font-semibold`}>Test</th>
                <th scope="col" className={`${CELL} text-right font-semibold`}>Tracker ({check.unit})</th>
                <th scope="col" className={`${CELL} text-right font-semibold`}>SI markings ({check.unit})</th>
                <th scope="col" className={`${CELL} text-right font-semibold`}>Difference</th>
              </tr>
            </thead>
            <tbody>
              {check.pairs.map((pair) => (
                <tr key={pair.label} data-testid="tracker-check-row" data-worst={pair === worst}>
                  <th scope="row" className={`${CELL} text-left font-mono text-[14px] font-medium`}>{pair.label}</th>
                  <td className={`${CELL} text-right tabular-nums`}>{pair.measured.toFixed(2)}</td>
                  <td className={`${CELL} text-right tabular-nums`}>{pair.reference.toFixed(2)}</td>
                  <td className={`${CELL} text-right tabular-nums ${pair === worst ? "font-semibold" : ""}`}>
                    {pair.difference > 0 ? "+" : ""}
                    {pair.difference.toFixed(2)}
                    {pair.percent !== null ? ` (${pair.percent.toFixed(1)}%)` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {check.flags.length > 0 ? (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14px] leading-[21px] text-ink-2" data-testid="tracker-check-flags">
          {check.flags.map((flag) => (
            <li key={flag}>{flagWords(flag)}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-2 text-[13px] text-ink-3">
        No independent hand measurement has been made yet. Source: the engine&apos;s own file,{" "}
        <a href={moduleFileUrl(moduleId, VALIDATION_FILE)} className="font-mono">
          {VALIDATION_FILE}
        </a>
        .
      </p>
    </section>
  );
}
