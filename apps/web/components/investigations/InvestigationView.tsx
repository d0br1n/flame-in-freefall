"use client";

// One investigation, from GET /catalog/investigations/{psi_id}. Every value on this page comes from
// that answer; the source of each value sits under it (SourceNote). The header stays on top; the
// rest is split into sections, one shown at a time (DOB-123, components/ui/SectionNav.tsx). What
// the data cannot tell lives on the Limitations page only (DOB-120): the header links to it.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useState, type ReactNode } from "react";
import { AppLink } from "@/components/AppLink";
import { Loading, Notice, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { QuotedText } from "@/components/ShowMore";
import { MarginRow, SourceNote, Ticked } from "@/components/SourceNote";
import { PageTitle } from "@/components/shell/ShellState";
import { Callout } from "@/components/ui/Callout";
import { Card, CardTitle } from "@/components/ui/Card";
import { SectionNav, type SectionItem } from "@/components/ui/SectionNav";
import { StatusPill } from "@/components/ui/StatusPill";
import { useApi } from "@/lib/api";
import { FUEL_LABEL, PILLAR_LABEL } from "@/lib/filters";
import { fileGap, formatBytes, formatCount, plural } from "@/lib/format";
import { stagePage } from "@/lib/nav";
import type { InvestigationDetail, InvestigationList } from "@/lib/types";

const PSI_TEXT_FIELDS = [
  { key: "objective", label: "Objective" },
  { key: "approach", label: "Approach" },
  { key: "hypothesis", label: "Hypothesis" },
  { key: "research_impacts", label: "Research impacts" },
] as const;

const PUBLICATIONS_SHOWN = 10;

export function InvestigationView({ psiId }: { psiId: string }) {
  const detail = useApi<InvestigationDetail>(`/catalog/investigations/${encodeURIComponent(psiId)}`);

  if (detail.status === "loading") {
    return (
      <div className="mx-auto w-full max-w-[76rem]">
        <PageTitle title={psiId} />
        <BackLink />
        <Loading label="Loading this investigation…" rows={4} />
      </div>
    );
  }

  if (detail.status === "error") {
    return (
      <div className="mx-auto w-full max-w-[76rem]">
        <BackLink />
        {detail.error.kind === "not_found" ? (
          <>
            <PageTitle title="No investigation with this ID" />
            <Notice title="This ID is not in the catalog" testId="not-found">
              <p>
                The catalog has no investigation <span className="font-mono">{psiId}</span>. The ID may be mistyped.
              </p>
              <p>
                <AppLink href="/investigations">See the list of investigations</AppLink>
              </p>
            </Notice>
          </>
        ) : (
          <>
            <PageTitle title={psiId} />
            <Unreachable error={detail.error} onRetry={detail.retry} what="this investigation" />
          </>
        )}
      </div>
    );
  }

  const data = detail.data;
  // The old fragments (#holdings, #psi-text) still open their section.
  const sections: SectionItem[] = [
    {
      id: "summary",
      label: "Summary",
      aliases: ["measured"],
      content: (
        <>
          <Summary data={data} />
          <Measured data={data} />
        </>
      ),
    },
    { id: "nasa", label: "NASA's description", aliases: ["psi-text"], content: <PsiText data={data} /> },
    {
      id: "files",
      label: "Data and files",
      // The number of files to download, as in the table caption. Left out at zero: the section
      // then still holds PSI's listed size and the experimental tables.
      count: data.files.count > 0 ? formatCount(data.files.count) : null,
      aliases: ["holdings"],
      content: <Holdings data={data} />,
    },
    { id: "conditions", label: "Conditions", content: <Conditions data={data} /> },
    { id: "publications", label: "Publications", count: formatCount(data.publications.length), content: <Publications data={data} /> },
    {
      id: "related",
      label: "Related",
      aliases: ["analyses"],
      content: (
        <>
          <Related ids={data.related} />
          <Analyses engines={data.engines} />
        </>
      ),
    },
  ];
  return (
    <div className="mx-auto w-full max-w-[76rem]">
      <PageTitle title={data.title} />
      <BackLink />
      <SavedCopyNote source={detail.source} savedAt={detail.savedAt} />
      <Header data={data} />
      <SectionNav sections={sections} label="Sections of this investigation" className="mt-5" />
    </div>
  );
}

function BackLink() {
  return (
    <p className="text-[14px]">
      <AppLink href="/investigations" className="inline-flex min-h-8 items-center font-semibold no-underline hover:underline">
        <span aria-hidden="true">←&nbsp;</span>All investigations
      </AppLink>
    </p>
  );
}

/** One block of a section: a card, with a title only where the section holds two blocks. */
function Block({ title, id, children }: { title?: string; id?: string; children: ReactNode }) {
  return (
    <Card as="section" aria-labelledby={title ? id : undefined} className="text-[15px] leading-[23px] text-ink">
      {title ? (
        <CardTitle id={id} className="mb-3">
          {title}
        </CardTitle>
      ) : null}
      {children}
    </Card>
  );
}

function Header({ data }: { data: InvestigationDetail }) {
  const tags = [
    { label: "Fire safety pillar", value: PILLAR_LABEL[data.tags.pillar.value] ?? data.tags.pillar.value, source: data.tags.pillar.source },
    { label: "What burned", value: FUEL_LABEL[data.tags.fuel_phase.value] ?? data.tags.fuel_phase.value, source: data.tags.fuel_phase.source },
    { label: "Hardware", value: data.hardware_group_label, source: data.tags.hardware_group.source },
  ];
  return (
    <Card as="header" className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-7 items-center rounded-sm border border-line bg-surface-sunk px-2 font-mono text-[14px] font-medium text-ink">
              {data.psi_id}
            </span>
            {data.acronym ? <span className="font-display text-[18px] font-semibold text-ink">{data.acronym}</span> : null}
          </p>
          {data.title.length > 36 ? (
            <p className="mt-2 max-w-[60ch] font-display text-[20px] leading-[26px] font-semibold text-ink">{data.title}</p>
          ) : null}
          <p className="mt-1.5 text-[15px] leading-[22px] text-ink-2">
            {data.ground_investigation ? "Ground investigation" : "Flight investigation"}
            {data.psi_sub_area ? `, PSI research area: ${data.psi_sub_area}` : ""}
          </p>
        </div>
        <p className="flex flex-wrap items-center gap-2">
          <a href={data.psi_url} target="_blank" rel="noopener noreferrer" className="btn btn-primary px-5">
            Open this record on psi.nasa.gov<span className="sr-only"> (opens in a new tab)</span>
          </a>
          <AppLink href={`/limitations#${data.psi_id}`} className="btn btn-ghost">
            Limits of this data
          </AppLink>
        </p>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-line pt-4 md:grid-cols-3">
        {tags.map((tag) => (
          <div key={tag.label} className="min-w-0">
            <dt className="text-[13px] leading-[18px] font-medium text-ink-3">{tag.label}</dt>
            <dd className="text-[15px] leading-[22px] font-semibold text-ink">{tag.value}</dd>
            <dd className="mt-0.5">
              <SourceNote>
                <Ticked text={tag.source} />
              </SourceNote>
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function Summary({ data }: { data: InvestigationDetail }) {
  return (
    <Block title="In plain words" id="inv-plain">
      {data.summary_plain ? (
        <MarginRow
          className="gap-y-2"
          note={
            <SourceNote label="SI-written summary">
              Written by a language model{data.summary_written_by ? ` (${data.summary_written_by})` : ""}.
            </SourceNote>
          }
        >
          <p className="max-w-[70ch] text-[16px] leading-[26px]">{data.summary_plain}</p>
        </MarginRow>
      ) : (
        <p className="text-ink-2">No plain summary yet.</p>
      )}
    </Block>
  );
}

function PsiText({ data }: { data: InvestigationDetail }) {
  const fields = PSI_TEXT_FIELDS.filter(({ key }) => data.psi_text[key]);
  if (fields.length === 0) {
    return (
      <Block>
        <p className="text-ink-2">The PSI record has no description text.</p>
      </Block>
    );
  }
  return (
    <Block>
      <p className="mb-5 text-ink-2">Text of the NASA PSI record, copied unchanged.</p>
      <div className="space-y-6">
        {fields.map(({ key, label }) => (
          <MarginRow
            key={key}
            note={
              <SourceNote>
                PSI record field <code className="font-mono">{key}</code>
              </SourceNote>
            }
          >
            <h2 className="mb-1.5 text-[16px] font-semibold text-ink">{label}</h2>
            <QuotedText text={data.psi_text[key] as string} />
          </MarginRow>
        ))}
      </div>
    </Block>
  );
}

function Measured({ data }: { data: InvestigationDetail }) {
  const values = data.tags.measurements.value;
  return (
    <Block title="What was measured" id="inv-measured">
      <MarginRow className="gap-y-2" note={<SourceNote><Ticked text={data.tags.measurements.source} /></SourceNote>}>
        {values.length > 0 ? (
          <ul className="max-w-[70ch] list-disc space-y-1 pl-5">
            {values.map((value) => (
              <li key={value}>{value}</li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-2">No measurement is named in the record.</p>
        )}
      </MarginRow>
    </Block>
  );
}

function GapSentence({ files, tables }: { files: InvestigationDetail["files"]; tables: number }) {
  const gap = fileGap(files.bytes, files.listed_bytes);
  const besides = tables > 0 ? ` besides its ${tables === 1 ? "experimental table" : `${tables} experimental tables`}` : "";
  switch (gap.kind) {
    case "not_listed":
      return <p>PSI does not list a total size for this record.</p>;
    case "none_offered":
      return (
        <Callout tone="warn">
          <p>
            PSI lists <strong className="tabular-nums">{formatBytes(gap.listed)}</strong> for this record, but offers{" "}
            <strong>no files to download</strong>
            {besides}.
          </p>
        </Callout>
      );
    case "partial":
      return (
        <Callout tone="warn">
          <p>
            PSI lists <strong className="tabular-nums">{formatBytes(gap.listed)}</strong> for this record. The files to
            download add up to <strong className="tabular-nums">{formatBytes(gap.offered)}</strong>, which is {gap.percent}{" "}
            of it.
          </p>
        </Callout>
      );
    case "complete":
      return (
        <p>
          The files to download add up to <span className="tabular-nums">{formatBytes(gap.offered)}</span>. PSI lists{" "}
          <span className="tabular-nums">{formatBytes(gap.listed)}</span> for this record.
        </p>
      );
  }
}

function Holdings({ data }: { data: InvestigationDetail }) {
  const { files } = data;
  return (
    <Block>
      <MarginRow
        className="gap-y-3"
        note={
          <SourceNote>
            The file list of the PSI record. The listed size is PSI&apos;s total for the record. 1 GB = 1,000,000,000
            bytes.
          </SourceNote>
        }
      >
        <div className="max-w-[70ch] space-y-5">
          <GapSentence files={files} tables={files.tables.length} />

          <table className="w-full border-collapse bg-surface text-[15px]">
            <caption className="mb-2 text-left text-[16px] font-semibold text-ink">
              Files to download: {plural(files.count, "file")}, {formatBytes(files.bytes)}
            </caption>
            <thead className="border-b border-line bg-surface-sunk text-left text-[14px] text-ink-2">
              <tr>
                <th scope="col" className="border-b border-line px-3 py-2 font-semibold">Category in PSI</th>
                <th scope="col" className="border-b border-line px-3 py-2 text-right font-semibold">Files</th>
                <th scope="col" className="border-b border-line px-3 py-2 text-right font-semibold">Size</th>
              </tr>
            </thead>
            <tbody>
              {files.by_category.length === 0 ? (
                <tr>
                  <td colSpan={3} className="border-b border-line px-3 py-2 text-ink-2">
                    No downloadable files.
                  </td>
                </tr>
              ) : (
                files.by_category.map((group) => (
                  <tr key={group.category}>
                    <td className="border-b border-line px-3 py-2">{group.category}</td>
                    <td className="border-b border-line px-3 py-2 text-right tabular-nums">{formatCount(group.count)}</td>
                    <td className="border-b border-line px-3 py-2 text-right tabular-nums">{formatBytes(group.bytes)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div>
            <h2 className="mb-1.5 text-[16px] font-semibold text-ink">Experimental tables</h2>
            {files.tables.length === 0 ? (
              <p className="text-ink-2">This record has no experimental table.</p>
            ) : (
              <ul className="border-t border-line">
                {files.tables.map((table) => (
                  <li key={table.file_name} className="flex flex-wrap justify-between gap-x-4 border-b border-line py-1.5">
                    <span className="min-w-0 break-all font-mono text-[14px]">{table.file_name}</span>
                    <span className="tabular-nums text-ink-2">{formatBytes(table.bytes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </MarginRow>
    </Block>
  );
}

function Links({ text }: { text: string }) {
  const parts = text.split(/,\s+/).map((part) => part.trim()).filter(Boolean);
  return (
    <ul className="space-y-0.5">
      {parts.map((part) => (
        <li key={part} className="break-all">
          {/^https?:\/\//.test(part) ? (
            <a href={part} target="_blank" rel="noopener noreferrer">
              {part}
            </a>
          ) : (
            part
          )}
        </li>
      ))}
    </ul>
  );
}

function Conditions({ data }: { data: InvestigationDetail }) {
  const c = data.conditions;
  const rows: { label: string; value: ReactNode }[] = [
    { label: "Hardware", value: c.hardware },
    { label: "Hardware links", value: c.hardware_link ? <Links text={c.hardware_link} /> : null },
    { label: "Flight program", value: c.flight_program },
    { label: "Managing center", value: c.managing_center },
    { label: "Start date", value: c.start_date },
    { label: "End date", value: c.end_date },
    { label: "Released in PSI", value: c.release_date },
    {
      label: "Licence",
      value:
        data.licence.name || data.licence.id ? (
          data.licence.link ? (
            <a href={data.licence.link} target="_blank" rel="noopener noreferrer">
              {data.licence.name ?? data.licence.id}
            </a>
          ) : (
            data.licence.name ?? data.licence.id
          )
        ) : null,
    },
    {
      label: "DOI",
      value: data.doi ? (
        <a href={`https://doi.org/${data.doi}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[14px]">
          {data.doi}
        </a>
      ) : null,
    },
  ];
  return (
    <Block>
      <MarginRow className="gap-y-3" note={<SourceNote>As written in the PSI record. Dates are in PSI&apos;s format.</SourceNote>}>
        <dl className="max-w-[70ch] border-t border-line">
          {rows.map((row) => (
            <div key={row.label} className="grid gap-x-4 border-b border-line py-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <dt className="text-ink-2">{row.label}</dt>
              <dd className="min-w-0">{row.value ?? <span className="text-ink-2">Not stated in the record</span>}</dd>
            </div>
          ))}
        </dl>
      </MarginRow>
    </Block>
  );
}

function Publications({ data }: { data: InvestigationDetail }) {
  const [all, setAll] = useState(false);
  const items = data.publications;
  const shown = all ? items : items.slice(0, PUBLICATIONS_SHOWN);
  return (
    <Block>
      {items.length === 0 ? (
        <p className="text-ink-2">The PSI record lists no publication.</p>
      ) : (
        <>
          <p className="mb-4 text-ink-2">The PSI record lists {plural(items.length, "publication")}.</p>
          <ol className="max-w-[70ch] space-y-3">
            {shown.map((pub, index) => (
              <li key={`${index}-${pub.title}`}>
                <p className="font-medium leading-snug">{pub.title}</p>
                {pub.authors ? <p className="text-[14px] leading-[21px] text-ink-2">{pub.authors}</p> : null}
                {pub.doi ? (
                  <p className="text-[14px] leading-[21px]">
                    <a href={`https://doi.org/${pub.doi}`} target="_blank" rel="noopener noreferrer" className="break-all font-mono">
                      doi:{pub.doi}
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
          {items.length > PUBLICATIONS_SHOWN ? (
            <button type="button" aria-expanded={all} onClick={() => setAll((value) => !value)} className="btn btn-secondary mt-4">
              {all ? `Show the first ${PUBLICATIONS_SHOWN}` : `Show all ${formatCount(items.length)} publications`}
            </button>
          ) : null}
        </>
      )}
    </Block>
  );
}

function Related({ ids }: { ids: string[] }) {
  const list = useApi<InvestigationList>("/catalog/investigations");
  const byId = new Map(list.status === "ok" ? list.data.items.map((item) => [item.psi_id, item]) : []);
  return (
    <Block title="Related investigations" id="inv-related">
      <MarginRow className="gap-y-2" note={<SourceNote>Links between records made by PSI.</SourceNote>}>
        {ids.length === 0 ? (
          <p className="text-ink-2">The PSI record links no related investigation.</p>
        ) : (
          <ul className="max-w-[70ch] space-y-1">
            {ids.map((id) => {
              const item = byId.get(id);
              return (
                <li key={id}>
                  <AppLink href={`/investigations/${id}`}>
                    <span className="font-mono text-[14px]">{id}</span>
                    {item ? ` ${item.acronym ? `${item.acronym}: ` : ""}${item.title}` : ""}
                  </AppLink>
                </li>
              );
            })}
          </ul>
        )}
      </MarginRow>
    </Block>
  );
}

function Analyses({ engines }: { engines: InvestigationDetail["engines"] }) {
  return (
    <Block title="Analyses that use this record" id="inv-analyses">
      {engines.length === 0 ? (
        <p className="text-ink-2">No analysis uses this record yet.</p>
      ) : (
        <ul className="max-w-[70ch] space-y-2">
          {engines.map((engine) => {
            const href = stagePage(engine.stage);
            return (
              <li key={engine.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {href ? <AppLink href={href}>{engine.title}</AppLink> : <span className="font-medium">{engine.title}</span>}
                {engine.status === "example" ? <StatusPill tone="warn">Example data</StatusPill> : <StatusPill tone="ok">Built</StatusPill>}
              </li>
            );
          })}
        </ul>
      )}
    </Block>
  );
}
