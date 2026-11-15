// Small shared markers: "example data" (DESIGN.md: example values are never mistakable for
// results) and the pass / fail / being-measured mark of a check (a word and a shape, not colour alone).
import type { ReactNode } from "react";
import type { CheckVerdict } from "@/lib/pillar";
import { Mark } from "./ProvenanceBadge";

/** Inline marker beside a number of an analysis whose status is "example". */
export function ExampleMarker() {
  return (
    <span
      data-testid="example-marker"
      className="inline-block whitespace-nowrap rounded-sm border border-warn bg-warn-wash px-1.5 py-px text-[0.875rem] font-normal leading-tight text-warn"
    >
      example data
    </span>
  );
}

/** The block form, for the top of a page or of the evidence panel. */
export function ExampleCallout({ children, testId = "example-banner" }: { children?: ReactNode; testId?: string }) {
  return (
    <div role="note" data-testid={testId} className="max-w-[calc(70ch+2.5rem)] rounded-md border border-warn bg-warn-wash px-4 py-3 text-ink">
      <p className="font-semibold text-warn">Example data, not results</p>
      <p className="mt-0.5">
        {children ?? "These numbers are placeholders that show how the page will work. They are not measurements and must not be read as results."}
      </p>
    </div>
  );
}

const VERDICT_MARK: Record<CheckVerdict["word"], string> = {
  passed: "M3 8.5l3.2 3.2L13 4.5",
  failed: "M4 4l8 8 M12 4l-8 8",
  "being measured": "M8 2.5a5.5 5.5 0 1 0 0.01 0z M8 5v3.2l2.2 1.4",
};

const VERDICT_TONE: Record<CheckVerdict["tone"], string> = {
  ok: "border-ok bg-ok-wash text-ok",
  danger: "border-danger bg-danger-wash text-danger",
  warn: "border-warn bg-warn-wash text-warn",
};

/** "passed" with a tick, "failed" with a cross, "being measured" with a clock face. */
export function VerdictMark({ verdict }: { verdict: CheckVerdict }) {
  return (
    <span
      data-testid="check-verdict"
      data-verdict={verdict.word}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 py-px text-[0.875rem] font-medium leading-tight ${VERDICT_TONE[verdict.tone]}`}
    >
      <Mark path={VERDICT_MARK[verdict.word]} />
      {verdict.word}
    </span>
  );
}
