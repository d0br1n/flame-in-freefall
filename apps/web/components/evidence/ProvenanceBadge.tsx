// The provenance badge: the same on every page (DESIGN.md, "measured and computed look
// different"). Words, a mark and a border style per tag (lib/provenance.ts); colour only adds.
import { provenanceStyle, type ProvenanceBorder, type ProvenanceTone } from "@/lib/provenance";

const TONE: Record<ProvenanceTone, string> = {
  measured: "border-prov-measured bg-prov-measured-wash text-prov-measured",
  nasa: "border-prov-nasa bg-prov-nasa-wash text-prov-nasa",
  computed: "border-prov-computed bg-prov-computed-wash text-prov-computed",
};

const BORDER: Record<ProvenanceBorder, string> = {
  solid: "border border-solid",
  double: "border-[3px] border-double",
  dashed: "border border-dashed",
  dotted: "border-2 border-dotted",
};

/** An inline SVG mark in one stroke weight. Decorative: the words carry the meaning. */
export function Mark({ path, className = "" }: { path: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={path} />
    </svg>
  );
}

export function ProvenanceBadge({ tag }: { tag: string }) {
  const style = provenanceStyle(tag);
  return (
    <span
      data-testid="provenance-badge"
      data-provenance={tag}
      title={style.meaning}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-sm px-1.5 py-px text-[0.875rem] leading-tight ${TONE[style.tone]} ${BORDER[style.border]}`}
    >
      <Mark path={style.mark} />
      {style.label}
    </span>
  );
}
