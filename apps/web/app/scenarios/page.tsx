import type { Metadata } from "next";
import { ScenariosIndex } from "@/components/scenarios/ScenariosIndex";

export const metadata: Metadata = { title: "Scenarios" };

export default function ScenariosPage() {
  return <ScenariosIndex />;
}
