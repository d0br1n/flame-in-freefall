// Loading placeholders in the shape of what is coming: never a blank card, never a spinner.
export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-sm bg-surface-sunk ${className}`} />;
}

/** A few lines of skeleton text inside a card, with a screen reader label. */
export function SkeletonLines({ label, lines = 3 }: { label: string; lines?: number }) {
  const widths = ["w-5/6", "w-2/3", "w-1/2", "w-3/4"];
  return (
    <div role="status" data-testid="loading" className="space-y-2.5">
      <span className="sr-only">{label}</span>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={`h-4 ${widths[index % widths.length]}`} />
      ))}
    </div>
  );
}
