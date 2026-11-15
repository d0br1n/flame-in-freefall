// Surfaces (DESIGN.md, "Cards"): a card is a surface with a 1 px line border, the large radius
// and the small shadow. A section card has a title row (title left, action right) above its body.
import type { ElementType, ReactNode } from "react";

export const CARD = "rounded-lg border border-line bg-surface shadow-sm";

export function Card({
  children,
  className = "",
  pad = true,
  as: Tag = "div",
  ...rest
}: {
  children: ReactNode;
  className?: string;
  pad?: boolean;
  as?: ElementType;
} & Record<string, unknown>) {
  return (
    <Tag className={`${CARD} ${pad ? "p-5 sm:p-6" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** The card title: the display face, 20 px (redesign: read from the back of a room). */
export function CardTitle({ children, id, as: Tag = "h2", className = "" }: { children: ReactNode; id?: string; as?: "h2" | "h3"; className?: string }) {
  return (
    <Tag id={id} className={`m-0 font-display text-[20px] leading-[28px] font-semibold tracking-[-0.015em] text-ink ${className}`}>
      {children}
    </Tag>
  );
}

export function SectionCard({
  title,
  titleId,
  action,
  children,
  className = "",
  headingLevel = "h2",
  ...rest
}: {
  title: ReactNode;
  titleId?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: "h2" | "h3";
} & Record<string, unknown>) {
  return (
    <section aria-labelledby={titleId} className={`${CARD} p-5 sm:p-6 ${className}`} {...rest}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CardTitle id={titleId} as={headingLevel}>
          {title}
        </CardTitle>
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
