import type { Metadata } from "next";
import { InvestigationView } from "@/components/investigations/InvestigationView";

// The data loads in the browser (InvestigationView, through lib/api.ts). Props typed by hand:
// CI runs tsc without Next's generated route types.
type Props = { params: Promise<{ psiId: string }> };

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { psiId } = await params;
  return { title: decode(psiId) };
}

export default async function InvestigationPage({ params }: Props) {
  const { psiId } = await params;
  return <InvestigationView psiId={decode(psiId)} />;
}
