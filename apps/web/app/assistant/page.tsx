import type { Metadata } from "next";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { PageTitle } from "@/components/shell/ShellState";

export const metadata: Metadata = { title: "Assistant" };

// The assistant full width: the same panel as the dock, sharing one conversation through the
// AssistantProvider mounted in app/layout.tsx.
export default function AssistantPage() {
  return (
    <div className="mx-auto flex w-full max-w-[52rem] flex-1 flex-col">
      <PageTitle title="Assistant" />
      <p className="mb-6 max-w-[70ch] text-[16px] text-ink">NASA built its combustion archive to be downloaded. Here you can ask it a question.</p>
      <div className="flex h-[70vh] min-h-[32rem] flex-col overflow-hidden rounded-xl border border-line bg-surface">
        <AssistantPanel variant="page" />
      </div>
    </div>
  );
}
