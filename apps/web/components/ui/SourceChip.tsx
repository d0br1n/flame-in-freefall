"use client";

// The source chip: a PSI ID (or a test ID) as a citation, in mono. It links to the investigation
// (or the test) on this site, or, given a record, opens the evidence panel. Every number on the
// site has one beside it, or opens the panel itself (DESIGN.md, "Sources").
import type { ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { useEvidencePanel } from "@/components/evidence/EvidencePanel";
import type { PanelRecord } from "@/lib/evidence";
import { Icon } from "./Icon";

export const CHIP =
  "inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-sm border border-line bg-surface-sunk px-2 font-mono text-[13px] font-medium text-ink no-underline transition-colors duration-150 hover:border-brand hover:bg-brand-soft hover:text-ink active:bg-brand-soft";

export function SourceChip({
  psiId,
  testId,
  href,
  record,
  children,
  label,
  className = "",
  arrow = false,
}: {
  /** The PSI ID: the chip links to /investigations/<id> unless `href` or `record` says otherwise. */
  psiId?: string;
  /** A test ID: the chip links to the test on the tests page. */
  testId?: string;
  href?: string;
  /** An analysis record: the chip opens the evidence panel. */
  record?: PanelRecord;
  children?: ReactNode;
  /** The accessible name, when the visible text is not enough. */
  label?: string;
  className?: string;
  arrow?: boolean;
}) {
  const panel = useEvidencePanel();
  const text = children ?? testId ?? psiId ?? "";
  const content = (
    <>
      {text}
      {arrow ? <Icon name="arrow-up-right" size="xs" className="text-ink-3" /> : null}
    </>
  );
  if (record && panel) {
    return (
      <button
        type="button"
        data-testid="source-chip"
        aria-label={label}
        onClick={(event) => panel.open(record, { opener: event.currentTarget })}
        className={`${CHIP} cursor-pointer ${className}`}
      >
        {content}
      </button>
    );
  }
  const target =
    href ??
    (testId ? `/tests?test=${encodeURIComponent(testId)}` : psiId ? `/investigations/${encodeURIComponent(psiId)}` : null);
  if (!target) return <span className={`${CHIP} ${className}`}>{content}</span>;
  return (
    <AppLink href={target} data-testid="source-chip" aria-label={label} className={`${CHIP} ${className}`}>
      {content}
    </AppLink>
  );
}
