# Notes for published.csv (DOB-30)

Source: NASA/TM-20210011385, "Burning and Suppression of Solids-II (BASS-II) Summary Report"
(PSI-25, file `PSI-25_Reports_BASS-II Summary Report.pdf`, 144 PDF pages; printed page number =
PDF page minus 8), and the PSI-25 ReadMe. Read by SI (Claude Code) on 2026-11-14 and checked
quote by quote against the extracted text; a human should spot-check the rows marked `inferred`.

## What the report does and does not publish

* **No per-test spread-rate table exists.** Table A.1 (pp.103-104) lists conditions and a short
  free-text observation per B-series test, with no rate. Spread rates appear only in the text of
  Section 2.1 and 2.3 and as curves in Figures 2.3, 2.19-2.21 and (T-series) 7.4.
* So the only published rate that can be tied to a downloaded gate-slice test is **2.2 mm/s for the
  first test of Section 2.1.2.1, matched to B1 by its Table A.1 note** (row PUB-01, `inferred`).
* B4 (300 um), B5 (200 um) and B6 (100 um) have **no published rate**. B6 has an outcome only.
* The thickness-level statement "highest spread rate about 2.2 mm/s at 100 um" (PUB-02) is a group
  value, not a test value.
* The T-series (fabric, concurrent flow) has per-test **outcomes** in Table 7.1 (quenched, blow-off,
  no ignition, no blowoff) and a quenching range of 1 to 5 cm/s, but its steady spread rates are
  only in Figure 7.4. Nothing is read off a figure.

## Claim not confirmed

The issue text says thin PMMA spreads "near 2 mm/s on runs B1, B4, B5, B6 (Carmignani dissertation)".
That dissertation is not in PSI-25 and was not opened, so no row uses it. It also sits badly with
the report itself: Section 2.1.2.1 (p.13) says the maximum spread rate "was found to be inversely
proportional to fuel thickness", and B4 is 300 um and B5 is 200 um against 100 um for B1. Expect B4
and B5 to spread more slowly than B1. Do not use "all four near 2 mm/s" as a check until the
source is read. The same goes for "quench below about 2 cm/s": the report gives about 1 cm/s for
thin PMMA at 21% O2 (PUB-05, PUB-06) and 2.6 to 4 cm/s near 16% O2 (PUB-08, PUB-09).

## Sample widths (needed for the pixel scale)

* B-series: 100 to 400 um PMMA film, **1 cm or 2 cm wide** per test (Table A.1; text p.13 "1- and
  2-cm-wide thin films"). The flow tunnel is a 76 mm square duct; samples are "20 mm wide and about
  95 mm long" (p.37). Check the width column per test before computing a scale.
* T-series: SIBAL fabric (75% cotton, 25% fiberglass), about 0.32 mm thick, **1.2 cm or 2.2 cm
  wide, 10 cm exposed length**, in a 7.6 by 7.6 cm duct (p.94).

## How the fan steps were run

* Each B-series test starts with a steady flame in forced flow, then the flow is reduced in steps
  (p.13). In Table A.1 the steps are the fan potentiometer settings and the air display values,
  for example B6 "0.9, 1.3, 2.75" with air display "3, 5, approaching 10" cm/s.
* ReadMe: the fan display is the fan voltage times 10 on the video overlay (maximum 122, that is
  12.2 V); the pot setting 10 is maximum; the air display is the duct flow speed in cm/s but its
  response time is about one minute, so it is only steady after long holds. Flow restrictors 0, 1,
  2 run from highest flow (least restriction) to lowest flow (most restriction).
* The report says the flow calibration at very low speed has high error bars and that the time lag
  between reducing the fan and the flame feeling it is unknown (p.13).
* Video display dates are one day later than the real date (leap-year clock error, ReadMe).

## Independent check, 14 Nov 2026 (evening)

A second SI reader (a Claude Sonnet subagent, run by Claude Code for the team) read all 144 pages of
NASA/TM-20210011385 from NTRS (https://ntrs.nasa.gov/api/citations/20210011385/downloads/TM-20210011385.pdf)
and compared every row of `published.csv`. Result: all 32 rows' quotes, values, units and printed pages
were confirmed; Tables 2.1, A.1 and 7.1 were also read from page images. A human should still spot-check
the rows marked `inferred`.

Corrections made after that check (both verified again in the PDF text layer):
* PUB-12, PUB-13, PUB-14: the test date is 2014-02-19 (Table A.1 reads "2/19/2014, GMT 2014"), not 2019.
* PUB-27: Table 7.1 also lists GMT131-T10 (a BASS test), so the bare id T10 is ambiguous; the note now says
  which one the row means.

Reported by the reader but not re-checked here: in PUB-09's note, B14 is a weak candidate for the "about 16%
O2" test (Table A.1 gives it 14.1 uncalibrated, 15.0 calibrated, against 16.5 to 16.6 for B17 and B18).
PUB-01's match to B1 is sound but still an inference: the report never names the test, and the link rests on
the free-text note in Table A.1 (the only B-series row that mentions turning the flow off).
