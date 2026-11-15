"use client";

// An answer's text with every [PSI-…] citation shown as a chip that opens the investigation or
// the test inside the site (through AppLink, so the chosen cabin air is kept). Plain text only:
// paragraphs and "- " list lines, nothing is read as HTML.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { AppLink } from "@/components/AppLink";
import { answerBlocks, hrefFor, splitCitations } from "@/lib/assistant/ground";
import type { SourceItem } from "@/lib/assistant/types";

const CHIP =
  "mx-0.5 inline-flex h-6 items-center rounded-sm border border-line bg-surface px-1.5 align-baseline font-mono text-[13px] font-medium text-ink no-underline transition-colors hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

export function CitationChip({ id }: { id: string }) {
  const href = id.includes("/") ? hrefFor("test", id) : hrefFor("investigation", id);
  return (
    <AppLink href={href} className={CHIP} title={id.includes("/") ? `Open test ${id}` : `Open ${id}`}>
      {id}
    </AppLink>
  );
}

function Line({ text }: { text: string }) {
  return (
    <>
      {splitCitations(text).map((part, index) =>
        part.type === "text" ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span key={index} className="whitespace-nowrap">
            {part.ids.map((id) => (
              <CitationChip key={id} id={id} />
            ))}
          </span>
        ),
      )}
    </>
  );
}

export function AnswerText({ text }: { text: string }) {
  return (
    <div className="grid gap-2">
      {answerBlocks(text).map((block, b) =>
        block.kind === "list" ? (
          <ul key={b} className="grid list-disc gap-1 pl-5">
            {block.items.map((item, i) => (
              <li key={i}>
                <Line text={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={b}>
            {block.lines.map((line, i) => (
              <span key={i}>
                {i > 0 && <br />}
                <Line text={line} />
              </span>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

/** The row of sources under an answer: only IDs a tool returned and the answer cites. */
export function SourcesRow({ sources }: { sources: SourceItem[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[13px] font-semibold text-ink-2">Sources</span>
      {sources.map((source) => (
        <AppLink
          key={`${source.kind}:${source.id}`}
          href={source.href}
          className="inline-flex h-6 items-center gap-1 rounded-sm border border-line bg-surface px-2 font-mono text-[13px] font-medium text-ink no-underline transition-colors hover:border-brand hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {source.kind === "analysis" ? (
            <span className="font-sans">{source.label}</span>
          ) : (
            <>
              {source.id}
              {source.label && source.label !== source.id && <span className="font-sans text-ink-2">· {source.label}</span>}
            </>
          )}
        </AppLink>
      ))}
    </div>
  );
}
