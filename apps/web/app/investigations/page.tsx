import type { Metadata } from "next";
import { Suspense } from "react";
import { InvestigationsSections } from "@/components/investigations/InvestigationsSections";
import { Loading } from "@/components/LoadStates";

export const metadata: Metadata = { title: "Investigations" };

export default function InvestigationsPage() {
  return (
    <div className="mx-auto w-full max-w-[90rem]">
      <Suspense fallback={<Loading label="Loading the investigations…" rows={6} />}>
        <InvestigationsSections />
      </Suspense>
    </div>
  );
}
