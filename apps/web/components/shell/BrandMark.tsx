// The burnrate mark: a ball between two square brackets. A flame in freefall burns as a ball; the
// brackets wrap it the way code wraps a value. Shape source: the spherical flame of PSI-23 ACME
// s-Flame. The mark was designed by the team with SI assistance (design hand-over in design/, rules
// in DESIGN.md, disclosed in submission/SI_USAGE.md). Never add a flame tongue, an orbit swoosh,
// stars, a chevron or anything like a NASA insignia; never stretch, rotate or add a glow.
//
// Built on a 32-unit grid. Brackets: 21 units tall (y 5.5 to 26.5), outer edges at x 4.5 and 27.5,
// arms 4.5 units long, square line ends. Ring radius 5.5, dot radius 2, all centred on 16,16.
// The 4.5-unit margin around the brackets is the clear space (one bracket arm), so the viewBox
// already carries it. At 24 px and below the ring and dot merge into one solid ball and the
// brackets thicken, so the mark still reads as [ • ].

export type BrandMarkVariant = "paper" | "band" | "ink";

const LARGE = {
  stroke: 2.5,
  // Centre lines of the strokes: outer edge plus half the stroke width.
  left: "M9 6.75H5.75V25.25H9",
  right: "M23 6.75H26.25V25.25H23",
};

const SMALL = {
  stroke: 3,
  left: "M9 7H6V25H9",
  right: "M23 7H26V25H23",
};

/** Tailwind classes per colourway (tokens in app/globals.css). */
const COLOURS: Record<BrandMarkVariant, { brackets: string; ringFill: string; ringEdge: string; dot: string; ball: string }> = {
  // The app colourway (mockup 14 November 2026): brackets in ink, ring brand-soft with a brand
  // edge, dot in brand. Follows the day and night themes through the tokens.
  paper: { brackets: "stroke-ink", ringFill: "fill-brand-soft", ringEdge: "stroke-brand", dot: "fill-brand", ball: "fill-brand" },
  // Kept for old callers: the same as paper since the header band is gone.
  band: { brackets: "stroke-ink", ringFill: "fill-brand-soft", ringEdge: "stroke-brand", dot: "fill-brand", ball: "fill-brand" },
  // Ink only: everything in ink, the ring left open.
  ink: { brackets: "stroke-ink", ringFill: "fill-none", ringEdge: "stroke-ink", dot: "fill-ink", ball: "fill-ink" },
};

export function BrandMark({
  variant = "paper",
  size = 32,
  title,
  className = "",
}: {
  variant?: BrandMarkVariant;
  /** Rendered width and height in px. 24 and below draws the small form. */
  size?: number;
  /** A text alternative, only when the mark stands alone. Next to the wordmark, leave it out. */
  title?: string;
  className?: string;
}) {
  const small = size <= 24;
  const shape = small ? SMALL : LARGE;
  const colour = COLOURS[variant];
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      className={`shrink-0 ${className}`}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true, focusable: "false" })}
    >
      <path d={shape.left} className={colour.brackets} strokeWidth={shape.stroke} strokeLinecap="butt" strokeLinejoin="miter" />
      <path d={shape.right} className={colour.brackets} strokeWidth={shape.stroke} strokeLinecap="butt" strokeLinejoin="miter" />
      {small ? (
        <circle cx="16" cy="16" r="4.5" className={colour.ball} />
      ) : (
        <>
          <circle cx="16" cy="16" r="5.5" className={`${colour.ringFill} ${colour.ringEdge}`} strokeWidth={1.5} />
          <circle cx="16" cy="16" r="2" className={colour.dot} />
        </>
      )}
    </svg>
  );
}
