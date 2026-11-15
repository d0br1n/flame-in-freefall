import type { Metadata } from "next";
import { LimitationsView } from "@/components/limits/LimitationsView";

export const metadata: Metadata = { title: "Limitations" };

export default function LimitationsPage() {
  return <LimitationsView />;
}
