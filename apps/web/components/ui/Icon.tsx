// The icon set: 24-unit line icons drawn for burnrate (paths from the approved mockup,
// design/mockup-2026-11-14/app.html), one stroke weight (1.6), round caps and joins. Decorative
// only: the words beside them carry the meaning, so every icon is aria-hidden.
import type { ReactNode } from "react";

export type IconName =
  | "overview"
  | "scenarios"
  | "spread"
  | "detect"
  | "suppress"
  | "investigations"
  | "compare"
  | "limits"
  | "tests"
  | "assistant"
  | "moon"
  | "sun"
  | "air"
  | "chevron-down"
  | "search"
  | "close"
  | "menu"
  | "arrow-up-right"
  | "arrow-right"
  | "info"
  | "about";

const PATHS: Record<IconName, ReactNode> = {
  scenarios: (
    <>
      <path d="M12 3.5c1.6 2.4 4.5 4.6 4.5 8.6a4.5 4.5 0 0 1-9 0c0-1.9.9-3.3 2-4.5.3 1.3 1 2.1 1.8 2.4-.3-2.3.1-4.4.7-6.5z" />
      <path d="M4 20.5h16" />
    </>
  ),
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  spread: (
    <>
      <circle cx="6" cy="12" r="2.2" />
      <path d="M11 7.5a6 6 0 0 1 0 9M15 4.5a10 10 0 0 1 0 15" />
    </>
  ),
  detect: (
    <>
      <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  suppress: <path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z" />,
  investigations: (
    <>
      <path d="M12 3.5 3.5 8l8.5 4.5L20.5 8 12 3.5z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5M3.5 16.5 12 21l8.5-4.5" />
    </>
  ),
  compare: (
    <>
      <rect x="3.5" y="4.5" width="7" height="15" rx="2" />
      <rect x="13.5" y="4.5" width="7" height="15" rx="2" />
      <path d="M6 9h2M6 12.5h2M16 9h2M16 12.5h2" />
    </>
  ),
  limits: (
    <>
      <path d="M12 3.8 21 19.5H3z" />
      <path d="M12 10v4.2M12 16.9v.1" />
    </>
  ),
  tests: (
    <>
      <path d="M9 3.5h6M10 3.5v6l-5 8.6A2 2 0 0 0 6.7 21h10.6a2 2 0 0 0 1.7-2.9l-5-8.6v-6" />
      <path d="M7.6 15h8.8" />
    </>
  ),
  assistant: (
    <>
      <path d="M4 5h16v11H9.5L4 20.5V5z" />
      <path d="M9 10.5h.01M12 10.5h.01M15 10.5h.01" strokeWidth="2.4" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </>
  ),
  air: <path d="M3 8h11a3 3 0 1 0-3-3M3 16h15a3 3 0 1 1-3 3M3 12h8" />,
  "chevron-down": <path d="m7 10 5 5 5-5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  "arrow-up-right": <path d="M7 17 17 7M9 7h8v8" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
};

/** A line icon, 20 px by default (16 px with size="sm"). */
export function Icon({ name, size = "md", className = "", strokeWidth }: { name: IconName; size?: "xs" | "sm" | "md"; className?: string; strokeWidth?: number }) {
  const px = size === "xs" ? 12 : size === "sm" ? 16 : 20;
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth ?? (size === "xs" ? 2 : 1.6)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  );
}
