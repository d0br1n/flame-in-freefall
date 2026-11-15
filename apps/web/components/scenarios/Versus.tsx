"use client";

// The "versus" block of a scenario page: what happened on the left, what burnrate would have
// shown on the right, a VS mark between them. The rows appear one after another when the block
// scrolls into view (reduced motion: all at once). Each side keeps its own sources.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface VersusSide {
  kicker: string;
  headline: ReactNode;
  rows: ReactNode[];
  footer?: ReactNode;
}

function reducedMotion(): boolean {
  return typeof window === "undefined" || !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** True once the element has been on screen (or at once without IntersectionObserver). */
function useSeen<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node || reducedMotion() || typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, seen];
}

function Side({ side, tone, seen, offset }: { side: VersusSide; tone: "then" | "burnrate"; seen: boolean; offset: number }) {
  const then = tone === "then";
  return (
    <section
      data-testid={then ? "versus-then" : "versus-burnrate"}
      className={`relative flex flex-col gap-4 overflow-hidden rounded-xl p-6 sm:p-7 ${
        then ? "bg-[#14090a] text-[#f6e9e6] ring-1 ring-[#5a1d14]" : "bg-[#070d24] text-[#e8edff] ring-1 ring-[#2a3f9e]"
      }`}
    >
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute -top-24 h-64 w-64 rounded-full blur-3xl ${then ? "-left-20 bg-[#c4320a]/35" : "-right-20 bg-[#3b5bff]/40"}`}
      />
      <p className={`relative text-[13px] font-semibold tracking-[0.14em] uppercase ${then ? "text-[#ff9b85]" : "text-[#9fb3ff]"}`}>{side.kicker}</p>
      <h3 className="relative font-display text-[24px] leading-[30px] font-semibold tracking-[-0.02em]">{side.headline}</h3>
      <ol className="relative grid gap-3">
        {side.rows.map((row, index) => (
          <li
            key={index}
            style={{ transitionDelay: seen ? `${offset + index * 450}ms` : "0ms" }}
            className={`flex gap-3 text-[16px] leading-[24px] transition-all duration-700 ease-out ${seen ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`}
          >
            <span aria-hidden="true" className={`mt-[9px] h-2 w-2 shrink-0 rounded-full ${then ? "bg-[#ff6a4d]" : "bg-[#7d95ff]"}`} />
            <span>{row}</span>
          </li>
        ))}
      </ol>
      {side.footer ? <div className={`relative mt-auto pt-2 text-[14px] ${then ? "text-[#d9bdb6]" : "text-[#bcc8f5]"}`}>{side.footer}</div> : null}
    </section>
  );
}

export function Versus({ then, burnrate, testId = "versus" }: { then: VersusSide; burnrate: VersusSide; testId?: string }) {
  const [ref, seen] = useSeen<HTMLDivElement>();
  const thenDelay = 0;
  const burnrateDelay = 300 + then.rows.length * 450;
  return (
    <div ref={ref} data-testid={testId} className="relative grid gap-4 md:grid-cols-2 md:gap-6">
      <Side side={then} tone="then" seen={seen} offset={thenDelay} />
      <div
        aria-hidden="true"
        className={`absolute top-1/2 left-1/2 z-10 hidden h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-ink font-display text-[18px] font-bold text-surface shadow-lg ring-4 ring-surface transition-all duration-500 md:flex ${
          seen ? "scale-100 opacity-100" : "scale-50 opacity-0"
        }`}
        style={{ transitionDelay: seen ? `${burnrateDelay - 300}ms` : "0ms" }}
      >
        VS
      </div>
      <p aria-hidden="true" className="text-center font-display text-[18px] font-bold text-ink md:hidden">
        VS
      </p>
      <Side side={burnrate} tone="burnrate" seen={seen} offset={burnrateDelay} />
    </div>
  );
}

/** A source link styled for the dark versus panels. */
export function VersusSource({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="font-mono text-[13px] text-inherit underline decoration-dotted underline-offset-[3px] hover:decoration-solid">
      {children}
    </a>
  );
}
