"use client";

// DOB-87 part 2, the model view: pick a fuel, an oxygen level, a gas added to the air, a pressure
// and a droplet size, and read what the flame temperature engine computed for that mixture
// (flex_grid.json): the flame's ceiling temperature and the predicted share of fuel burned, with
// its error and the noise floor read from flex_checks.json, plus the nearest real FLEX tests.
// Above the readouts the same cell is drawn as an animated droplet flame (FlameSim, DOB-142), and
// under the sliders the grid is read along two levers (PutOutHere, DOB-141).
// Honest limits are part of the answer: no prediction where no real test is near, none for
// helium (the model fails there), and no cell where oxygen plus added gas would pass 100%.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useId, useMemo, useState, type ReactNode } from "react";
import { useApi } from "@/lib/api";
import {
  engineFilePath,
  indexGrid,
  lookup,
  noisePoints,
  percent,
  shareRange,
  testHref,
  withGas,
  type ChecksFile,
  type Grid,
  type GridFile,
  type GridGas,
  type Selection,
} from "@/lib/suppress";
import { Loading, SavedCopyNote, Unreachable } from "@/components/LoadStates";
import { ProvenanceBadge } from "@/components/evidence/ProvenanceBadge";
import { SourceNote } from "@/components/SourceNote";
import { AppLink } from "@/components/AppLink";
import { FlameSim } from "./FlameSim";
import { PutOutHere } from "./PutOutHere";

const GAS_LABEL: Record<GridGas, string> = {
  none: "None (nitrogen only)",
  "carbon dioxide": "Carbon dioxide",
  helium: "Helium",
};

export function BenchSliders() {
  const grid = useApi<GridFile>(engineFilePath("flex_grid.json"));
  const checks = useApi<ChecksFile>(engineFilePath("flex_checks.json"));
  const indexed = useMemo(() => (grid.status === "ok" ? indexGrid(grid.data) : null), [grid]);

  if (grid.status === "loading" || checks.status === "loading") {
    return <Loading label="Loading the mixture grid…" rows={3} />;
  }
  if (grid.status === "error") return <Unreachable error={grid.error} onRetry={grid.retry} what="the mixture grid" />;
  if (checks.status === "error") return <Unreachable error={checks.error} onRetry={checks.retry} what="the engine's checks" />;
  return (
    <>
      <SavedCopyNote source={grid.source} savedAt={grid.savedAt} />
      <Sliders grid={indexed!} file={grid.data} noise={noisePoints(checks.data)} />
    </>
  );
}

/** Radio buttons drawn as a segmented control: still native radios (keyboard, screen readers, tests). */
function Segmented<T extends string | number>({
  name,
  legend,
  options,
  value,
  onChange,
  label,
  stacked = false,
}: {
  name: string;
  legend: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (value: T) => string;
  stacked?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">{legend}</legend>
      <div className={`flex gap-0.5 rounded-md bg-surface-sunk p-[3px] ${stacked ? "flex-col" : "flex-wrap"}`}>
        {options.map((option) => (
          <label key={String(option)} className="relative flex min-w-0 flex-1 cursor-pointer">
            <input
              type="radio"
              name={name}
              checked={value === option}
              onChange={() => onChange(option)}
              className="peer absolute inset-0 cursor-pointer opacity-0"
            />
            <span
              className={`flex min-h-9 w-full items-center rounded-sm px-3 text-[14px] font-semibold text-ink-2 transition-colors duration-150 peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-sm peer-hover:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-brand max-sm:min-h-11 ${
                stacked ? "justify-start text-left" : "justify-center text-center"
              }`}
            >
              {label(option)}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A range over the grid's own steps; the value printed beside its label (testId on the value). */
function StepSlider({
  id,
  label,
  steps,
  index,
  display,
  onIndex,
  testId,
  hint,
}: {
  id: string;
  label: string;
  steps: number;
  index: number;
  display: string;
  onIndex: (index: number) => void;
  testId: string;
  hint?: string;
}) {
  const fill = steps > 1 ? (index / (steps - 1)) * 100 : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
          {label}
        </label>
        <span className="font-mono text-[15px] font-medium tabular-nums text-ink" data-testid={testId}>
          {display}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={0}
        max={steps - 1}
        step={1}
        value={index}
        aria-valuetext={display}
        onChange={(e) => onIndex(Number(e.target.value))}
        className="range mt-2"
        style={{ ["--p" as string]: `${fill}%` }}
      />
      {hint ? <p className="mt-1 text-[13px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

function Sliders({ grid, file, noise }: { grid: Grid; file: GridFile; noise: number | null }) {
  const id = useId();
  const { axes } = grid;
  const [sel, setSel] = useState<Selection>(() => ({
    fuel: axes.fuels.includes("Methanol") ? "Methanol" : axes.fuels[0],
    o2: axes.o2.includes(0.21) ? 0.21 : axes.o2[0],
    gas: "none",
    added: 0,
    pressure: axes.pressures.includes(1) ? 1 : axes.pressures[0],
    d0: axes.d0[Math.floor(axes.d0.length / 2)],
  }));
  const cell = lookup(grid, sel);
  const addedOptions = axes.added[sel.gas];

  return (
    <section aria-labelledby={`${id}-title`} className="rounded-lg border border-line bg-surface p-5 shadow-sm sm:p-7" data-testid="bench-sliders">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={`${id}-title`} className="font-display text-[22px] leading-[28px] font-semibold tracking-[-0.015em] text-ink">
          Try a mixture
        </h2>
        <ProvenanceBadge tag="MODEL" />
      </div>
      <p className="mt-2 max-w-[68ch] text-[15px] leading-[23px] text-ink">
        Numbers computed by the flame temperature engine for droplet tests like those of FLEX (PSI-69). No prediction is shown
        with helium, where the model fails, or when no real FLEX test is near the mixture.
      </p>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-6">
        <form className="space-y-5 rounded-md border border-line bg-canvas p-4 sm:p-5" onSubmit={(e) => e.preventDefault()}>
          <Segmented name={`${id}-fuel`} legend="Fuel" options={axes.fuels} value={sel.fuel} onChange={(fuel) => setSel({ ...sel, fuel })} label={(f) => f} />

          <StepSlider
            id={`${id}-o2`}
            label="Oxygen"
            steps={axes.o2.length}
            index={axes.o2.indexOf(sel.o2)}
            display={percent(sel.o2)}
            onIndex={(i) => setSel({ ...sel, o2: axes.o2[i] })}
            testId="slider-o2"
          />

          <Segmented
            name={`${id}-gas`}
            legend="Gas added to the air"
            options={axes.gases}
            value={sel.gas}
            onChange={(gas) => setSel(withGas(grid, sel, gas))}
            label={(g) => GAS_LABEL[g]}
            stacked
          />

          {sel.gas !== "none" ? (
            <StepSlider
              id={`${id}-added`}
              label={`${GAS_LABEL[sel.gas]} share`}
              steps={addedOptions.length}
              index={Math.max(0, addedOptions.indexOf(sel.added))}
              display={percent(sel.added)}
              onIndex={(i) => setSel({ ...sel, added: addedOptions[i] })}
              testId="slider-added"
              hint="Nitrogen makes up the rest."
            />
          ) : null}

          <Segmented
            name={`${id}-p`}
            legend="Pressure"
            options={axes.pressures}
            value={sel.pressure}
            onChange={(pressure) => setSel({ ...sel, pressure })}
            label={(p) => `${p} atm`}
          />

          <div>
            <label htmlFor={`${id}-d0`} className="text-[13px] font-semibold text-ink-2">Droplet size at the start</label>
            <select
              id={`${id}-d0`}
              value={sel.d0}
              onChange={(e) => setSel({ ...sel, d0: Number(e.target.value) })}
              className="mt-1.5 block min-h-10 w-full cursor-pointer rounded-md border border-line bg-surface px-2.5 text-[14px] text-ink hover:border-control max-sm:min-h-11"
            >
              {axes.d0.map((d) => (
                <option key={d} value={d}>{d} mm</option>
              ))}
            </select>
          </div>
        </form>

        <Result cell={cell} grid={grid} file={file} noise={noise} d0={sel.d0} />
      </div>

      {/* DOB-141: the same grid read along two levers, from the sliders' position. */}
      <PutOutHere grid={grid} sel={sel} onPick={setSel} modelFailsLabel={file.header.model_fails_here.label} />
    </section>
  );
}

function Readout({ label, children, note }: { label: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[14px] font-medium text-ink-2">{label}</p>
      <div className="mt-1">{children}</div>
      {note ? <p className="mt-2 max-w-[52ch] text-[14px] leading-[20px] text-ink-2">{note}</p> : null}
    </div>
  );
}

function Result({ cell, grid, file, noise, d0 }: { cell: ReturnType<typeof lookup>; grid: Grid; file: GridFile; noise: number | null; d0: number }) {
  if (cell === null) {
    return (
      <div className="flex flex-col justify-center rounded-md border border-dashed border-control bg-surface px-5 py-8" data-testid="slider-result" data-state="impossible">
        <p className="font-display text-[18px] font-semibold text-ink">No such mixture</p>
        <p className="mt-1 max-w-[52ch] text-[15px] leading-[23px] text-ink-2">Oxygen plus the added gas would pass 100%. Lower one of them.</p>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 rounded-md border border-line bg-surface p-5 sm:p-6" data-testid="slider-result">
      {/* DOB-142: the same cell as a picture, the flame going out at the predicted share. */}
      <FlameSim cell={cell} d0={d0} grid={grid} modelFailsLabel={file.header.model_fails_here.label} />
      <div className="grid gap-6 sm:grid-cols-2">
        <Readout
          label="Flame ceiling temperature"
          note={
            <>
              Computed: the hottest this flame could be if all the fuel burned in this gas (chemical equilibrium). Checked
              against NASA&rsquo;s flame temperatures in PSI-10.
            </>
          }
        >
          <p className="font-display text-[34px] leading-[38px] font-semibold tracking-[-0.02em] tabular-nums text-ink" data-testid="slider-temperature">
            {cell.temperatureK === null ? "not computed" : `${Math.round(cell.temperatureK).toLocaleString("en-US")} K`}
          </p>
        </Readout>

        <div data-testid="slider-prediction" className="min-w-0">
          <p className="text-[14px] font-medium text-ink-2">Predicted share of the droplet burned</p>
          {cell.modelFails ? (
            <div className="mt-2 rounded-md border border-warn/40 bg-warn-soft px-3 py-2.5 text-ink" data-state="model-fails">
              <p className="font-semibold text-warn">{file.header.model_fails_here.label}: no prediction shown</p>
              <p className="mt-1 text-[15px] leading-[22px]">{file.header.model_fails_here.text}</p>
            </div>
          ) : cell.noTestNear || cell.sharePred === null ? (
            <div className="mt-2 rounded-md border border-line bg-surface-sunk px-3 py-2.5" data-state="no-test-near">
              <p className="font-semibold text-ink">No real FLEX test is near this mixture: no prediction</p>
              <p className="mt-1 text-[15px] leading-[22px] text-ink-2">Engine rule: {file.header.no_test_near}.</p>
            </div>
          ) : (
            <Prediction share={cell.sharePred} grid={grid} noise={noise} />
          )}
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <p className="text-[14px] font-medium text-ink-2">Nearest real FLEX tests</p>
        {cell.nearest.length === 0 ? (
          <p className="mt-1 text-[15px] text-ink-2">None listed.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2" data-testid="slider-nearest">
            {cell.nearest.map((n) => (
              <li key={n.test_id} className="inline-flex items-center gap-2 rounded-sm border border-line bg-surface-sunk py-1 pr-2 pl-2">
                <AppLink href={testHref(n.test_id)} className="font-mono text-[13px] text-accent underline underline-offset-[3px]">{n.test_id}</AppLink>
                <span className="text-[13px] tabular-nums text-ink-3">distance {n.distance.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-auto">
        <SourceNote>
          Flame temperature engine, <span className="font-mono">flex_grid.json</span>, from the FLEX table (PSI-69).
        </SourceNote>
      </div>
    </div>
  );
}

/** The predicted share with its error band, on a 0 to 100% scale (the band is the engine's own error). */
function Prediction({ share, grid, noise }: { share: number; grid: Grid; noise: number | null }) {
  const range = shareRange(share, grid.errorPoints);
  return (
    <div className="mt-1">
      <p className="font-display text-[34px] leading-[38px] font-semibold tracking-[-0.02em] tabular-nums text-ink" data-state="predicted">
        about {range.value}%
        <span className="ml-2 inline-block font-sans text-[15px] font-normal tracking-normal whitespace-nowrap text-ink-2">
          ({range.low} to {range.high}%)
        </span>
      </p>
      <div className="mt-3" data-testid="share-scale">
        <div className="relative h-2.5 rounded-full bg-surface-sunk" role="img" aria-label={`about ${range.value}%, from ${range.low} to ${range.high}% of the droplet`}>
          <div
            className="absolute inset-y-0 rounded-full bg-brand/25 transition-[left,width] duration-300 ease-out"
            style={{ left: `${range.low}%`, width: `${Math.max(0, range.high - range.low)}%` }}
          />
          <div
            className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand transition-[left] duration-300 ease-out"
            style={{ left: `${range.value}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[13px] tabular-nums text-ink-3" aria-hidden="true">
          <span>0%</span>
          <span>50%</span>
          <span>100% burned</span>
        </div>
      </div>
      <p className="mt-2 max-w-[52ch] text-[14px] leading-[20px] text-ink-2">
        On test days it never saw, this prediction was off by about {grid.errorPoints} points.
        {noise !== null ? ` Near-identical real tests end ${noise} points apart.` : ""}
      </p>
    </div>
  );
}
