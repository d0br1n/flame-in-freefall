import type { Metadata } from "next";
import { SpreadTestPage } from "@/components/spread/SpreadTestPage";

// One BASS-II test of the Video to Data page on its own address: /spread/B1 (DOB-156). The data
// loads in the browser (SpreadTestPage, through lib/api.ts). Props typed by hand: CI runs tsc
// without Next's generated route types.
type Props = { params: Promise<{ test: string }> };

function decode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { test } = await params;
  return { title: `Test ${decode(test)}` };
}

export default async function SpreadTestRoute({ params }: Props) {
  const { test } = await params;
  return <SpreadTestPage name={decode(test)} />;
}
