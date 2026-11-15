import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareView } from "@/components/compare/CompareView";
import { Loading } from "@/components/LoadStates";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <Suspense fallback={<Loading label="Loading the comparison…" rows={6} />}>
      <CompareView />
    </Suspense>
  );
}
