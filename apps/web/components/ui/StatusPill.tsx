// A status in a pill: a dot and a word, on the soft state colour. The word carries the meaning;
// the colour only adds to it (never colour alone).
import type { ReactNode } from "react";

export type PillTone = "ok" | "warn" | "danger" | "ember" | "brand" | "neutral";

const TONE: Record<PillTone, string> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  ember: "bg-ember-soft text-ember",
  brand: "bg-brand-soft text-brand",
  neutral: "bg-surface-sunk text-ink-2",
};

export function StatusPill({ tone, children, className = "", ...rest }: { tone: PillTone; children: ReactNode; className?: string } & Record<string, unknown>) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-semibold ${TONE[tone]} ${className}`}
      {...rest}
    >
      <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-current" />
      {children}
    </span>
  );
}
