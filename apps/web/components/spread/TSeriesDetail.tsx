"use client";

// The detail of one T-series test that has a review clip (DOB-86): NASA's video brightened so the
// dim flame can be seen, the fan voltage on the same time axis with a cursor that follows the clip,
// the flame seen and gone marks of the SI grader and of one person, and the outcome three ways.
// The clip is a viewing aid, not a measurement. Times of dim flames are approximate.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mark, ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { moduleFileUrl } from "@/lib/evidence";
import {
  agreeWord,
  clipCaption,
  clipToTest,
  gradeWord,
  matchWord,
  parseReadout,
  seconds,
  tMarks,
  tRange,
  testToClip,
  type TSeries,
  type TSeriesRow,
} from "@/lib/spread";
import type { Evidence } from "@/lib/types";
import { EvidenceButton, MATCH_MARK, TERM, VALUE } from "./TSeries";
import { MARKER_STYLE, TimeChart, type ChartMarker, type ChartPanel } from "./TimeChart";
import { CalloutLayer, CalloutList, CalloutToggle } from "./Callouts";
import { usePinned } from "./usePinned";
import { useText } from "./useText";

export const T_READOUT_MISSING = "The on-screen numbers of this video could not be read automatically.";
export const T_READOUT_FAILED = "The read-out table did not load.";
export const T_READOUT_EMPTY = "The read-out table has no values.";
export const T_LIMITS = "Dim flames: times are approximate, about 1 to 2 s. The check was made by one team member, without looking at NASA's outcomes.";

const GRAPH_LABEL = "text-[0.9375rem] font-semibold";
const BLOCK = "min-w-0 rounded-md border border-line bg-surface p-4";
const MARK_KINDS = ["si_seen", "si_gone", "person_seen", "person_gone"] as const;

function Match({ value, testId }: { value: string | null; testId?: string }) {
  const word = value === null ? "not compared" : matchWord(value);
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" data-testid={testId} data-match={value ?? "none"}>
      <Mark path={(value !== null ? MATCH_MARK[value] : undefined) ?? "M4 8h8"} />
      {word}
    </span>
  );
}

function when(from: number | null, gone: number | null): string {
  const parts = [from !== null ? `seen from about ${seconds(from)}` : null, gone !== null ? `gone by about ${seconds(gone)}` : null];
  return parts.filter(Boolean).join(", ") || "no times given";
}

export function TSeriesDetail({
  moduleId,
  row,
  tSeries,
  evidence,
  example,
}: {
  moduleId: string;
  row: TSeriesRow;
  tSeries: TSeries | null;
  evidence: readonly Evidence[];
  example: boolean;
}) {
  const clip = row.clip;
  const readoutState = useText(row.readout ? moduleFileUrl(moduleId, row.readout) : null);
  const readout = useMemo(() => (readoutState.status === "ok" ? parseReadout(readoutState.text) : []), [readoutState]);
  const published = evidence.find((r) => r.id === row.published_evidence_id) ?? null;
  const graded = evidence.find((r) => r.id === row.evidence_id) ?? null;
  const checkRecord = evidence.find((r) => r.id === row.checked?.evidence_id) ?? null;

  const video = useRef<HTMLVideoElement>(null);
  const pinned = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  usePinned(pinned, area);
  const [callouts, setCallouts] = useState(true);
  const [cursor, setCursor] = useState<number | null>(clip ? clip.start_s : null);
  const [clipFailed, setClipFailed] = useState(false);
  const hasClip = clip !== null && !clipFailed;

  // The cursor follows the video: test time = clip.start_s + currentTime * speed.
  useEffect(() => {
    const element = video.current;
    if (!element || !clip) return;
    let frame = 0;
    const update = () => {
      if (element.readyState > 0) setCursor(clipToTest(clip, element.currentTime));
    };
    const tick = () => {
      update();
      if (!element.paused && !element.ended) frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    const names = ["timeupdate", "seeking", "seeked", "pause", "loadedmetadata"];
    element.addEventListener("play", onPlay);
    for (const name of names) element.addEventListener(name, update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("play", onPlay);
      for (const name of names) element.removeEventListener(name, update);
    };
  }, [clip, row.label]);

  const seek = useCallback(
    (testTime: number) => {
      const element = video.current;
      if (element && clip && !clipFailed) {
        const target = testToClip(clip, testTime);
        element.currentTime = target;
        setCursor(clipToTest(clip, target));
      } else setCursor(testTime);
    },
    [clip, clipFailed],
  );

  const range = useMemo(() => (clip ? tRange(clip, readout) : null), [clip, readout]);
  const marks = useMemo<ChartMarker[]>(() => tMarks(row), [row]);
  const panels = useMemo<ChartPanel[]>(() => {
    const list: ChartPanel[] = [
      {
        id: "fan",
        title: "FAN: fan voltage, V x10 (NASA read-out)",
        zero: true,
        lines: [{ id: "fan", step: true, color: "var(--color-series-1)", points: readout.map((r) => ({ t: r.time_s, y: r.fan })) }],
      },
    ];
    if (readout.some((r) => r.air !== null)) {
      list.push({
        id: "air",
        title: "AIR: air speed, cm/s (NASA sensor, slow to respond)",
        zero: true,
        lines: [{ id: "air", color: "var(--color-series-3)", dash: "2 3", points: readout.map((r) => ({ t: r.time_s, y: r.air })) }],
      });
    }
    return list;
  }, [readout]);

  if (!clip || !range) return null;
  const shown = cursor ?? range[0];
  const check = row.checked;
  const kinds = MARK_KINDS.filter((kind) => marks.some((m) => m.kind === kind));

  return (
    <article data-testid="t-series-row" data-test={row.label} aria-label={`Test ${row.label}`}>
      <h3 className="text-[1.125rem] font-semibold text-ink">
        Test <span className="font-mono">{row.label}</span>
      </h3>

      <div ref={area} className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="min-w-0 self-start">
        <div ref={pinned} data-testid="pinned-video" className="relative z-10 bg-surface">
          {hasClip ? (
            <div className="relative">
            <video
              ref={video}
              data-testid="t-clip"
              src={moduleFileUrl(moduleId, clip.file)}
              muted
              controls
              playsInline
              preload="metadata"
              onError={() => setClipFailed(true)}
              className="w-full bg-ink max-lg:max-h-[28dvh]"
              aria-label={`Review clip of test ${row.label}, brightened so the dim flame can be seen`}
            />
            {callouts ? <CalloutLayer gain={clip.gain} /> : null}
            </div>
          ) : (
            <p data-testid="t-clip-absent" className="rounded-md border border-rule bg-wash px-4 py-3 text-[0.9375rem]">
              The review clip could not be loaded.
            </p>
          )}
          <p data-testid="t-clip-caption" className="mt-2 text-[0.875rem] text-ink-2">
            {clipCaption(clip.gain)}
          </p>
          <label className="mt-3 block text-[0.9375rem]">
            <span className="font-medium">Time in the test</span>:{" "}
            <span className="tabular-nums" data-testid="cursor-time">
              {seconds(shown)}
            </span>
            <input
              type="range"
              data-testid="time-slider"
              min={clip.start_s}
              max={clip.end_s}
              step={0.05}
              value={Math.min(Math.max(shown, clip.start_s), clip.end_s)}
              onChange={(event) => seek(Number(event.target.value))}
              className="mt-1 block h-11 w-full cursor-pointer accent-accent"
            />
          </label>
          {hasClip ? <CalloutToggle on={callouts} onChange={setCallouts} /> : null}
        </div>
        {hasClip && callouts ? (
          <div>
            <CalloutList readout={readout} readoutFile={row.readout !== null && (readoutState.status === "loading" || readout.length > 0)} cursor={cursor} gain={clip.gain} />
          </div>
        ) : null}
        </div>

        <div className="min-w-0 space-y-3">
          {row.readout && readoutState.status === "ok" && readout.length > 0 ? (
            <figure>
              <figcaption className={`mb-1 ${GRAPH_LABEL}`}>What NASA&apos;s on-screen read-out showed</figcaption>
              <TimeChart
                id="t-readout"
                label={`The fan voltage${panels.length > 1 ? " and the air speed" : ""} shown on the video of test ${row.label}, against test time, with the flame seen and flame gone times`}
                panels={panels}
                range={range}
                bands={[]}
                markers={marks}
                cursor={cursor}
                onSeek={seek}
                panelHeight={80}
              />
              <p className="mt-1 text-[0.875rem] text-ink-2">Numbers read from the digits NASA put on the picture. A gap means they could not be read.</p>
            </figure>
          ) : (
            <p data-testid="t-readout-absent" className="rounded-md border border-rule bg-wash px-4 py-3 text-[0.9375rem]">
              {!row.readout ? T_READOUT_MISSING : readoutState.status === "absent" ? T_READOUT_FAILED : readoutState.status === "ok" ? T_READOUT_EMPTY : "Loading the read-out table…"}
            </p>
          )}
          <div data-testid="t-chart-legend" className="text-[0.875rem]">
            {kinds.length > 0 ? (
              <ul className="flex flex-wrap gap-x-5 gap-y-1">
                {kinds.map((kind) => (
                  <li key={kind} className="flex items-center gap-2">
                    <svg width="26" height="10" aria-hidden="true">
                      <line x1="0" x2="26" y1="5" y2="5" stroke={MARKER_STYLE[kind].color} strokeWidth="1.5" strokeDasharray={MARKER_STYLE[kind].dash} />
                    </svg>
                    {MARKER_STYLE[kind].label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2">No flame times are marked for this test.</p>
            )}
          </div>
        </div>
      </div>

      <section aria-labelledby={`t-outcome-${row.label}`} className="mt-8">
        <h4 id={`t-outcome-${row.label}`} className="text-[1.125rem] font-semibold">
          How it ended, three ways
        </h4>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div className={BLOCK} data-testid="t-outcome-si">
            <p className={TERM}>SI grade</p>
            <p className={`${VALUE} flex flex-wrap items-center gap-2`}>
              {row.si_grade !== null ? (
                <>
                  <EvidenceButton record={graded} example={example} testId="t-series-grade">
                    {gradeWord(row.si_grade)}
                  </EvidenceButton>
                  <ProvenanceBadge tag={graded?.provenance ?? "SI_EXTRACTED"} />
                </>
              ) : (
                <span className="text-ink-2">{gradeWord(null)}</span>
              )}
            </p>
            <p className="mt-1 text-[14px] text-ink-2">Confidence: {row.confidence ?? "not given"}</p>
            {row.si_times ? <p className="mt-1 text-[14px] text-ink-2">{when(row.si_times.flame_seen_from_s, row.si_times.flame_gone_s)}</p> : null}
            <p className="mt-2 text-[15px] leading-[23px] text-ink">{row.reason ?? "No reason is given."}</p>
          </div>

          <div className={BLOCK} data-testid="t-outcome-person">
            <p className={TERM}>Checked by a person</p>
            {check && check.grade !== null ? (
              <>
                <p className={VALUE}>
                  <EvidenceButton record={checkRecord} example={example} testId="t-check-grade">
                    {gradeWord(check.grade)}
                  </EvidenceButton>
                </p>
                <p className="mt-1 text-[14px] text-ink-2">
                  {check.by ?? "A team member"}
                  {check.date ? `, ${check.date}` : ""}
                </p>
                <p className="mt-1 text-[14px] text-ink-2">{when(check.flame_seen_from_s, check.flame_gone_s)}</p>
                <p className="mt-1 text-[15px] text-ink" data-testid="t-check-agree" data-agree={check.agrees_with_si ?? "none"}>
                  {agreeWord(check.agrees_with_si)}
                </p>
                {check.note ? <p className="mt-2 text-[15px] leading-[23px] text-ink">{check.note}</p> : null}
              </>
            ) : (
              <p className={`${VALUE} text-ink-2`}>No person has checked this test.</p>
            )}
          </div>

          <div className={BLOCK} data-testid="t-outcome-nasa">
            <p className={TERM}>NASA&apos;s published outcome</p>
            <p className={VALUE}>
              {row.nasa_outcome ? (
                <EvidenceButton record={published} example={example} testId="t-series-published">
                  {row.nasa_outcome}
                </EvidenceButton>
              ) : (
                <span className="text-ink-2">not given</span>
              )}
            </p>
            <p className="mt-1 text-[14px] text-ink-2">
              Source: {published ? `${published.source.psi_id}, ${published.source.file}` : "the BASS-II Summary Report, Table 7.1"}
            </p>
            <dl className="mt-2 space-y-1 text-[15px] text-ink">
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-ink-2">SI grade matches:</dt>
                <dd>
                  <Match value={row.si_grade === null ? null : row.match} testId="t-series-match" />
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-ink-2">Person&apos;s check matches:</dt>
                <dd>
                  <Match value={check?.grade ? check.match : null} testId="t-check-match" />
                </dd>
              </div>
            </dl>
          </div>
        </div>
        {tSeries?.checked_by || tSeries?.check_note ? (
          <p className="mt-3 max-w-[75ch] text-[14px] text-ink-2" data-testid="t-check-note">
            {tSeries.checked_by ? `Checked by: ${tSeries.checked_by}. ` : ""}
            {tSeries.check_note ?? ""}
          </p>
        ) : null}
        <p className="mt-2 max-w-[75ch] text-[14px] text-ink-2" data-testid="t-limits">
          {T_LIMITS}
        </p>
      </section>
    </article>
  );
}
