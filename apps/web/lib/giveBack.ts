// "What we give back" on the About page (DOB-160): problems the team hit in the PSI files, so the
// next reader does not lose the same time. Each line restates a row of submission/PSI_DATA_NOTE.md
// (drafted from docs/PSI_VERIFICATION_REPORT.md section 4); `proof` holds the words of that note
// the line rests on, and tests/unit/give-back.test.ts checks they are still in the note.

export interface Pitfall {
  psiId: string;
  /** The investigation and the file, as a reader would look for them. */
  where: string;
  text: string;
  /** Exact words of the note that back the line. */
  proof: readonly string[];
}

export const PITFALLS: readonly Pitfall[] = [
  {
    psiId: "PSI-69",
    where: "FLEX, experimental table",
    text: "The file is Windows-1252, not UTF-8. Read as UTF-8 it stops at byte 0x96; read as Windows-1252 it gives 274 rows.",
    proof: ["Windows-1252, not UTF-8", "0x96", "274 rows"],
  },
  {
    psiId: "PSI-69",
    where: "FLEX, same table",
    text: "Test 114 has an ambient pressure of 0 mmHg, which looks like a data-entry error. This site flags that test as suspect.",
    proof: ["FLEX test 114", "= 0", "data-entry error"],
  },
  {
    psiId: "PSI-159",
    where: "ACME CFI-G, inverse-flame table",
    text: "861 empty lines at the end of the file: 1,016 lines for 154 rows.",
    proof: ["861 empty lines", "1,016 lines for 154 rows"],
  },
  {
    psiId: "PSI-100",
    where: "SAFFIRE-III, telemetry",
    text: "When a sensor is off the file holds placeholder values instead of blanks (radiometers about −4002, fan tachometer 77938), and the last rows have garbage relative times.",
    proof: ["Placeholder values instead of blanks", "−4002", "77938", "garbage relative times"],
  },
  {
    psiId: "PSI-101",
    where: "SAME-R, housekeeping file",
    text: "A second header line sits at line 6 of the file.",
    proof: ["A second header line at line 6"],
  },
];

/** How many points the full note lists (the About page shows the five that cost the most time). */
export const NOTE_POINTS = 9;
