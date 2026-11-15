// The scenarios index: the two full "what happened versus what burnrate would have shown" pages,
// and the quick examples, one sentence each. The incidents are the ones the challenge page cites
// (docs/00-challenge-description.md), plus the Moon-base air it names. Every number in a quick
// example is read from the API (the tested range from GET /air/presets, the Moon-base count from
// GET /air/coverage); the history comes from the challenge's resource pages, each linked.
// Pure, unit tested (tests/unit/scenarios-catalog.test.ts).
// Code generated with SI assistance (Claude Code), reviewed by the team.

export interface FullScenario {
  href: string;
  when: string;
  title: string;
  happened: string;
  answer: string;
  tone: "ember" | "alarm";
}

export const FULL_SCENARIOS: readonly FullScenario[] = [
  {
    href: "/scenarios/artemis-2",
    when: "April 2026",
    title: "Artemis II",
    happened: "A fire alarm goes off 80,000 miles from home.",
    answer: "What NASA's flames in orbit did when the fan slowed.",
    tone: "alarm",
  },
  {
    href: "/scenarios/apollo-1",
    when: "January 1967",
    title: "Apollo 1",
    happened: "A cabin of pure oxygen catches fire on the launch pad.",
    answer: "Never tested in this air.",
    tone: "ember",
  },
];

/** What a quick example needs from the API. */
export interface QuickData {
  /** Highest oxygen of any catalogued flame test, as a mole fraction (GET /air/presets, `custom.o2_max`). */
  o2Max: number | null;
  /** Suppression tests inside the Moon-base air, and tests that state their air (GET /air/coverage?air=exploration). */
  moon: { inside: number; stated: number; psiIds: string[] } | null;
}

export interface QuickExample {
  id: string;
  when: string;
  title: string;
  /** The one sentence: how burnrate would have changed the picture. Null when the data it needs is missing. */
  sentence: (data: QuickData) => string | null;
  source: { label: string; url: string };
  /** A page of this site that shows the answer, if any. */
  href?: string;
  psiIds: (data: QuickData) => string[];
}

function pct(fraction: number): string {
  return String(Number((fraction * 100).toFixed(1)));
}

export const QUICK_EXAMPLES: readonly QuickExample[] = [
  {
    id: "apollo-13",
    when: "April 1970",
    title: "Apollo 13, the oxygen tank",
    sentence: ({ o2Max }) =>
      o2Max === null
        ? null
        : `Heat-damaged wiring sat inside a tank of pure oxygen, and burnrate would have flagged it in red: no NASA flame test in the PSI catalog goes above ${pct(o2Max)}% oxygen.`,
    source: { label: "NASA lessons learned, Apollo 13", url: "https://sma.nasa.gov/sma-disciplines/accllp/apollo-13" },
    psiIds: () => [],
  },
  {
    id: "mir-1997",
    when: "February 1997",
    title: "Mir, the oxygen generator",
    sentence: () =>
      "A flame fed by its own oxygen burned for minutes, and burnrate would have warned that NASA's suppression tests (FLEX) work by changing the air around a flame, which a fire that makes its own oxygen ignores.",
    source: { label: "NASA history, Mir fire", url: "https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/" },
    href: "/suppress",
    psiIds: () => ["PSI-69"],
  },
  {
    id: "moon-base",
    when: "Next",
    title: "A Moon base",
    sentence: ({ moon }) =>
      moon === null
        ? null
        : `Moon bases are expected to breathe 30% oxygen or more, and burnrate already shows that ${moon.inside} of ${moon.stated} suppression tests ran in that air, so the next fire test knows where to go.`,
    source: { label: "Challenge page, Flame in Freefall", url: "https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/" },
    href: "/?air=exploration",
    psiIds: ({ moon }) => moon?.psiIds ?? [],
  },
];

/** The quick examples that have the data they need, with their sentence. Pure. */
export function quickSentences(data: QuickData): { example: QuickExample; sentence: string; psiIds: string[] }[] {
  return QUICK_EXAMPLES.flatMap((example) => {
    const sentence = example.sentence(data);
    return sentence ? [{ example, sentence, psiIds: example.psiIds(data) }] : [];
  });
}
