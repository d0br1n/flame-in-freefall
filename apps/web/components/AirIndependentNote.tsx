// One quiet line for pages whose data does not depend on the chosen cabin air (DOB-84), so a
// visitor who changed the air in the header knows why nothing on the page moved.
export function AirIndependentNote({ className = "" }: { className?: string }) {
  return (
    <p data-testid="air-independent" className={`text-[14px] text-ink-2 ${className}`}>
      The list is the same for every cabin air.
    </p>
  );
}
