"use client";

// The cabin-air dropdown in the top bar: the same choice as the Overview's "Cabin air" card (one
// source of truth: lib/air.ts, the URL). Presets, their names and their plain words come from
// GET /air/presets. A custom air (set with the Overview's sliders) shows as its own entry.
import { Suspense } from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { airShort, CUSTOM_ID, useAir, useSetAir } from "@/lib/air";
import { useShell } from "./ShellState";

export function AirPill({ className = "" }: { className?: string }) {
  return (
    <Suspense fallback={<AirPillPlaceholder className={className} />}>
      <AirPillControl className={className} />
    </Suspense>
  );
}

function AirPillPlaceholder({ className }: { className: string }) {
  return (
    <div data-testid="air-loading" aria-hidden="true" className={className}>
      <Skeleton className="h-10 w-full min-w-[9rem] rounded-full sm:w-[12rem]" />
    </div>
  );
}

function AirPillControl({ className }: { className: string }) {
  const air = useAir();
  const setAir = useSetAir();
  const { dockOpen } = useShell();
  if (air.status === "loading") return <AirPillPlaceholder className={className} />;
  if (air.status === "error") {
    return (
      <div data-testid="air-error" className={`flex items-center gap-2 ${className}`}>
        <p className="text-[14px] font-medium text-ink-2">Cabin air unavailable</p>
        <button type="button" onClick={air.retry} className="btn btn-secondary">
          Try again
        </button>
      </div>
    );
  }
  if (!air.air) {
    return (
      <p data-testid="air-error" className={`text-[14px] font-medium text-ink-2 ${className}`}>
        No cabin air is listed
      </p>
    );
  }
  const current = air.air;
  const options: SelectOption[] = air.presets.map((preset) => ({ value: preset.id, label: preset.label, hint: preset.plain }));
  if (current.id === CUSTOM_ID) options.unshift({ value: CUSTOM_ID, label: current.label, hint: current.plain });
  const short = airShort(current);
  return (
    <Select
      label="Cabin air"
      testId="air-control"
      icon="air"
      options={options}
      value={current.id}
      onChange={(id) => {
        if (id !== CUSTOM_ID) setAir(id);
      }}
      className={className}
      buttonContent={
        <>
          <span className="truncate">{current.label}</span>
          {short ? (
            <span className={`hidden whitespace-nowrap font-mono text-[13px] font-medium text-ink-2 ${dockOpen ? "" : "xl:inline"}`}>
              {short}
            </span>
          ) : null}
        </>
      }
    />
  );
}
