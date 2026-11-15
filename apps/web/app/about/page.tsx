import type { Metadata } from "next";
import { AppLink } from "@/components/AppLink";
import { ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { SectionCard } from "@/components/ui/Card";
import { NOTE_POINTS, PITFALLS } from "@/lib/giveBack";
import { PROVENANCE } from "@/lib/provenance";
import { PSI_DATA_NOTE_URL, PSI_HOME, REPO_URL, SI_USAGE_URL, SITE_NAME, TEAM_NAME, TEAM_PLACE } from "@/lib/site";
import type { Provenance } from "@/lib/types";

// About the data (DOB-129): what the site is, what it adds to the PSI site, who the team asked,
// where its data comes from, what it gives back (DOB-160: the PSI data pitfalls, lib/giveBack.ts),
// how its numbers are obtained, how SI was used and who built it. What
// the data cannot tell is on the Limitations page.
// Statements come from docs/00-challenge-description.md, docs/ARCHITECTURE.md, the API and
// submission/PROJECT_PAGE.md ("What is new compared with the PSI site", "Who we asked, and what we
// changed"; the outreach counts are the team's, logged in research/user-research-2026-11-14/ and
// research/buyer-replies-2026-11-14.md).
export const metadata: Metadata = { title: "About the data" };

const TEXT = "max-w-[68ch] space-y-2";

export default function AboutPage() {
  return (
    <div className="mx-auto grid w-full max-w-[60rem] gap-5 text-[16px] leading-[24px] text-ink">
      <SectionCard title="What this site is" titleId="about-what">
        <div className={TEXT}>
          <p>A fire in a spacecraft comes down to two questions: will it spread, and what puts it out?</p>
          <p>
            NASA has burned real flames in orbit to answer them. {SITE_NAME} turns those tests into answers for the cabin air
            you choose, each one traced to its NASA record.
          </p>
          <p>
            It is built for the engineers who choose the air a crew breathes on the way to the Moon and Mars, and open to
            every researcher and student who wants to see what NASA tested.
          </p>
          <p className="text-ink-2">An entry to the NASA Space Apps Challenge 2026, challenge &ldquo;Flame in Freefall&rdquo;.</p>
        </div>
      </SectionCard>

      <SectionCard title="What is new here" titleId="about-new">
        <p className="mb-3 max-w-[68ch]">
          NASA&apos;s PSI repository lets you search the investigations and download their files. {SITE_NAME} adds what a
          download cannot give you:
        </p>
        <ul className="max-w-[68ch] list-disc space-y-2 pl-5 marker:text-ink-3" data-testid="about-new-list">
          <li>
            <b className="font-semibold">One table across every test.</b> NASA publishes a separate table for each
            investigation. <AppLink href="/tests">Here they share one</AppLink>.
          </li>
          <li>
            <b className="font-semibold">A view by cabin air.</b> Set the oxygen and pressure, and see which tests ran in
            that air and which never did.
          </li>
          <li>
            <b className="font-semibold">Numbers from the flight videos.</b> Our tracker follows the flame in NASA&apos;s
            BASS-II footage (<span className="font-mono">PSI-25</span>) and measures when it ignited, how fast it spread
            and when it went out. NASA&apos;s table has no column for any of them: the answer was only in the video. <AppLink href="/spread">See Video to Data</AppLink>.
          </li>
          <li>
            <b className="font-semibold">The next experiment to fly.</b> The{" "}
            <AppLink href="/suppress">suppression test bench</AppLink> shows which gas mixtures were never flown and
            proposes the tests to fly next.
          </li>
          <li>
            <b className="font-semibold">An assistant that shows its sources.</b> Every PSI ID it cites is checked against
            the data before you see it. <AppLink href="/assistant">Ask it</AppLink>.
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Who we asked" titleId="about-asked">
        <div className={TEXT}>
          <p>
            We wrote to about 110 combustion and fire-safety researchers and engineers, most of them authors of the NASA
            papers behind these experiments, and to 14 fire labs and space station builders. 15 researchers replied in
            person.
          </p>
          <p>Their answers shaped what you see:</p>
        </div>
        <ul className="mt-2 max-w-[68ch] list-disc space-y-2 pl-5 marker:text-ink-3" data-testid="about-asked-list">
          <li>The test bench plots how every FLEX flame ended, by oxygen and added gas. A combustion researcher asked for it.</li>
          <li>Flame temperatures are shown as calculated, never as measured.</li>
          <li>Helium is flagged as the gas where temperature alone does not explain the result.</li>
          <li>
            Every limit of the data has <AppLink href="/limitations">a page of its own</AppLink>.
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Where the data comes from" titleId="about-data">
        <div className={TEXT}>
          <p>
            Every record, table and file comes from NASA&apos;s Physical Sciences Informatics (PSI) repository,{" "}
            <a href={PSI_HOME} target="_blank" rel="noopener noreferrer">
              psi.nasa.gov<span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>
          <p>
            Each investigation keeps its PSI ID, for example <span className="font-mono">PSI-69</span>. The ID sits beside
            every number, so any figure can be checked against NASA&apos;s own record.
          </p>
          <p className="text-ink-2">
            If the live data service does not answer, the site shows a saved copy and says so at the top of the page.
          </p>
          <p>
            <AppLink href="/limitations">What the data cannot tell</AppLink>
          </p>
        </div>
      </SectionCard>

      <SectionCard title="What we give back" titleId="about-give-back">
        <p className="max-w-[68ch]">
          Reading the 24 investigations, we hit problems in the PSI files that cost us time. We wrote them down so the next
          team, and NASA, can use the list. Each one can be checked on the file it names.
        </p>
        <ul className="mt-3 grid gap-3" data-testid="about-pitfalls">
          {PITFALLS.map((item) => (
            <li key={`${item.psiId}-${item.where}`} className="grid gap-x-4 gap-y-0.5 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
              <AppLink href={`/investigations/${item.psiId}`} className="font-mono text-[15px]">
                {item.psiId}
              </AppLink>
              <span className="max-w-[62ch]">
                <span className="font-semibold">{item.where}.</span> {item.text}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[68ch] text-ink-2">
          Found on the downloaded files on 12 and 15 November 2026. These are {PITFALLS.length} of the {NOTE_POINTS} points in a note we
          drafted for the PSI team, with requests for the next experiment. The note has not been sent yet.
        </p>
        <p className="mt-2">
          <a href={PSI_DATA_NOTE_URL} target="_blank" rel="noopener noreferrer">
            The full note<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </SectionCard>

      <SectionCard title="How the numbers are obtained" titleId="about-numbers">
        <p className="mb-4 max-w-[68ch]">
          Click a number in an analysis to see its test, its PSI file and how it was obtained. Each way has a badge:
        </p>
        <ul className="grid gap-3" data-testid="about-provenance">
          {(Object.keys(PROVENANCE) as Provenance[]).map((tag) => (
            <li key={tag} className="grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-4">
              <span>
                <ProvenanceBadge tag={tag} />
              </span>
              <span>{PROVENANCE[tag].meaning}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-[68ch] text-ink-2">
          &ldquo;Example data&rdquo; marks a placeholder value. &ldquo;Being measured&rdquo; marks a check that has not run
          yet. Neither is a result.
        </p>
      </SectionCard>

      <SectionCard title="How SI was used" titleId="about-si">
        <p className="mb-3 max-w-[68ch] font-semibold" data-testid="about-si-not">
          SI does not decide the numbers. The numbers and verdicts on this site are computed by scripts from NASA&apos;s PSI files, and each
          one opens its source.
        </p>
        <ul className="max-w-[68ch] list-disc space-y-2 pl-5 marker:text-ink-3">
          <li>
            Where a value was read by SI (the outcome grades of the BASS-II fabric tests, and the flame markings the tracker is checked
            against), it carries the badge &ldquo;{PROVENANCE.SI_EXTRACTED.label}&rdquo; and is never mixed with measured values.
          </li>
          <li>A language model writes the plain-words summaries of the investigations. Each one is labelled and sits next to NASA&apos;s own words.</li>
          <li>The assistant answers only from the data on this site and cites the investigation behind each answer.</li>
          <li>The analyses and the code were written with SI assistance and reviewed by the team.</li>
        </ul>
        <p className="mt-3">
          <a href={SI_USAGE_URL} target="_blank" rel="noopener noreferrer">
            Every use of SI, listed<span className="sr-only"> (opens in a new tab)</span>
          </a>
        </p>
      </SectionCard>

      <SectionCard title="Who built it" titleId="about-team">
        <div className={TEXT}>
          <p>
            {TEAM_NAME}, at the Space Apps local event in {TEAM_PLACE}, Romania.
          </p>
          <p>
            The code is open in{" "}
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
              the repository<span className="sr-only"> (opens in a new tab)</span>
            </a>
            .
          </p>
        </div>
      </SectionCard>
    </div>
  );
}
