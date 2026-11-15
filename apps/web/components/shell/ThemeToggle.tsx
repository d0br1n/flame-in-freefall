"use client";

// The "Night mode" / "Day mode" switch in the sidebar. Its words and icon follow data-theme on
// <html> through CSS (the night: variant), so they are right on the first paint, before React runs.
import { applyTheme, currentTheme, otherTheme } from "@/lib/theme";
import { Icon } from "@/components/ui/Icon";

export function ThemeToggle({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      data-testid="theme-toggle"
      onClick={() => applyTheme(otherTheme(currentTheme()))}
      className={`${className} w-full cursor-pointer text-left`}
    >
      <span className="contents night:hidden">
        <Icon name="moon" />
        <span>Night mode</span>
      </span>
      <span className="hidden night:contents">
        <Icon name="sun" />
        <span>Day mode</span>
      </span>
    </button>
  );
}
