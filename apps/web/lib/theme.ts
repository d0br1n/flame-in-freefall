// Day and night theme (DESIGN.md, "Theme"). The choice is stored in localStorage; with nothing
// stored, the operating system's preference (prefers-color-scheme) decides. The theme is applied
// as data-theme on <html> before the first paint by THEME_SCRIPT (app/layout.tsx), so the page
// never flashes the wrong colours. Pure, unit tested (tests/unit/theme.test.ts).

export type Theme = "day" | "night";

export const THEME_KEY = "burnrate-theme";

/** A stored value, if it is a theme. Anything else counts as "nothing stored". */
export function parseTheme(value: unknown): Theme | null {
  return value === "day" || value === "night" ? value : null;
}

/** The theme to show: the stored choice, else the system preference. */
export function resolveTheme(stored: unknown, prefersDark: boolean): Theme {
  return parseTheme(stored) ?? (prefersDark ? "night" : "day");
}

export function otherTheme(theme: Theme): Theme {
  return theme === "night" ? "day" : "night";
}

/** The words on the toggle: it names the theme it switches to. */
export function toggleLabel(current: Theme): string {
  return current === "night" ? "Day mode" : "Night mode";
}

/**
 * Runs in <head> before the body is painted. Kept tiny and self-contained (no imports): it must
 * not throw, also when storage is blocked.
 */
export const THEME_SCRIPT = `(function(){try{var s=null;try{s=localStorage.getItem(${JSON.stringify(THEME_KEY)})}catch(e){}var t=s==="day"||s==="night"?s:(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches?"night":"day");document.documentElement.setAttribute("data-theme",t)}catch(e){}})();`;

/** Read the theme now on <html>. Client only. */
export function currentTheme(): Theme {
  if (typeof document === "undefined") return "day";
  return parseTheme(document.documentElement.getAttribute("data-theme")) ?? "day";
}

/** Apply and store a theme. Storage may be blocked: the page still switches. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // private mode or blocked storage: the switch still works for this page view
  }
}
