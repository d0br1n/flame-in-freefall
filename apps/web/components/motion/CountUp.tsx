"use client";

// A number that counts up to its value once, when it first appears (redesign motion language).
// The final value is in the DOM from the first render for screen readers and copy-paste; only
// the painted digits animate. Reduced motion, or no requestAnimationFrame: the value at once.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useEffect, useState } from "react";

function reducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function CountUp({ value, duration = 1100, format = (n: number) => Math.round(n).toLocaleString("en-US"), className = "" }: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const [shown, setShown] = useState<number | null>(null);
  useEffect(() => {
    if (reducedMotion() || typeof requestAnimationFrame === "undefined") return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(t >= 1 ? null : value * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return (
    <span className={`tabular-nums ${className}`}>
      <span aria-hidden="true">{format(shown ?? value)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  );
}
