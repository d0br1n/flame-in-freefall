import type { Metadata } from "next";
import { Suspense } from "react";
import { Loading } from "@/components/LoadStates";
import { TestsExplorer } from "@/components/tests/TestsExplorer";

export const metadata: Metadata = { title: "Tests" };

export default function TestsPage() {
  return (
    <div className="mx-auto w-full max-w-[90rem]">
      <p data-testid="tests-intro" className="mb-5 max-w-[70ch] text-[16px] text-ink">
        Every NASA flame test in one table: what burned, in what air, and how it ended. NASA publishes them one
        investigation at a time. Here you filter across all of them.
      </p>
      <Suspense fallback={<Loading label="Loading the tests…" rows={6} />}>
        <TestsExplorer />
      </Suspense>
    </div>
  );
}
