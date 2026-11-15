// Buttons (DESIGN.md, "Buttons"): primary (brand fill), secondary (surface, line border), ghost
// (no fill) and danger. 40 px tall, 44 px on phones; hover, focus-visible, active and disabled
// states come from the .btn classes in app/globals.css.
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export function buttonClass(variant: ButtonVariant = "secondary", extra = ""): string {
  return `btn btn-${variant} ${extra}`;
}

export function Button({
  variant = "secondary",
  icon,
  children,
  className = "",
  type = "button",
  ...rest
}: { variant?: ButtonVariant; icon?: IconName; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} className={buttonClass(variant, className)} {...rest}>
      {icon ? <Icon name={icon} size="sm" /> : null}
      {children}
    </button>
  );
}

/** A square button with an icon only; `label` is its accessible name. */
export function IconButton({
  icon,
  label,
  variant = "ghost",
  className = "",
  type = "button",
  ...rest
}: { icon: IconName; label: string; variant?: ButtonVariant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type={type} aria-label={label} className={buttonClass(variant, `w-10 px-0 max-sm:w-11 ${className}`)} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

/** A link that looks like a button (internal links keep the chosen air). */
export function ButtonLink({
  href,
  variant = "secondary",
  icon,
  children,
  className = "",
  ...rest
}: { href: string; variant?: ButtonVariant; icon?: IconName; children: ReactNode; className?: string } & Record<string, unknown>) {
  return (
    <AppLink href={href} className={buttonClass(variant, className)} {...rest}>
      {icon ? <Icon name={icon} size="sm" /> : null}
      {children}
    </AppLink>
  );
}
