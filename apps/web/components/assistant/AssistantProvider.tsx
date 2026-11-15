"use client";

// The assistant's conversation for the page session. Mount it once (the shell does), so the
// conversation is kept when the dock closes and reopens. AssistantPanel also works without it:
// it then makes its own.
//
// A visitor's own API key (DOB-161) lives here, in React state, and nowhere else in the browser:
// not in localStorage, sessionStorage, a cookie or the URL. A reload forgets it.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ask, fetchAskStatus } from "@/lib/assistant/client";
import {
  applyEvent,
  historyOf,
  noticeEntry,
  storedEntry,
  type AnswerEntry,
  type AssistantStatus,
  type ChatEntry,
} from "@/lib/assistant/conversation";
import { cleanKey } from "@/lib/assistant/key";
import { MAX_QUESTION_CHARS } from "@/lib/assistant/limits";
import { KEY_SHAPE_MESSAGE, UNAVAILABLE_MESSAGE } from "@/lib/assistant/messages";
import { STORED_ANSWERS, findStored, type StoredAnswer } from "@/lib/assistant/stored";
import type { AskEvent } from "@/lib/assistant/types";

export type { AnswerEntry, AssistantStatus, ChatEntry } from "@/lib/assistant/conversation";

export interface AssistantContextValue {
  entries: ChatEntry[];
  status: AssistantStatus;
  busy: boolean;
  /** Ask a question. air: the cabin air chosen on the site (a preset ID). */
  send: (question: string, air: string | null) => void;
  /** Show one stored answer, with no request. */
  showStored: (id: string) => void;
  /** Stop the answer being written. */
  stop: () => void;
  stored: readonly StoredAnswer[];
  /** True when live answers run on a key the visitor entered. The key itself is never handed out. */
  ownKey: boolean;
  /** True when the site has its own key, so live answers work without the visitor's. */
  siteLive: boolean;
  /** Use this API key for live answers. Returns a message when it is not shaped like one, else null. */
  setOwnKey: (value: string) => string | null;
  /** Forget the visitor's key. */
  forgetKey: () => void;
}

export const AssistantContext = createContext<AssistantContextValue | null>(null);

export function useAssistant(): AssistantContextValue {
  const value = useContext(AssistantContext);
  if (!value) throw new Error("useAssistant must be used inside <AssistantProvider>");
  return value;
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  // What the site answers with by itself: unknown until GET /api/ask replies.
  const [site, setSite] = useState<AssistantStatus>("checking");
  const [key, setKey] = useState<string | null>(null);
  const keyRef = useRef<string | null>(null);
  const status: AssistantStatus = key ? "live" : site;
  const [busy, setBusy] = useState(false);
  const nextId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const entriesRef = useRef<ChatEntry[]>([]);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    const check = new AbortController();
    fetchAskStatus(check.signal).then((answer) => {
      if (!check.signal.aborted) setSite(answer?.live ? "live" : "stored");
    });
    return () => check.abort();
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  const newId = useCallback(() => {
    nextId.current += 1;
    return `m${nextId.current}`;
  }, []);

  const update = useCallback((id: string, change: (entry: AnswerEntry) => AnswerEntry) => {
    setEntries((list) => list.map((e) => (e.id === id && e.role === "assistant" ? change(e) : e)));
  }, []);

  const forgetKey = useCallback(() => {
    keyRef.current = null;
    setKey(null);
  }, []);

  const setOwnKey = useCallback((value: string) => {
    const cleaned = cleanKey(value);
    if (!cleaned) return KEY_SHAPE_MESSAGE;
    keyRef.current = cleaned;
    setKey(cleaned);
    return null;
  }, []);

  const showStored = useCallback(
    (storedId: string) => {
      const answer = STORED_ANSWERS.find((a) => a.id === storedId);
      if (!answer || controller.current) return;
      setEntries((list) => [...list, { id: newId(), role: "user", text: answer.question }, storedEntry(newId(), answer)]);
    },
    [newId],
  );

  const send = useCallback(
    (raw: string, air: string | null) => {
      const question = raw.trim();
      if (!question || question.length > MAX_QUESTION_CHARS || controller.current) return;
      const userId = newId();
      const answerId = newId();
      const history = historyOf(entriesRef.current);

      // No live answers: answer from the stored ones without a request.
      if (status === "stored") {
        const stored = findStored(question);
        setEntries((list) => [
          ...list,
          { id: userId, role: "user", text: question },
          stored ? storedEntry(answerId, stored) : noticeEntry(answerId, UNAVAILABLE_MESSAGE),
        ]);
        return;
      }

      const working: AnswerEntry = { ...noticeEntry(answerId, ""), kind: "live", state: "working", offerStored: false };
      setEntries((list) => [...list, { id: userId, role: "user", text: question }, working]);
      const stop = new AbortController();
      controller.current = stop;
      setBusy(true);
      const onEvent = (event: AskEvent) => {
        // A refused key is forgotten at once, so the panel asks for it again.
        if (event.type === "error" && event.reason === "key") forgetKey();
        update(answerId, (entry) => applyEvent(entry, event));
      };
      ask({ question, history, air }, onEvent, stop.signal, keyRef.current)
        .catch(() => update(answerId, (entry) => (entry.state === "working" ? { ...entry, state: "stopped" } : entry)))
        .finally(() => {
          if (controller.current === stop) controller.current = null;
          setBusy(false);
        });
    },
    [forgetKey, newId, status, update],
  );

  const stop = useCallback(() => controller.current?.abort(), []);

  const value = useMemo<AssistantContextValue>(
    () => ({ entries, status, busy, send, showStored, stop, stored: STORED_ANSWERS, ownKey: key !== null, siteLive: site === "live", setOwnKey, forgetKey }),
    [entries, status, busy, send, showStored, stop, key, site, setOwnKey, forgetKey],
  );
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}
