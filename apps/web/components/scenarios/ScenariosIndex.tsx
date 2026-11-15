"use client";

// The scenarios index: two full "what happened versus burnrate" stories as large cards, then the
// quick examples, one sentence each. Numbers in the quick examples come from the API
// (lib/scenarios/catalog.ts). The card art is drawn in code (no generated images, DESIGN.md).
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { AppLink } from "@/components/AppLink";
import { Loading, SavedCopyNote } from "@/components/LoadStates";
import { PageTitle } from "@/components/shell/ShellState";
import { Card, CardTitle } from "@/components/ui/Card";
import { SourceChip } from "@/components/ui/SourceChip";
import { useApi } from "@/lib/api";
import { PRESETS_PATH } from "@/lib/air";
import { EXPLORATION_COVERAGE_PATH, moonBaseAnswer } from "@/lib/scenarios/artemis2";
import { FULL_SCENARIOS, quickSentences, type FullScenario, type QuickData } from "@/lib/scenarios/catalog";
import type { AirCoverage, AirPresets } from "@/lib/types";

export function ScenariosIndex() {
  const presets = useApi<AirPresets>(PRESETS_PATH);
  const coverage = useApi<AirCoverage>(EXPLORATION_COVERAGE_PATH);
  const moon = coverage.status === "ok" ? moonBaseAnswer(coverage.data) : null;
  const data: QuickData = {
    o2Max: presets.status === "ok" ? (presets.data.custom?.o2_max ?? null) : null,
    moon: moon ? { inside: moon.inside, stated: moon.stated, psiIds: moon.investigations.map((item) => item.psi_id) } : null,
  };
  const quick = presets.status === "loading" || coverage.status === "loading" ? [] : quickSentences(data);

  return (
    <div className="mx-auto grid w-full max-w-[64rem] gap-6">
      <PageTitle title="Scenarios" />
      <header>
        <h2 className="font-display text-[30px] leading-[36px] font-semibold tracking-[-0.02em] text-ink">What burnrate would have shown</h2>
        <p className="mt-1.5 max-w-[60ch] text-[17px] leading-[26px] text-ink-2">Real spacecraft fires, set against NASA&apos;s flame data.</p>
      </header>

      <div className="grid gap-5 md:grid-cols-2" data-testid="scenarios-full">
        {FULL_SCENARIOS.map((scenario) => (
          <BigCard key={scenario.href} scenario={scenario} />
        ))}
      </div>

      <Card data-testid="scenarios-quick">
        <CardTitle>More moments</CardTitle>
        {presets.status === "ok" ? <SavedCopyNote source={presets.source} savedAt={presets.savedAt} /> : null}
        {presets.status === "loading" || coverage.status === "loading" ? <Loading label="Loading the tested air…" rows={3} /> : null}
        <ul className="mt-4 grid gap-5">
          {quick.map(({ example, sentence, psiIds }) => (
            <li key={example.id} data-testid="scenario-quick" className="grid gap-1.5 border-l-2 border-brand pl-4">
              <p className="text-[13px] font-semibold tracking-[0.08em] text-ink-3 uppercase">
                {example.when} · {example.title}
              </p>
              <p className="text-[16px] leading-[25px] text-ink">{sentence}</p>
              <p className="flex flex-wrap items-center gap-2 text-[14px] text-ink-2">
                <a href={example.source.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-[3px] hover:decoration-solid">
                  {example.source.label}
                </a>
                {psiIds.map((id) => (
                  <SourceChip key={id} psiId={id} />
                ))}
                {example.href ? <AppLink href={example.href}>See it on burnrate</AppLink> : null}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-[14px] text-ink-2">burnrate did not exist at the time of these events. Each scenario is a thought experiment on the data NASA has published.</p>
      </Card>
    </div>
  );
}

function BigCard({ scenario }: { scenario: FullScenario }) {
  const alarm = scenario.tone === "alarm";
  return (
    <AppLink
      href={scenario.href}
      className={`group relative flex min-h-[18rem] flex-col justify-end overflow-hidden rounded-xl p-6 text-white no-underline shadow-md ring-1 transition-transform duration-300 hover:-translate-y-0.5 ${
        alarm ? "bg-[#05070f] ring-[#2a3f9e]" : "bg-[#120806] ring-[#5a1d14]"
      }`}
    >
      <CardArt alarm={alarm} />
      <div className="relative">
        <p className={`text-[13px] font-semibold tracking-[0.14em] uppercase ${alarm ? "text-[#ff9b85]" : "text-[#ffb547]"}`}>{scenario.when}</p>
        <h3 className="mt-1 font-display text-[30px] leading-[36px] font-semibold tracking-[-0.02em]">{scenario.title}</h3>
        <div className="mt-3 grid gap-2 text-[15px] leading-[22px]">
          <p>
            <span className="mr-2 rounded-sm bg-[#c4320a]/80 px-1.5 py-0.5 text-[12px] font-bold tracking-[0.08em] uppercase">Then</span>
            {scenario.happened}
          </p>
          <p>
            <span className="mr-2 rounded-sm bg-[#2448f5] px-1.5 py-0.5 text-[12px] font-bold tracking-[0.08em] uppercase">burnrate</span>
            {scenario.answer}
          </p>
        </div>
        <p className="mt-4 text-[14px] font-semibold text-[#c9d2f0] group-hover:text-white">See the versus →</p>
      </div>
    </AppLink>
  );
}

function CardArt({ alarm }: { alarm: boolean }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {alarm ? (
        <>
          <span className="absolute top-8 right-8 h-20 w-20 animate-ping rounded-full border-2 border-[#ff4a2e]" style={{ animationDuration: "2s" }} />
          <span className="absolute top-12 right-12 h-12 w-12 rounded-full bg-gradient-to-b from-[#ff6a4d] to-[#a3170a] shadow-[0_0_40px_#ff3b1f]" />
          <span className="absolute top-1/3 left-1/4 h-24 w-24 rounded-full bg-[#3b5bff]/40 blur-2xl" />
        </>
      ) : (
        <>
          <span className="absolute -bottom-10 -left-10 h-56 w-56 animate-pulse rounded-full bg-[#ff7a1a]/40 blur-3xl" />
          <span className="absolute top-8 right-10 h-16 w-10 rounded-[50%_50%_45%_45%] bg-gradient-to-t from-[#fff4d6] via-[#ffb547] to-transparent opacity-80 blur-[1px]" />
        </>
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
    </div>
  );
}
