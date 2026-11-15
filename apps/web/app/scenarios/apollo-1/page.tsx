import type { Metadata } from "next";
import { Apollo1Scenario } from "@/components/scenarios/Apollo1Scenario";

export const metadata: Metadata = { title: "Apollo 1, 1967" };

export default function Apollo1Page() {
  return <Apollo1Scenario />;
}
