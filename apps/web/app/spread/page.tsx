import type { Metadata } from "next";
import { PillarPage } from "@/components/pillar/PillarPage";
import { stageLabel } from "@/lib/pillar";

// The "spread" stage of a fire: the pillar page template filled by the analysis for this stage
// (found from GET /modules). The data loads in the browser.
export const metadata: Metadata = { title: stageLabel("spread") };

export default function SpreadPage() {
  return <PillarPage stage="spread" />;
}
