import { Suspense } from "react";
import { OverviewView } from "@/components/home/OverviewView";
import { Loading } from "@/components/LoadStates";

// The Overview (DESIGN.md, "Overview"): the cabin air, what ran in it, the three stages of a
// fire, the flame map and the top of the ranking. The data loads in the browser
// (components/home/OverviewView.tsx); this file holds the words that do not depend on data.

export default function OverviewPage() {
  return (
    <Suspense fallback={<Loading label="Loading the overview for the chosen cabin air…" rows={3} />}>
      <OverviewView />
    </Suspense>
  );
}
