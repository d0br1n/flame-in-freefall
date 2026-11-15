"use client";

// The dock content of the assistant: the shell's dock container mounts it (the shell owns the
// container, its width and its open state). Keep this export name and props: the shell imports it.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { AssistantPanel } from "./AssistantPanel";

export function AssistantDock({ onClose }: { onClose: () => void }) {
  return <AssistantPanel variant="dock" onClose={onClose} />;
}
