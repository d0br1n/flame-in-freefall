import type { Metadata } from "next";
import { Artemis2Scenario } from "@/components/scenarios/Artemis2Scenario";

export const metadata: Metadata = { title: "Artemis II, 2026" };

export default function Artemis2Page() {
  return <Artemis2Scenario />;
}
