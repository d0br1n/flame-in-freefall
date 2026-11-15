"use client";

// The landing hero (redesign): in ten seconds, what burnrate is, what it is built on and where to
// go next. The three counts are read from the API (the catalog and the tests table), never typed.
// Copy rules (DESIGN.md, "Copy"): one short sentence, labels over sentences.
// The flame sphere is drawn in CSS (a microgravity flame burns as a ball, PSI-23 ACME s-Flame); it
// is not an image of a NASA flame and carries no NASA mark. The four steps are the demo path. The
// page's one h1 stays the section name in the top bar, so the headline is an h2.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { AppLink } from "@/components/AppLink";
import { CountUp } from "@/components/motion/CountUp";
import { Icon } from "@/components/ui/Icon";
import { useApi } from "@/lib/api";
import { COMPARE_STARTS } from "@/lib/compareDefaults.mjs";
import { SITE_TAGLINE } from "@/lib/site";
import type { InvestigationList, TestsResponse } from "@/lib/types";

const STEPS = [
  { href: "/investigations", title: "Explore the investigations", text: "Every NASA combustion investigation in one place, ranked for your cabin air." },
  { href: `/compare?ids=${COMPARE_STARTS[0].ids.join(",")}`, title: "Compare investigations", text: "Up to four, side by side. The differences show at a glance." },
  { href: "/suppress#mixture", title: "Try the suppression test bench", text: "Pick the fuel, the oxygen and an added gas. See how the flame ends." },
  { href: "/limitations", title: "Read the limits", text: "Every gap in the data, stated up front." },
] as const;

export function Hero() {
  const catalog = useApi<InvestigationList>("/catalog/investigations");
  const tests = useApi<TestsResponse>("/catalog/tests?limit=1");
  const items = catalog.status === "ok" ? catalog.data.items : null;
  const tables = items ? items.reduce((sum, item) => sum + item.table_count, 0) : null;

  return (
    <section
      aria-labelledby="hero-title"
      data-testid="hero"
      className="relative isolate overflow-hidden rounded-xl bg-hero text-hero-ink shadow-pop"
      style={{ backgroundImage: "radial-gradient(120% 140% at 85% 20%, var(--hero-2) 0%, var(--hero) 60%)" }}
    >
      {/* The flame sphere: blue core, cyan rim, soft halo. Decorative. */}
      <div aria-hidden="true" className="pointer-events-none absolute top-1/2 right-[-6rem] -z-10 hidden size-[34rem] -translate-y-1/2 md:block xl:right-[2%]">
        <div
          className="flame-orb absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 50%, var(--halo-core) 0%, var(--halo-blue) 22%, color-mix(in oklab, var(--halo-blue) 55%, transparent) 38%, color-mix(in oklab, var(--halo-cyan) 30%, transparent) 52%, transparent 70%)",
            filter: "blur(2px)",
          }}
        />
        <div className="absolute inset-[18%] rounded-full border border-white/10" />
        <div className="absolute inset-[6%] rounded-full border border-white/5" />
      </div>

      <div className="reveal grid gap-8 px-6 py-10 sm:px-10 sm:py-14 xl:px-14 xl:py-16">
        <p className="text-[14px] font-semibold text-hero-ink-2">NASA Space Apps 2026 · Flame in Freefall</p>
        <h2 id="hero-title" className="max-w-[20ch] font-display text-[38px] leading-[42px] font-semibold tracking-[-0.03em] text-hero-ink sm:text-[52px] sm:leading-[56px] 2xl:text-[64px] 2xl:leading-[68px]">
          What NASA&apos;s flames in freefall say about a fire in your spacecraft.
        </h2>
        <p className="max-w-[54ch] text-[18px] leading-[28px] text-hero-ink-2 sm:text-[20px] sm:leading-[31px]">
          Will it spread, and what puts it out? {SITE_TAGLINE}. Built for the engineers who choose the air a crew breathes
          on the way to the Moon and Mars.
        </p>

        <dl className="grid max-w-[48rem] grid-cols-3 gap-4 sm:gap-8" data-testid="hero-counts">
          <HeroCount label="NASA combustion investigations" value={items ? items.length : null} />
          <HeroCount label="tests, down to the file and row" value={tests.status === "ok" ? tests.data.total : null} />
          <HeroCount label="NASA tables, merged into one" value={tables} />
        </dl>

        <ol className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4" aria-label="Where to go next" data-testid="hero-steps">
          {STEPS.map((step, index) => (
            <li key={step.href}>
              <AppLink
                href={step.href}
                className="group flex h-full flex-col gap-2 rounded-lg border border-white/12 bg-white/[0.06] p-4 text-hero-ink no-underline backdrop-blur-sm transition-[transform,background-color,border-color] duration-200 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/[0.11] hover:text-hero-ink focus-visible:outline-white"
              >
                <span className="flex items-center gap-3">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 font-mono text-[14px] font-semibold">
                    {index + 1}
                  </span>
                  <span className="font-display text-[18px] leading-[23px] font-semibold">{step.title}</span>
                  <Icon name="arrow-right" className="ml-auto size-4 opacity-60 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                </span>
                <span className="text-[15px] leading-[22px] text-hero-ink-2">{step.text}</span>
              </AppLink>
            </li>
          ))}
        </ol>
        <p className="text-[13px] text-hero-ink-2">
          Live counts from our catalog of NASA&apos;s Physical Sciences Informatics (PSI) repository.
        </p>
      </div>
    </section>
  );
}

function HeroCount({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0 border-l-2 border-white/20 pl-3 sm:pl-4">
      <dd className="font-display text-[34px] leading-[38px] font-semibold tracking-[-0.02em] text-hero-ink sm:text-[48px] sm:leading-[52px]">
        {value === null ? <span className="text-hero-ink-2">…</span> : <CountUp value={value} />}
      </dd>
      <dt className="mt-1 text-[14px] leading-[18px] text-hero-ink-2 sm:text-[14.5px] sm:leading-[20px]">{label}</dt>
    </div>
  );
}
