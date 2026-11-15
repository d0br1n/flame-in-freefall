// An empty state that says what is missing and what to do next, never just "nothing here".
import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export function EmptyState({
  icon = "info",
  title,
  children,
  action,
  className = "",
  ...rest
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
} & Record<string, unknown>) {
  return (
    <div className={`px-4 py-8 text-center text-[14px] text-ink-2 ${className}`} {...rest}>
      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
        <Icon name={icon} />
      </span>
      <p className="mb-1 font-display text-[18px] font-semibold text-ink">{title}</p>
      {children ? <div className="mx-auto max-w-[44ch]">{children}</div> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
