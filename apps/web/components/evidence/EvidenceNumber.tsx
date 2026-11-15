"use client";

// A number that says where it comes from: a real <button> that opens the evidence panel
// (EvidencePanel.tsx). Use it for every number of an analysis, on every page.
import { formatValue, type PanelRecord } from "@/lib/evidence";
import { useEvidencePanel } from "./EvidencePanel";
import { ExampleMarker } from "./Markers";

export function EvidenceNumber({ record, example = false }: { record: PanelRecord; example?: boolean }) {
  const panel = useEvidencePanel();
  const text = formatValue(record.value, record.unit);
  const marker = example ? <ExampleMarker /> : null;
  if (!panel) {
    return (
      <span className="tabular-nums">
        {text} {marker}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap">
      <button
        type="button"
        data-testid="evidence-number"
        onClick={(event) => panel.open(record, { opener: event.currentTarget, status: example ? "example" : undefined })}
        className="cursor-pointer rounded-sm font-medium tabular-nums text-accent underline decoration-dotted underline-offset-[3px] hover:text-accent-hover hover:decoration-solid active:text-accent-hover"
      >
        {text}
        <span className="sr-only">, show where this number comes from</span>
      </button>
      {marker ? <> {marker}</> : null}
    </span>
  );
}
