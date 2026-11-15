// The comparisons the Compare page offers as one-click starts, shared with scripts/snapshot.mjs so
// each one is also saved for the site's fallback copy. Pairs that the challenge text and the
// analyses make natural: FLEX against FLEX-2 (the same droplet rig, single fuels against mixtures),
// the two BASS solids campaigns, and FLEX against CFI (the two droplet tables of the Suppression page).
// Code generated with SI assistance (Claude Code), reviewed by the team.

/** @type {readonly { ids: readonly string[]; label: string }[]} */
export const COMPARE_STARTS = [
  { ids: ["PSI-69", "PSI-68"], label: "FLEX and FLEX-2" },
  { ids: ["PSI-25", "PSI-26"], label: "BASS-II and BASS" },
  { ids: ["PSI-69", "PSI-39"], label: "FLEX and CFI" },
];

/** @param {readonly string[]} ids */
export function comparePath(ids) {
  return `/catalog/compare?ids=${ids.map(encodeURIComponent).join(",")}`;
}
