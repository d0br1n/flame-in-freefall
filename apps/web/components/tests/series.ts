// The fill class of each chart series. The colours are tokens in app/globals.css
// (--color-series-*, steps of the blue scale; "other" is the control grey); the class names are written out in full so Tailwind generates them.
const FILL: Record<number, string> = {
  1: "fill-series-1",
  2: "fill-series-2",
  3: "fill-series-3",
  4: "fill-series-4",
  5: "fill-series-5",
  6: "fill-series-6",
  7: "fill-series-7",
  8: "fill-series-8",
};

export function seriesFill(slot: number | null): string {
  return (slot !== null && FILL[slot]) || "fill-series-other";
}
