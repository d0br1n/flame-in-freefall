# Code generated with SI assistance (Claude Code), reviewed by the team.
"""Test outcome from flame events and FAN changes: the rule behind outcome_check.csv (DOB-44).

WHEN THIS RULE WAS WRITTEN. Before any of the 11 T-series videos was viewed or run through the
tracker or the overlay reader. It was not changed afterwards to make the result agree with
NASA's table. If it is ever changed, outcome_check.csv must be re-made and the change said.

WHOSE RULE IT IS. The team's own, not NASA's and not a published method. NASA's Summary Report
(NASA/TM-20210011385, Section 7.1.4, printed pp.95 to 100) does not define the table words by a
formula. It describes them like this (all T'ien tests: SIBAL cotton-fiberglass fabric,
concurrent flow, flow changed by hand during a test):

  * Quenched: the flow is turned down and the flame shrinks until it is out ("Flow speed was
    decreased to 2.2 cm/s incrementally after ignition", "The size of the flame continues to
    shrink until extinction is reached. This is typical in a quenching extinction sequence",
    p.98).
  * No ignition: "three nonignited tests" (p.95).
  * Blow-off: one test where the flow was turned up (Table 7.1 gives "11 to 47" cm/s) and
    the flame went out; "No blowoff" is a test where the flow was turned up (for example "10 to
    29") and the flame was still there.

This module turns that into five labels from only three kinds of input: was a flame found, did
it go out before the usable video ended, and what did the FAN dial do around the extinction.

LABELS
  no_ignition  no flame, or one shorter than ``min_flame_s``, in a video watched for at least
               ``min_watch_s``.
  quench       flame found, went out, and the last sustained FAN change before the flame went
               out (no earlier than ignition, no more than ``max_gap_s`` before it) was a fall.
  blow_off     same, but that last change was a rise.
  no_blow_off  flame found, still there at the end of the usable video (censored), and a
               sustained FAN rise happened after ignition.
  cannot_tell  anything else. The reason says which input was absent or ambiguous. The rule
               never guesses: a flame that outlives the video after only falls, a flame that
               goes out with no FAN change, a gap that is too long, an extinction within
               ``end_margin_s`` of the end of the usable video, a flame found less than
               ``min_flame_s`` before the end, or a video too short to call "no ignition" all
               end here.

FAN is the setting of the fan dial shown on screen, a number from the overlay reader. Only the
DIRECTION of its change is used (up = more flow requested, down = less); it is never turned
into an air speed here, and the fan-to-flow link is not checked (the flow lags the dial, and
the report says the delay is unknown).

LIMITS
  * It cannot tell a flame that went out from one that left the video or turned too dim for the
    brightness tracker; the extinction time is when the tracker lost it.
  * It uses only the direction and timing of FAN changes, not their size.
  * Every default below is a team choice, written down so a reader can change it.
"""
from typing import NamedTuple, Optional, Sequence, Tuple

LABELS = ("no_ignition", "quench", "blow_off", "no_blow_off", "cannot_tell")


class Outcome(NamedTuple):
    label: str
    reason: str


def classify_outcome(
    ignition_time_s: Optional[float],
    extinction_time_s: Optional[float],
    censored: bool,
    track_end_s: Optional[float],
    fan_changes: Sequence[Tuple[float, float, float]],
    min_flame_s: float = 2.0,
    min_watch_s: float = 20.0,
    max_gap_s: float = 60.0,
    end_margin_s: float = 1.0,
    min_fan_step: float = 1.0,
) -> Outcome:
    """Classify one test. Returns ``Outcome(label, reason)``; ``label`` is in ``LABELS``.

    ignition_time_s       time the tracker found a sustained flame, or None if it found none.
    extinction_time_s     time the flame was gone for good, or None.
    censored              True when the flame was still present at the end of the usable video.
    track_end_s           end of the usable video in seconds (before any camera playback
                          screen), or None if not known.
    fan_changes           sustained FAN changes ``(time_s, from, to)`` from the overlay reader.
    min_flame_s           shortest flame that counts as ignition (default 2.0 s). Below it the
                          flame is treated as an igniter flash. A team choice made before
                          viewing the videos.
    min_watch_s           shortest video that may be called "no ignition" (default 20.0 s);
                          a shorter one is too short to say nothing would have lit.
    max_gap_s             longest time between the last FAN change and the extinction that
                          still lets the change explain the extinction (default 60.0 s). The
                          report's own example held the final flow for about 30 s (p.98).
    end_margin_s          an extinction closer than this to the end of the usable video is not
                          trusted (default 1.0 s, about the tracker's own hold time).
    min_fan_step          FAN changes smaller than this (in dial units) are ignored (default
                          1.0; the overlay reader already drops 1-unit flicker).
    """
    if track_end_s is None:
        return Outcome("cannot_tell", "the end of the usable video is not known")
    if ignition_time_s is not None and ignition_time_s > track_end_s:
        return Outcome("cannot_tell", "the ignition time is after the end of the usable video")

    # How long did a flame last?
    if ignition_time_s is None:
        flame_s = 0.0
    elif extinction_time_s is not None:
        flame_s = extinction_time_s - ignition_time_s
    elif censored:
        flame_s = track_end_s - ignition_time_s
    else:
        return Outcome("cannot_tell", "a flame was found but neither its extinction nor a censored end was given")

    if flame_s < min_flame_s:
        if ignition_time_s is not None and extinction_time_s is None:
            return Outcome(
                "cannot_tell",
                f"a flame was found less than {min_flame_s:g} s before the end of the usable video",
            )
        if track_end_s < min_watch_s:
            return Outcome(
                "cannot_tell",
                f"no flame of {min_flame_s:g} s or more, but the usable video is only {track_end_s:g} s long",
            )
        return Outcome(
            "no_ignition",
            f"no flame lasting {min_flame_s:g} s or more in {track_end_s:g} s of usable video",
        )

    steps = [
        (t, a, b)
        for (t, a, b) in fan_changes
        if abs(b - a) >= min_fan_step and t >= ignition_time_s
    ]

    if extinction_time_s is None:  # censored: the flame outlived the video
        if any(b > a for (_, a, b) in steps):
            return Outcome("no_blow_off", "the flame was still lit at the end and the FAN dial was turned up after ignition")
        if steps:
            return Outcome("cannot_tell", "the flame was still lit at the end but the FAN dial was only turned down")
        return Outcome("cannot_tell", "the flame was still lit at the end and no FAN change was read after ignition")

    if track_end_s - extinction_time_s < end_margin_s:
        return Outcome(
            "cannot_tell",
            f"the flame went out within {end_margin_s:g} s of the end of the usable video",
        )
    before = [(t, a, b) for (t, a, b) in steps if t <= extinction_time_s]
    if not before:
        return Outcome("cannot_tell", "the flame went out but no FAN change was read between ignition and extinction")
    t, a, b = before[-1]
    gap = extinction_time_s - t
    if gap > max_gap_s:
        return Outcome(
            "cannot_tell",
            f"the last FAN change was {gap:g} s before the flame went out, more than {max_gap_s:g} s",
        )
    if b < a:
        return Outcome("quench", f"the flame went out {gap:g} s after the FAN dial was last turned down")
    return Outcome("blow_off", f"the flame went out {gap:g} s after the FAN dial was last turned up")
