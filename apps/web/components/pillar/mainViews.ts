// The views an analysis registers for its pillar page (DOB-74), by module id. The page shows one
// section at a time (DOB-127): an analysis's lead sections come first, then its main view, then
// the sections every analysis has (findings, evidence, checks and sources). An analysis with no
// entry here gets the generic evidence table. video-to-data has a main view: the list of BASS-II
// tests (components/spread, DOB-86). flame-temperature has four lead sections: the test bench.
import type { ComponentType } from "react";
import { SpreadView } from "@/components/spread/SpreadView";
import type { EngineModule, Evidence, Finding } from "@/lib/types";
import { BenchMixture, BenchNeverTested, BenchTested, BenchWhatWorks } from "@/components/suppress/SuppressBench";

export interface MainViewProps {
  module: EngineModule;
  evidence: Evidence[];
  findings: Finding[];
}

/** A lead section loads its own files, so it does not wait for the evidence records. */
export type LeadViewProps = Pick<MainViewProps, "module" | "findings">;

export interface LeadSection {
  /** The address fragment: /suppress#mixture. */
  id: string;
  label: string;
  /** Older fragments that open this section. */
  aliases?: readonly string[];
  View: ComponentType<LeadViewProps>;
}

/** The section that holds an analysis's main view. */
export const MAIN_SECTION = { id: "tests", label: "Tests" } as const;

export const MAIN_VIEWS: Partial<Record<string, ComponentType<MainViewProps>>> = {
  "video-to-data": SpreadView,
};

/**
 * Sections of an analysis's own, listed first (the evidence section then shows the generic
 * evidence table). The suppression test bench is one: the plain answer opens the page (DOB-140).
 */
export const LEAD_SECTIONS: Partial<Record<string, readonly LeadSection[]>> = {
  "flame-temperature": [
    { id: "what-works", label: "What works", View: BenchWhatWorks },
    { id: "mixture", label: "Try a mixture", aliases: ["bench"], View: BenchMixture },
    { id: "tested", label: "What was tested", View: BenchTested },
    { id: "never-tested", label: "Never tested", View: BenchNeverTested },
  ],
};
