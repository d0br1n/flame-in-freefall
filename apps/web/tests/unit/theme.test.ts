import { describe, expect, it } from "vitest";
import { otherTheme, parseTheme, resolveTheme, THEME_KEY, THEME_SCRIPT, toggleLabel } from "@/lib/theme";

describe("theme storage", () => {
  it("uses the stored choice first", () => {
    expect(resolveTheme("night", false)).toBe("night");
    expect(resolveTheme("day", true)).toBe("day");
  });

  it("follows the system preference when nothing valid is stored", () => {
    expect(resolveTheme(null, true)).toBe("night");
    expect(resolveTheme(null, false)).toBe("day");
    expect(resolveTheme("dark", true)).toBe("night");
    expect(resolveTheme(undefined, false)).toBe("day");
  });

  it("reads only the two themes", () => {
    expect(parseTheme("night")).toBe("night");
    expect(parseTheme("Night")).toBeNull();
    expect(parseTheme(1)).toBeNull();
  });

  it("toggles and names the theme it switches to", () => {
    expect(otherTheme("day")).toBe("night");
    expect(otherTheme("night")).toBe("day");
    expect(toggleLabel("day")).toBe("Night mode");
    expect(toggleLabel("night")).toBe("Day mode");
  });

  it("applies the theme before paint with the same key and the system preference", () => {
    expect(THEME_SCRIPT).toContain(JSON.stringify(THEME_KEY));
    expect(THEME_SCRIPT).toContain("prefers-color-scheme: dark");
    expect(THEME_SCRIPT).toContain('setAttribute("data-theme"');
    // It must run without throwing when storage is blocked.
    const calls: string[] = [];
    const sandbox = {
      localStorage: { getItem: () => { throw new Error("blocked"); } },
      window: { matchMedia: () => ({ matches: true }) },
      document: { documentElement: { setAttribute: (_: string, value: string) => calls.push(value) } },
    };
    new Function("localStorage", "window", "document", THEME_SCRIPT)(sandbox.localStorage, sandbox.window, sandbox.document);
    expect(calls).toEqual(["night"]);
  });
});
