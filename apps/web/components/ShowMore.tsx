"use client";

import { useId, useState } from "react";
import { cutText } from "@/lib/format";

/**
 * NASA's own words, set in the serif as a quotation. Long text is collapsed with "Show more".
 * Line breaks of the source are kept.
 */
export function QuotedText({ text, limit = 520 }: { text: string; limit?: number }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const short = cutText(text, limit);
  return (
    <div>
      <blockquote id={id} className="max-w-[70ch] whitespace-pre-line font-serif text-[1.0625rem] leading-relaxed text-ink">
        {open || short === null ? text : short}
      </blockquote>
      {short !== null ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex min-h-11 items-center text-[0.875rem] font-medium text-accent underline underline-offset-[3px] hover:text-accent-hover"
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
