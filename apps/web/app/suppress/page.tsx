import type { Metadata } from "next";
import { PillarPage } from "@/components/pillar/PillarPage";
import { stageLabel } from "@/lib/pillar";

// The "suppress" stage of a fire: the pillar page template filled by the analysis for this stage
// (found from GET /modules). The data loads in the browser.
export const metadata: Metadata = { title: stageLabel("suppress") };

export default function SuppressPage() {
  return <PillarPage stage="suppress" />;
}
