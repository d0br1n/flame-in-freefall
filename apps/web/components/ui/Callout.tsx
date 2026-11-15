// A callout: a soft tinted box with a 1 px border in the tone, a bold title in the tone and the
// text in ink-2. Warn for limits of the data, danger for failures, info for plain notes.
import type { ReactNode } from "react";

export type CalloutTone = "warn" | "danger" | "info";

const TONE: Record<CalloutTone, { box: string; title: string }> = {
  warn: { box: "border-warn/35 bg-warn-soft", title: "text-warn" },
  danger: { box: "border-danger/35 bg-danger-soft", title: "text-danger" },
  info: { box: "border-brand/30 bg-brand-soft", title: "text-ink" },
};

export function Callout({
  tone = "info",
  title,
  children,
  className = "",
  titleAs: Title = "p",
  ...rest
}: {
  tone?: CalloutTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  titleAs?: "p" | "h2" | "h3";
} & Record<string, unknown>) {
  return (
    <div className={`rounded-lg border p-4 text-[15px] leading-[22px] text-ink ${TONE[tone].box} ${className}`} {...rest}>
      {title ? <Title className={`mb-1 font-sans text-[15px] font-bold ${TONE[tone].title}`}>{title}</Title> : null}
      {children}
    </div>
  );
}
