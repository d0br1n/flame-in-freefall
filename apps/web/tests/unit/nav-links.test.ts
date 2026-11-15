import { describe, expect, it } from "vitest";
import { copyAirParams, withAir, isExternal } from "@/lib/links";
import { NAV, NAV_GROUPS, builtHref, currentEntry, isCurrent, navCounts, navGroup, sectionTitle, stagePage, visibleNav, type NavEntry } from "@/lib/nav";

const entry = (href: string, built = true, group: NavEntry["group"] = "start"): NavEntry => ({ href, label: href, built, group, icon: "overview" });

describe("the sidebar navigation", () => {
  it("shows only built pages, in order", () => {
    const entries: NavEntry[] = [entry("/"), entry("/spread", false), entry("/investigations", true, "explore")];
    expect(visibleNav(entries).map((item) => item.href)).toEqual(["/", "/investigations"]);
  });

  it("follows the demo path: start, the data, the analyses, about, then the tools", () => {
    expect(navGroup("start").map((item) => [item.href, item.label])).toEqual([
      ["/", "Overview"],
      ["/scenarios", "Scenarios"],
    ]);
    expect(navGroup("explore").map((item) => [item.href, item.label])).toEqual([
      ["/investigations", "Investigations"],
      ["/compare", "Compare"],
      ["/tests", "Tests"],
    ]);
    expect(navGroup("analyses").map((item) => [item.href, item.label])).toEqual([
      ["/spread", "Video to Data"],
      ["/suppress", "Suppression test bench"],
    ]);
    // The Detection page is gone (DOB-121): its investigations are a filter of Investigations.
    expect(NAV.some((item) => item.href === "/detection")).toBe(false);
    expect(navGroup("trust").map((item) => [item.href, item.label])).toEqual([
      ["/limitations", "Limitations"],
      ["/about", "About the data"],
    ]);
    expect(navGroup("tools").map((item) => item.href)).toEqual(["/assistant"]);
    expect(NAV.every((item) => item.built)).toBe(true);
    expect(NAV_GROUPS.map((group) => group.label)).toEqual(["Start", "Data", "Analyses", "About", "Tools"]);
  });

  it("puts a count beside the stages and the data, never beside Overview or the tools", () => {
    expect(NAV.filter((item) => item.count).map((item) => item.count)).toEqual(["investigations", "tests", "spread", "suppress"]);
  });

  it("counts investigations per stage and the tests from the API, and nothing before it answers", () => {
    const items = [{ stage: "spread" }, { stage: "spread" }, { stage: "detect" }, { stage: "suppress" }, { stage: null }] as const;
    expect(navCounts(items, 2001)).toEqual({ investigations: 5, spread: 2, detect: 1, suppress: 1, tests: 2001 });
    expect(navCounts(null, null)).toEqual({});
    expect(navCounts(null, 7)).toEqual({ tests: 7 });
    expect(navCounts([], Number.NaN)).toEqual({ investigations: 0, spread: 0, detect: 0, suppress: 0 });
  });

  it("returns a stage page only when it is built", () => {
    expect(builtHref("/about")).toBe("/about");
    expect(builtHref("/nowhere")).toBeNull();
    expect(builtHref(null)).toBeNull();
    expect(stagePage("spread", [entry("/spread", false)])).toBeNull();
    expect(stagePage("spread")).toBe("/spread");
    expect(stagePage("detect")).toBe("/investigations?pillar=detection");
    expect(builtHref("/investigations?pillar=detection#top")).toBe("/investigations?pillar=detection#top");
    expect(stagePage("suppress")).toBe("/suppress");
    expect(stagePage(null)).toBeNull();
  });

  it("marks the current page", () => {
    expect(isCurrent("/", "/")).toBe(true);
    expect(isCurrent("/", "/investigations")).toBe(false);
    expect(isCurrent("/investigations", "/investigations/PSI-69")).toBe(true);
    expect(isCurrent("/investigations", "/investigationsx")).toBe(false);
    expect(isCurrent("/investigations", null)).toBe(false);
  });

  it("titles the top bar with the section's name", () => {
    expect(sectionTitle("/")).toBe("Overview");
    expect(sectionTitle("/investigations/PSI-69")).toBe("Investigations");
    expect(sectionTitle("/detection")).toBeNull();
    expect(sectionTitle("/spread")).toBe("Video to Data");
    expect(sectionTitle("/suppress")).toBe("Suppression test bench");
    expect(sectionTitle("/about")).toBe("About the data");
    expect(sectionTitle("/nowhere")).toBeNull();
    expect(currentEntry("/suppress")?.icon).toBe("suppress");
  });
});

describe("withAir", () => {
  it("carries air from the current URL and drops everything else", () => {
    expect(withAir("/investigations", "?air=exploration&pillar=detection&fuel=solid")).toBe("/investigations?air=exploration");
    expect(withAir("/investigations/PSI-69", new URLSearchParams("air=station"))).toBe("/investigations/PSI-69?air=station");
  });

  it("leaves the link alone when there is no air", () => {
    expect(withAir("/investigations", "")).toBe("/investigations");
    expect(withAir("/investigations", null)).toBe("/investigations");
    expect(withAir("/investigations", "?pillar=detection")).toBe("/investigations");
    expect(withAir("/investigations", "?air=")).toBe("/investigations");
  });

  it("keeps parameters passed explicitly, and an explicit air wins", () => {
    expect(withAir("/investigations?pillar=detection", "?air=station&fuel=solid")).toBe(
      "/investigations?pillar=detection&air=station",
    );
    expect(withAir("/tests?air=exploration", "?air=station")).toBe("/tests?air=exploration");
  });

  it("keeps the hash after the query", () => {
    expect(withAir("/investigations/PSI-69#holdings", "?air=station")).toBe("/investigations/PSI-69?air=station#holdings");
  });

  it("never touches external links", () => {
    expect(withAir("https://psi.nasa.gov/physci/repo", "?air=station")).toBe("https://psi.nasa.gov/physci/repo");
    expect(isExternal("mailto:a@b.c")).toBe(true);
    expect(isExternal("//example.org")).toBe(true);
    expect(isExternal("/investigations")).toBe(false);
  });

  it("encodes values safely", () => {
    expect(withAir("/", "?air=a%20b%26c")).toBe("/?air=a+b%26c");
  });

  it("carries a custom air whole: air, o2 and p travel together", () => {
    expect(withAir("/tests", "?air=custom&o2=0.24&p=80&psi_id=PSI-69")).toBe("/tests?air=custom&o2=0.24&p=80");
    expect(withAir("/tests?air=station", "?air=custom&o2=0.24&p=80")).toBe("/tests?air=station");
    // o2 and p alone are not an air: nothing is carried.
    expect(withAir("/tests", "?o2=0.24&p=80")).toBe("/tests");
    const out = new URLSearchParams();
    copyAirParams("?air=custom&o2=0.3&p=&x=1", out);
    expect(out.toString()).toBe("air=custom&o2=0.3");
  });
});
