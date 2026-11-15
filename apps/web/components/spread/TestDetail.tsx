"use client";

// The detail of one processed test (DOB-86), shown inside its row of the list: the overlay clip
// beside three charts on one time axis, how the engine sees a frame, the numbers (each opens the evidence panel), and the
// warnings. Nothing here is computed from video: it draws what the engine's files hold.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { EvidenceNumber } from "@/components/evidence/EvidenceNumber";
import { MarginRow, SourceNote } from "@/components/SourceNote";
import { moduleFileUrl } from "@/lib/evidence";
import {
  burnDuration,
  clipToTest,
  findEvidence,
  fanFall,
  fittedLine,
  LAST_FAINT_LIGHT_NOTE,
  lastFaintLight,
  flagWords,
  parseCurve,
  parseReadout,
  qualityWord,
  rateText,
  seconds,
  stageBands,
  testToClip,
  timeRange,
  type SpreadIndex,
  type SpreadTest,
} from "@/lib/spread";
import type { Evidence } from "@/lib/types";
import { BAND_COLORS, MARKER_STYLE, TimeChart, type ChartMarker, type ChartPanel } from "./TimeChart";
import { CalloutLayer, CalloutList, CalloutToggle, STEPS_CAPTION, StepsToggle } from "./Callouts";
import { usePinned } from "./usePinned";
import { useText } from "./useText";

const GRAPH_LABEL = "text-[0.9375rem] font-semibold";

export function TestDetail({
  moduleId,
  test,
  index,
  evidence,
  example,
}: {
  moduleId: string;
  test: SpreadTest;
  index: SpreadIndex;
  evidence: Evidence[];
  example: boolean;
}) {
  const curveState = useText(test.files.curve ? moduleFileUrl(moduleId, test.files.curve) : null);
  const readoutState = useText(test.files.readout ? moduleFileUrl(moduleId, test.files.readout) : null);
  const curve = useMemo(() => (curveState.status === "ok" ? parseCurve(curveState.text) : []), [curveState]);
  const readout = useMemo(() => (readoutState.status === "ok" ? parseReadout(readoutState.text) : []), [readoutState]);
  const range = useMemo(() => timeRange(test, curve, readout), [test, curve, readout]);

  return (
    <article data-testid="test-detail" aria-label={`Test ${test.label}`}>
      <h3 className="text-[1.125rem] font-semibold text-ink">
        Test <span className="font-mono">{test.label}</span>
      </h3>

      <Player moduleId={moduleId} test={test} index={index} curve={curve} readout={readout} readoutState={readoutState.status} range={range} />
      <FrameSection moduleId={moduleId} test={test} />
      <Numbers test={test} evidence={evidence} example={example} />
      <Warnings test={test} />
    </article>
  );
}

// ------------------------------------------------------------------ the synced player

function Player({
  moduleId,
  test,
  index,
  curve,
  readout,
  readoutState,
  range,
}: {
  moduleId: string;
  test: SpreadTest;
  index: SpreadIndex;
  curve: ReturnType<typeof parseCurve>;
  readout: ReturnType<typeof parseReadout>;
  readoutState: string;
  range: [number, number] | null;
}) {
  const clip = test.clip;
  const video = useRef<HTMLVideoElement>(null);
  const pinned = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  usePinned(pinned, area);
  const [callouts, setCallouts] = useState(true);
  // The three-panel detection clip, when the index has one. It has the clip's timing, so the same test time holds.
  const [steps, setSteps] = useState(false);
  const stepsFile = test.files.steps_clip;
  const showSteps = steps && stepsFile !== null;
  // The moment to return to after the source changes: set when the mode switches, used once the new source has metadata.
  const resume = useRef<{ time: number; play: boolean; source: string } | null>(null);
  const [stepsFailed, setStepsFailed] = useState(false);
  const switchMode = (on: boolean) => {
    const element = video.current;
    const pending = resume.current;
    // A second switch before the new source has loaded keeps the moment already waiting: the element reads 0 meanwhile.
    if (element) {
      resume.current = {
        time: pending ? pending.time : element.currentTime,
        play: pending ? pending.play : !element.paused && !element.ended,
        source: on ? "steps" : "clip",
      };
    }
    setStepsFailed(false);
    setSteps(on);
  };
  const [cursor, setCursor] = useState<number | null>(clip ? clip.start_s : null);
  const [clipFailed, setClipFailed] = useState(false);
  const hasClip = clip !== null && !clipFailed;

  // The cursor follows the video: test time = clip.start_s + currentTime * speed.
  useEffect(() => {
    const element = video.current;
    if (!element || !clip) return;
    let frame = 0;
    // A clip that has not loaded reports 0: keep the moment the person chose until it does.
    const update = () => {
      if (element.readyState === 0) return;
      const back = resume.current;
      if (back && element.dataset.source === back.source) {
        // A new source has loaded: return to the moment the person was at, and play on if it was playing.
        resume.current = null;
        element.currentTime = back.time;
        if (back.play) void element.play().catch(() => undefined);
      }
      setCursor(clipToTest(clip, element.currentTime));
    };
    const tick = () => {
      update();
      if (!element.paused && !element.ended) frame = requestAnimationFrame(tick);
    };
    const onPlay = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };
    element.addEventListener("play", onPlay);
    for (const name of ["timeupdate", "seeking", "seeked", "pause", "loadedmetadata"]) element.addEventListener(name, update);
    update();
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("play", onPlay);
      for (const name of ["timeupdate", "seeking", "seeked", "pause", "loadedmetadata"]) element.removeEventListener(name, update);
    };
  }, [clip, test.label]);

  const seek = useCallback(
    (testTime: number) => {
      const element = video.current;
      if (element && clip && !clipFailed) {
        const target = testToClip(clip, testTime);
        element.currentTime = target;
        // The requested moment, not a read-back: a clip that is still loading reports 0.
        setCursor(clipToTest(clip, target));
      } else {
        setCursor(testTime);
      }
    },
    [clip, clipFailed],
  );

  const bands = useMemo(() => (range ? stageBands(test.stages, range) : []), [test.stages, range]);
  const markers = useMemo<ChartMarker[]>(() => {
    const list: ChartMarker[] = [];
    if (test.events.ignition_time_s !== null) list.push({ t: test.events.ignition_time_s, kind: "ignition" });
    if (!test.events.censored && test.events.extinction_time_s !== null) list.push({ t: test.events.extinction_time_s, kind: "extinction" });
    const faint = lastFaintLight(test);
    if (faint !== null) list.push({ t: faint, kind: "faint" });
    for (const change of test.fan.changes) list.push({ t: change.time_s, kind: "fan" });
    return list;
  }, [test]);

  const edges = useMemo<ChartPanel[]>(() => {
    const fitted = fittedLine(test.rate);
    const window = test.rate && test.rate.window_start_s !== null && test.rate.window_end_s !== null ? test.rate : null;
    return [
      {
        id: "edges",
        title: "Flame edges, position (px)",
        lines: [
          {
            id: "leading",
            color: "var(--color-series-1)",
            points: curve.map((row) => ({ t: row.time_s, y: row.leading_edge_px })),
          },
          {
            id: "trailing",
            color: "var(--color-series-2)",
            dash: "6 3",
            points: curve.map((row) => ({ t: row.time_s, y: row.trailing_edge_px })),
          },
        ],
        shade: window ? { from: window.window_start_s as number, to: window.window_end_s as number, label: "fitted window" } : undefined,
        segment: fitted ? { ...fitted, color: "var(--color-ink)", dash: "4 3" } : undefined,
      },
    ];
  }, [test.rate, curve]);
  const fall = useMemo(() => fanFall(test), [test]);

  const flame = useMemo<ChartPanel[]>(
    () => [
      {
        id: "area",
        title: "Flame area (px)",
        zero: true,
        lines: [{ id: "area", color: "var(--color-series-3)", points: curve.map((row) => ({ t: row.time_s, y: row.area_px })) }],
      },
      {
        id: "light",
        title: "Flame light (relative units, uncalibrated)",
        zero: true,
        lines: [
          { id: "light", color: "var(--color-series-7)", dash: "6 3", points: curve.map((row) => ({ t: row.time_s, y: row.flame_light })) },
        ],
      },
    ],
    [curve],
  );

  const readoutPanels = useMemo<ChartPanel[]>(
    () => [
      {
        id: "fan",
        title: "FAN: fan voltage x10 (NASA read-out); not an air speed",
        zero: true,
        lines: [{ id: "fan", step: true, color: "var(--color-series-1)", points: readout.map((row) => ({ t: row.time_s, y: row.fan })) }],
      },
      {
        id: "air",
        title: "AIR: air flow speed in the duct, cm/s (NASA sensor, takes about a minute to respond)",
        zero: true,
        lines: [{ id: "air", color: "var(--color-series-3)", dash: "2 3", points: readout.map((row) => ({ t: row.time_s, y: row.air })) }],
      },
      {
        id: "rad",
        title: "RAD: NASA's radiometer read-out, uncalibrated, relative",
        lines: [{ id: "rad", color: "var(--color-series-2)", dash: "6 3", points: readout.map((row) => ({ t: row.time_s, y: row.rad })) }],
      },
    ],
    [readout],
  );

  const shown = cursor ?? (range ? range[0] : 0);
  const source = (
    <div className="space-y-1.5">
      <SourceNote>
        <span className="font-mono">{test.test_id.split("/")[0]}</span>, video{" "}
        <span className="break-all font-mono">{test.video_file ?? "not named in the index"}</span>. The clip and the curves are the
        engine&apos;s own output.
      </SourceNote>
    </div>
  );

  return (
    <section aria-labelledby={`player-${test.label}`} className="mt-4">
      <h4 id={`player-${test.label}`} className="text-[1.125rem] font-semibold">
        The footage and what was measured from it
      </h4>
      <MarginRow className="mt-2" note={source}>
        <p className="max-w-[70ch] text-[0.9375rem]">
          Click or drag on a chart to move the video. Times are seconds of the test.
          {clip ? ` The clip shows ${seconds(clip.start_s)} to ${seconds(clip.end_s)} of the test, played ${clip.speed} times faster than real time.` : ""}
        </p>
      </MarginRow>

      <div ref={area} className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className={`min-w-0 self-start ${showSteps ? "lg:col-span-2" : ""}`}>
        <div ref={pinned} data-testid="pinned-video" className="relative z-10 bg-surface">
          {hasClip ? (
            <div className="relative">
            <video
              ref={video}
              data-testid="spread-clip"
              src={moduleFileUrl(moduleId, showSteps && stepsFile ? stepsFile : clip.file)}
              muted
              controls
              playsInline
              preload="metadata"
              onError={() => {
                if (!showSteps) return setClipFailed(true);
                // The three-panel clip did not load: go back to the normal clip at the moment the person was at.
                resume.current = { time: clip ? testToClip(clip, cursor ?? clip.start_s) : 0, play: false, source: "clip" };
                setSteps(false);
                setStepsFailed(true);
              }}
              className="w-full bg-ink max-lg:max-h-[28dvh]"
              data-source={showSteps ? "steps" : "clip"}
              aria-label={`Overlay clip of test ${test.label}: NASA's frames with the tracked flame outline and two edge lines drawn`}
            />
            {callouts && !showSteps ? <CalloutLayer /> : null}
            </div>
          ) : (
            <p data-testid="clip-absent" className="rounded-md border border-rule bg-wash px-4 py-3 text-[0.9375rem]">
              {clip ? "The overlay clip could not be loaded." : "There is no overlay clip for this test."} The charts still work: use the
              slider to move through the test.
            </p>
          )}
          {range ? (
            <label className="mt-3 block text-[0.9375rem]">
              <span className="font-medium">Time in the test</span>:{" "}
              <span className="tabular-nums" data-testid="cursor-time">
                {seconds(shown)}
              </span>
              <input
                type="range"
                data-testid="time-slider"
                min={clip && hasClip ? clip.start_s : range[0]}
                max={clip && hasClip ? clip.end_s : range[1]}
                step={0.05}
                value={Math.min(Math.max(shown, clip && hasClip ? clip.start_s : range[0]), clip && hasClip ? clip.end_s : range[1])}
                onChange={(event) => seek(Number(event.target.value))}
                className="mt-1 block h-11 w-full cursor-pointer accent-accent"
              />
            </label>
          ) : null}
          {hasClip && showSteps ? (
            <p data-testid="steps-caption-line" className="mt-2 max-w-[100ch] text-[0.875rem] text-ink-2">
              {STEPS_CAPTION}
            </p>
          ) : null}
          {stepsFailed ? (
            <p data-testid="steps-failed" className="mt-2 text-[0.875rem] text-ink-2">
              The engine&apos;s three-panel clip could not be loaded. The normal clip is shown.
            </p>
          ) : null}
          {hasClip ? (
            <div className="flex flex-wrap gap-x-3">
              <CalloutToggle on={callouts} onChange={setCallouts} />
              {stepsFile ? <StepsToggle on={showSteps} onChange={switchMode} /> : null}
            </div>
          ) : null}
        </div>
        {hasClip && callouts ? (
          <div>
            <CalloutList readout={readout} readoutFile={test.files.readout !== null && (readoutState === "loading" || readout.length > 0)} cursor={cursor} curve={curve} />
          </div>
        ) : null}
        </div>

        {range ? (
          <div className="min-w-0 space-y-5">
            <figure>
              <figcaption className={`mb-1 ${GRAPH_LABEL}`}>Where the flame was</figcaption>
              <TimeChart
                id="edges"
                label="Leading and trailing flame edge position against test time, with the fitted window shaded and the fitted line"
                panels={edges}
                range={range}
                bands={bands}
                markers={markers}
                fall={fall}
                cursor={cursor}
                onSeek={seek}
              />
              <p className="mt-1 text-[0.875rem] text-ink-2">
                Solid dark blue line: leading edge. Dashed mid-blue line: trailing edge. Grey shade: the window the rate is fitted over. Dashed ink line: the
                engine&apos;s slope drawn through the middle of the leading edge points in that window.
              </p>
            </figure>
            <figure>
              <figcaption className={`mb-1 ${GRAPH_LABEL}`}>How big and how bright the flame looked</figcaption>
              <TimeChart
                id="flame"
                label="Flame area and flame light against test time. Flame light is in relative units and is not calibrated"
                panels={flame}
                range={range}
                bands={bands}
                markers={markers}
                fall={fall}
                cursor={cursor}
                onSeek={seek}
                panelHeight={70}
              />
              <p className="mt-1 text-[0.875rem] text-ink-2">
                Flame light is brightness in the video, in relative units. It is not calibrated and says nothing about how hot the flame
                is.
              </p>
            </figure>
            <figure>
              <figcaption className={`mb-1 ${GRAPH_LABEL}`}>What NASA&apos;s on-screen read-out showed</figcaption>
              {readoutState === "ok" ? (
                <TimeChart
                  id="readout"
                  label="The fan voltage, the air flow speed and the radiometer read-out shown on the video, against test time"
                  panels={readoutPanels}
                  range={range}
                  bands={bands}
                  markers={markers}
                fall={fall}
                  cursor={cursor}
                  onSeek={seek}
                  panelHeight={70}
                />
              ) : (
                <p data-testid="readout-absent" className="rounded-md border border-rule bg-wash px-4 py-3 text-[0.9375rem]">
                  {readoutState === "loading" ? "Loading the read-out table…" : "The read-out table is not available for this test."}
                </p>
              )}
              <p className="mt-1 text-[0.875rem] text-ink-2">
                Both are numbers read from the digits NASA put on the picture. A gap means the digits could not be read.
              </p>
            </figure>
            <Legend test={test} index={index} markers={markers} bands={bands} fall={fall} />
          </div>
        ) : (
          <p className="text-ink-2" data-testid="no-curve">
            This test has no table of values to chart.
          </p>
        )}
      </div>
    </section>
  );
}

function Legend({
  test,
  index,
  markers,
  bands,
  fall,
}: {
  fall: { from: number; to: number } | null;
  test: SpreadTest;
  index: SpreadIndex;
  markers: ChartMarker[];
  bands: ReturnType<typeof stageBands>;
}) {
  const kinds = (["ignition", "extinction", "faint", "fan"] as const).filter((kind) => markers.some((marker) => marker.kind === kind));
  return (
    <div data-testid="chart-legend" className="border-t border-rule pt-3 text-[0.875rem]">
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {kinds.map((kind) => (
          <li key={kind} className="flex items-center gap-2">
            <svg width="26" height="10" aria-hidden="true">
              <line x1="0" x2="26" y1="5" y2="5" stroke={MARKER_STYLE[kind].color} strokeWidth="1.5" strokeDasharray={MARKER_STYLE[kind].dash} />
            </svg>
            {MARKER_STYLE[kind].label}
          </li>
        ))}
        {fall ? (
          <li className="flex items-center gap-2" data-testid="fall-legend">
            <svg width="16" height="12" aria-hidden="true">
              <rect width="16" height="12" fill="var(--color-ink-2)" opacity="0.4" />
            </svg>
            fan voltage falling ({seconds(fall.from)} to {seconds(fall.to)})
          </li>
        ) : null}
        {bands.map((band) => (
          <li key={`${band.stage}-${band.index}`} className="flex items-center gap-2" data-testid="stage-legend">
            <svg width="16" height="12" aria-hidden="true">
              <rect width="16" height="12" fill={BAND_COLORS[band.index % BAND_COLORS.length]} opacity="0.25" stroke="var(--color-rule)" />
            </svg>
            {band.stage}
          </li>
        ))}
      </ul>
      {test.stages.length > 0 ? (
        <p className="mt-2 text-ink-2" data-testid="stage-source">
          Stages (the coloured bands):{" "}
          {index.stage_source ? (
            <>
              {index.stage_source.citation}
              {index.stage_source.link ? (
                <>
                  {" "}
                  <a href={index.stage_source.link} target="_blank" rel="noopener noreferrer">
                    Open the source<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                </>
              ) : null}
            </>
          ) : (
            "the index does not name the source of the stage limits."
          )}
          {index.stage_source?.note ? <span data-testid="stage-note"> {index.stage_source.note}</span> : null}
          <span> The stages describe this small test flame, not the hazard of a cabin fire.</span>
        </p>
      ) : (
        <p className="mt-2 text-ink-2">The index gives no stages for this test.</p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ how the engine sees a frame

function Picture({ src, alt, children }: { src: string; alt: string; children: ReactNode }) {
  return (
    <figure className="min-w-0">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} loading="lazy" className="w-full border border-rule bg-card" />
      <figcaption className="mt-1 text-[0.875rem] text-ink-2">{children}</figcaption>
    </figure>
  );
}

function FrameSection({ moduleId, test }: { moduleId: string; test: SpreadTest }) {
  const { steps, stills, kymograph } = test.files;
  if (!steps && stills.length === 0 && !kymograph) return null;
  return (
    <section aria-labelledby={`frame-${test.label}`} className="mt-10" data-testid="frame-section">
      <h4 id={`frame-${test.label}`} className="text-[1.125rem] font-semibold">
        How the engine sees a frame
      </h4>
      {steps ? (
        <div className="mt-3 max-w-[56rem]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            data-testid="steps-image"
            src={moduleFileUrl(moduleId, steps)}
            alt={`Four panels of one frame of test ${test.label}: NASA's frame, its brightness, the flame mask, and the outline with the two edges`}
            loading="lazy"
            className="w-full max-w-[40rem] border border-rule bg-card"
          />
          <ol className="mt-2 max-w-[70ch] list-decimal space-y-0.5 pl-5 text-[0.9375rem]" data-testid="steps-caption">
            <li>Frame: one picture from the video, as NASA recorded it.</li>
            <li>Brightness: the same picture as one brightness value per pixel.</li>
            <li>Flame mask: the pixels above the tracker&apos;s brightness threshold, after clean-up.</li>
            <li>Outline and edges: the flame outline in green and the two edges as vertical lines; the numbers come from these.</li>
          </ol>
        </div>
      ) : null}
      {stills.length > 0 || kymograph ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {stills.map((name, i) => (
            <Picture key={name} src={moduleFileUrl(moduleId, name)} alt={`Still ${i + 1} of test ${test.label} with the tracked outline and edge lines`}>
              Still {i + 1}: a frame of the video with the tracked flame outline and the two edge lines drawn on it.
            </Picture>
          ))}
          {kymograph ? (
            <Picture src={moduleFileUrl(moduleId, kymograph)} alt={`Kymograph of test ${test.label}`}>
              Kymograph: brightness along the spread direction for every moment of the test, with the two tracked edges drawn on it.
            </Picture>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ the numbers

function Numbers({ test, evidence, example }: { test: SpreadTest; evidence: Evidence[]; example: boolean }) {
  const { events, fan, rate } = test;
  const duration = burnDuration(test);
  const rows: { label: string; value: ReactNode; note?: ReactNode }[] = [];
  // A number opens the evidence panel through the record the index names. Without a record the
  // value from the index is shown as plain text, never as a button.
  const num = (quantity: string, plain: string | null = null) => {
    const record = findEvidence(evidence, test, quantity);
    if (record) return <EvidenceNumber record={record} example={example} />;
    return plain !== null ? <span className="tabular-nums">{plain}</span> : <span className="text-ink-2">not given</span>;
  };
  const withUnit = (value: number | null, unit: string) => (value === null ? null : `${Number(value.toFixed(3))} ${unit}`);

  rows.push({
    label: "Ignition time",
    value: num("ignition_time", withUnit(events.ignition_time_s, "s")),
    note: "Ignition is the first light in the video, the igniter spark included.",
  });
  rows.push({
    label: "Extinction time",
    value: events.censored ? (
      <span data-testid="still-burning">still burning when the video ended</span>
    ) : (
      num("extinction_time", withUnit(events.extinction_time_s, "s"))
    ),
  });
  if (events.last_faint_light_s !== null) {
    rows.push({
      label: "Last faint light",
      value: num("last_faint_light_time", withUnit(events.last_faint_light_s, "s")),
      note: <span data-testid="faint-note">{LAST_FAINT_LIGHT_NOTE}</span>,
    });
  }
  rows.push({
    label: "Burn duration",
    value: num("burn_duration", withUnit(duration, "s")),
    note: events.censored ? "not given: the flame was still burning when the video ended" : undefined,
  });
  rows.push({
    label: "Spread rate",
    value: rate ? num("spread_rate", rateText(rate)) : <span className="text-ink-2">no fitted rate</span>,
    note: rate ? (
      <>
        <span data-testid="rate-text">{rateText(rate)}</span>
        {rate.window_start_s !== null && rate.window_end_s !== null
          ? `, fitted over ${seconds(rate.window_start_s)} to ${seconds(rate.window_end_s)} of the test`
          : ""}
        . In pixels because no scale is visible.
      </>
    ) : undefined,
  });
  rows.push({ label: "Leading edge travel", value: num("leading_edge_travel") });
  rows.push({
    label: "Peak flame light",
    value: num("peak_flame_light"),
    note: "Relative units, uncalibrated.",
  });
  rows.push({
    label: "Fan voltage at ignition",
    value: num("fan_setting_at_ignition", withUnit(fan.at_ignition, fan.unit)),
    note: "NASA's read-out: fan voltage x10. It is not an air speed.",
  });
  rows.push({
    label: "Air flow speed at ignition",
    value: num("air_speed_at_ignition", withUnit(test.air.at_ignition, "cm/s")),
    note: "Measured in the duct by a NASA sensor that takes about a minute to respond.",
  });
  rows.push({
    label: "Time the fan voltage began to fall",
    value: num("fan_drop_time", withUnit(fan.drop_time_s, "s")),
    note: fan.settled_time_s !== null ? `It settled at ${seconds(fan.settled_time_s)}.` : undefined,
  });
  const gap = fan.flame_gone_minus_fan_drop_s;
  rows.push({
    label: "Flame gone minus fan drop",
    value: num("flame_gone_minus_fan_drop", withUnit(gap, "s")),
    note:
      gap === null
        ? undefined
        : gap > 0
          ? "Positive means the flame left the video after the fan voltage began to fall."
          : gap < 0
            ? "Negative means the flame left the video before the fan voltage began to fall."
            : undefined,
  });

  const published = evidence.filter((r) => r.test_id === test.test_id && r.provenance === "PUBLISHED");
  const cell = "border-b border-rule px-3 py-2 align-top";
  return (
    <section aria-labelledby={`numbers-${test.label}`} className="mt-10" data-testid="numbers-section">
      <h4 id={`numbers-${test.label}`} className="text-[1.125rem] font-semibold">
        The numbers
      </h4>
      <p className="mt-1 text-[0.9375rem] text-ink-2">Click a value to see which NASA file it comes from.</p>
      <div className="mt-3 max-w-[56rem] overflow-x-auto rounded-md border border-rule bg-card">
        <table className="w-full min-w-[34rem] border-collapse text-[0.9375rem]">
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <th scope="row" className={`${cell} w-[15rem] text-left font-medium`}>
                  {row.label}
                </th>
                <td className={`${cell} whitespace-nowrap`}>{row.value}</td>
                <td className={`${cell} text-[0.875rem] text-ink-2`}>{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {published.length > 0 ? (
        <div className="mt-5 max-w-[70ch]" data-testid="published-values">
          <h5 className="font-semibold">Published by NASA for this test</h5>
          <p className="text-[0.875rem] text-ink-2">
            Shown as NASA published them, in NASA&apos;s own unit. They are not compared with the pixel values above: the units differ.
          </p>
          <ul className="mt-1 space-y-1">
            {published.map((rec) => (
              <li key={rec.id}>
                {rec.quantity.replace(/_/g, " ")}:{" "}
                <span className={`[overflow-wrap:anywhere] [&_span]:whitespace-normal ${typeof rec.value === "number" ? "" : "font-serif"}`}>
                  <EvidenceNumber record={rec} example={example} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

// ------------------------------------------------------------------ the warnings

function Warnings({ test }: { test: SpreadTest }) {
  return (
    <section aria-labelledby={`warnings-${test.label}`} className="mt-10" data-testid="warnings-section">
      <h4 id={`warnings-${test.label}`} className="text-[1.125rem] font-semibold">
        Warnings
      </h4>
      {test.flags.length === 0 ? (
        <p className="mt-1">No warning flag for this test.</p>
      ) : (
        <ul className="mt-1 max-w-[70ch] list-disc space-y-1 pl-5" data-testid="flag-list">
          {test.flags.map((flag) => (
            <li key={flag}>
              {flagWords(flag)} <span className="font-mono text-[0.875rem] text-ink-2">({flag})</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 max-w-[70ch]" data-testid="viewing-note">
        <p>
          What the SI viewer saw in the frames: <span className="font-semibold">{qualityWord(test.viewing.quality)}</span>.
        </p>
        {test.viewing.note ? <p className="mt-1">{test.viewing.note}</p> : null}
        <p className="mt-1 text-[0.875rem] text-ink-2">
          {test.viewing.viewed_by ? `Seen by ${test.viewing.viewed_by}` : "Seen by SI on contact sheets"}: this is not a hand
          measurement.
        </p>
      </div>
    </section>
  );
}

