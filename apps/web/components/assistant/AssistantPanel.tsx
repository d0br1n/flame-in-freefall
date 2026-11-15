"use client";

// The assistant ("Ask burnrate"): the same panel in the dock (AssistantDock) and on /assistant.
// It answers by calling tools over this site's data and cites the PSI investigations and tests
// it used. Look: the approved mockup's assistant dock (design/mockup-2026-11-14/).
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { Suspense, useContext, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { type AnswerEntry, type ChatEntry } from "@/lib/assistant/conversation";
import { MAX_QUESTION_CHARS, tooLongMessage } from "@/lib/assistant/limits";
import { DISCLAIMER, LIVE_LABEL } from "@/lib/assistant/messages";
import { storedLabel } from "@/lib/assistant/stored";
import { useAir } from "@/lib/air";
import { AnswerText, SourcesRow } from "./AnswerText";
import { AssistantContext, AssistantProvider, useAssistant, type AssistantStatus } from "./AssistantProvider";

export interface AssistantPanelProps {
  /** "dock": the side panel with a close button. "page": full width on /assistant. */
  variant?: "dock" | "page";
  onClose?: () => void;
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function ChatIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5h16v11H9.5L4 20.5V5z" />
    </svg>
  );
}

function StatusPill({ status, ownKey }: { status: AssistantStatus; ownKey: boolean }) {
  const [label, tone] =
    status === "live"
      ? [ownKey ? "Live, your key" : "Live", "bg-ok-soft text-ok"]
      : status === "stored"
        ? ["Stored answers only", "bg-warn-soft text-warn"]
        : ["Checking…", "bg-surface-sunk text-ink-2"];
  return (
    <span data-testid="assistant-status" className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold ${tone}`}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function Working() {
  return (
    <span className="inline-flex gap-1" aria-label="Writing the answer">
      {[0, 1, 2].map((i) => (
        <i key={i} className="size-1.5 animate-pulse rounded-full bg-ink-3 motion-reduce:animate-none" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  );
}

function StoredOffer({ onPick }: { onPick: (id: string) => void }) {
  const { stored, busy } = useAssistant();
  if (!stored.length) return null;
  return (
    <div className="mt-3 grid gap-1.5">
      <span className="text-[13px] font-semibold text-ink-2">Stored answers</span>
      <div className="flex flex-wrap gap-1.5">
        {stored.map((answer) => (
          <button
            key={answer.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(answer.id)}
            className={`inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors hover:border-control hover:text-ink disabled:opacity-50 ${FOCUS}`}
          >
            {answer.question}
          </button>
        ))}
      </div>
    </div>
  );
}

function Answer({ entry }: { entry: AnswerEntry }) {
  const { showStored } = useAssistant();
  const working = entry.state === "working";
  return (
    <article
      className={`mr-6 rounded-lg rounded-bl-sm px-3.5 py-3 text-sm leading-[21px] ${
        entry.kind === "notice" ? "bg-warn-soft text-ink" : "bg-surface-sunk text-ink"
      }`}
      aria-busy={working}
      data-testid="assistant-answer"
      data-kind={entry.kind}
    >
      {entry.kind === "live" && entry.state === "done" && (
        <p className="mb-1.5 text-[13px] font-semibold text-ink-2" title={entry.model ?? undefined}>
          {LIVE_LABEL}
        </p>
      )}
      {entry.kind === "stored" && <p className="mb-1.5 text-[13px] font-semibold text-warn">{storedLabel(entry.generatedOn ?? undefined)}</p>}
      {entry.tools.length > 0 && (working || entry.kind !== "notice") && (
        <ul className="mb-2 grid gap-0.5 text-[13px] text-ink-3" aria-label="What the assistant read">
          {entry.tools.map((line, i) => (
            <li key={i}>{working && i === entry.tools.length - 1 ? `${line}…` : line}</li>
          ))}
        </ul>
      )}
      {entry.text ? <AnswerText text={entry.text} /> : working ? <Working /> : null}
      {entry.state === "stopped" && <p className="mt-1.5 text-[13px] text-ink-2">Stopped.</p>}
      {entry.savedCopy && entry.state === "done" && (
        <p className="mt-1.5 text-[13px] text-ink-2">Read from a saved copy of the data. The live data service did not answer.</p>
      )}
      <SourcesRow sources={entry.sources} />
      {entry.offerStored && <StoredOffer onPick={showStored} />}
    </article>
  );
}

function Message({ entry }: { entry: ChatEntry }) {
  if (entry.role === "user") {
    return (
      <p className="ml-12 justify-self-end rounded-lg rounded-br-sm bg-brand px-3.5 py-3 text-sm leading-[21px] whitespace-pre-wrap text-on-brand">
        {entry.text}
      </p>
    );
  }
  return <Answer entry={entry} />;
}

function Empty() {
  return (
    <div className="px-3 pt-8 pb-3 text-center text-sm text-ink-2">
      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-brand-soft text-brand">
        <ChatIcon className="size-5" />
      </span>
      <b className="mb-1 block font-display text-lg font-semibold text-ink">Ask the PSI data</b>
      Every answer cites the NASA investigation or test behind it, and says so when the data has no answer. Pick a question
      below or type your own.
    </div>
  );
}

const LINK = `font-semibold text-brand underline underline-offset-2 hover:text-ink disabled:opacity-50 ${FOCUS}`;

/**
 * A visitor's own Anthropic API key (DOB-161). The key goes from this field straight into the
 * provider's memory; the field is emptied as soon as the key is taken. Nothing here writes it to
 * browser storage, and the attributes below ask browsers and password managers not to keep it.
 */
function KeyControl() {
  const { status, ownKey, siteLive, busy, setOwnKey, forgetKey } = useAssistant();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const fieldId = useId();
  const noteId = useId();

  if (status === "checking") return null;

  if (ownKey) {
    return (
      <p className="text-[13px] text-ink-2" data-testid="assistant-key">
        Live answers run on your API key until you reload this page.{" "}
        <button type="button" disabled={busy} onClick={forgetKey} className={LINK}>
          Remove key
        </button>
      </p>
    );
  }

  if (!open) {
    return (
      <p className="text-[13px] text-ink-2" data-testid="assistant-key">
        {siteLive ? "You can also ask on your own Anthropic account." : "Live answers need an Anthropic API key."}{" "}
        <button type="button" onClick={() => setOpen(true)} className={LINK}>
          Use your API key
        </button>
      </p>
    );
  }

  const close = () => {
    setValue("");
    setProblem(null);
    setOpen(false);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const refused = setOwnKey(value);
    if (refused) setProblem(refused);
    else close();
  };

  return (
    <form onSubmit={submit} className="grid gap-2 rounded-lg border border-line bg-surface-sunk p-3" data-testid="assistant-key">
      <label htmlFor={fieldId} className="text-[13px] font-semibold text-ink">
        Your Anthropic API key
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={fieldId}
          type="password"
          name="assistant-api-key"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (problem) setProblem(null);
          }}
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          data-form-type="other"
          placeholder="sk-ant-…"
          aria-describedby={noteId}
          aria-invalid={problem ? true : undefined}
          className={`h-9 min-w-0 flex-1 rounded-md border border-line bg-surface px-3 font-mono text-sm outline-none placeholder:text-ink-3 focus:border-brand`}
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className={`inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-semibold text-on-brand transition-colors disabled:opacity-45 ${FOCUS}`}
        >
          Use key
        </button>
        <button
          type="button"
          onClick={close}
          className={`inline-flex h-9 items-center rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunk ${FOCUS}`}
        >
          Cancel
        </button>
      </div>
      {problem && (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {problem}
        </p>
      )}
      <p id={noteId} className="text-[13px] text-ink-2">
        The key stays in this page&rsquo;s memory only: it is not saved in your browser and a reload forgets it. It is sent with
        each question to this site, which passes it to Anthropic and does not store or log it. The answers are billed to your
        Anthropic account.{" "}
        <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" className={LINK}>
          Create a key
        </a>
      </p>
    </form>
  );
}

function Panel({ variant = "dock", onClose, air }: AssistantPanelProps & { air: { id: string; label: string } | null }) {
  const { entries, status, busy, send, stop, stored, ownKey } = useAssistant();
  const [draft, setDraft] = useState("");
  const [warning, setWarning] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const tooLong = draft.trim().length > MAX_QUESTION_CHARS;

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const question = draft.trim();
    if (!question || busy) return;
    if (question.length > MAX_QUESTION_CHARS) {
      setWarning(tooLongMessage(question.length));
      return;
    }
    setWarning(null);
    setDraft("");
    send(question, air?.id ?? null);
  };

  const ask = (question: string) => {
    if (busy) return;
    setWarning(null);
    send(question, air?.id ?? null);
    input.current?.focus();
  };

  const message = warning ?? (tooLong ? tooLongMessage(draft.trim().length) : null);

  return (
    <section aria-label="Assistant" className="flex h-full min-h-0 flex-col bg-surface text-ink">
      <header className={`flex h-16 flex-none items-center gap-2.5 border-b border-line pr-3 ${variant === "dock" ? "pl-5" : "pl-4"}`}>
        <span className="grid size-8 place-items-center rounded-full bg-brand-soft text-brand">
          <ChatIcon />
        </span>
        <h2 className="font-display text-[17px] font-semibold">Assistant</h2>
        <StatusPill status={status} ownKey={ownKey} />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            className={`ml-auto grid size-10 place-items-center rounded-md text-ink-2 transition-colors hover:bg-surface-sunk hover:text-ink ${FOCUS}`}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        )}
      </header>

      <div ref={list} className="min-h-0 flex-1 overflow-y-auto p-5" data-testid="assistant-messages">
        <div className="grid content-start gap-3" aria-live="polite" aria-relevant="additions text">
          {entries.length === 0 ? <Empty /> : entries.map((entry) => <Message key={entry.id} entry={entry} />)}
        </div>
      </div>

      <div className="grid flex-none gap-2.5 border-t border-line p-4">
        {stored.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions" role="group">
            {stored.map((answer) => (
              <button
                key={answer.id}
                type="button"
                disabled={busy}
                title={answer.question}
                onClick={() => ask(answer.question)}
                className={`inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[14px] font-medium text-ink-2 transition-colors hover:border-control hover:text-ink disabled:opacity-50 ${FOCUS}`}
              >
                {answer.chip}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={submit}
          className="flex items-center gap-2 rounded-lg border border-line bg-surface py-1.5 pr-1.5 pl-3.5 transition-colors focus-within:border-brand"
        >
          <input
            ref={input}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              if (warning) setWarning(null);
            }}
            placeholder="Ask about a test, a gas, a cabin air"
            aria-label="Ask the assistant"
            aria-describedby={hintId}
            aria-invalid={tooLong || undefined}
            className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
          {busy ? (
            <button
              type="button"
              onClick={stop}
              className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunk ${FOCUS}`}
            >
              <span aria-hidden="true" className="size-2.5 rounded-[2px] bg-current" />
              Stop
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!draft.trim() || tooLong}
              className={`grid size-9 place-items-center rounded-md bg-brand text-on-brand transition-colors disabled:opacity-45 ${FOCUS}`}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </form>
        <KeyControl />
        <div id={hintId} className="grid gap-1 text-[13px] text-ink-3">
          {message && (
            <p role="alert" className="font-medium text-danger">
              {message}
            </p>
          )}
          {air && <p>&ldquo;This air&rdquo; means {air.label}, the chosen cabin air.</p>}
          <p>{DISCLAIMER}</p>
        </div>
      </div>
    </section>
  );
}

function PanelWithAir(props: AssistantPanelProps) {
  const air = useAir();
  const chosen = air.status === "ok" && air.air ? { id: air.air.id, label: air.air.label } : null;
  return <Panel {...props} air={chosen} />;
}

function PanelInContext(props: AssistantPanelProps) {
  // useAir reads the URL, so it needs a Suspense boundary; until then the panel works without an air.
  return (
    <Suspense fallback={<Panel {...props} air={null} />}>
      <PanelWithAir {...props} />
    </Suspense>
  );
}

/** The assistant panel. Uses the conversation of the mounted AssistantProvider, or its own. */
export function AssistantPanel(props: AssistantPanelProps) {
  const shared = useContext(AssistantContext);
  if (shared) return <PanelInContext {...props} />;
  return (
    <AssistantProvider>
      <PanelInContext {...props} />
    </AssistantProvider>
  );
}
