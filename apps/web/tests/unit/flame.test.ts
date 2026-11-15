// Tests for lib/flame.ts (Linear DOB-142): the rules that turn one mixture's predicted share
// burned into the animated droplet flame. The picture must end exactly at the prediction.
// Code generated with SI assistance (Claude Code), reviewed by the team.
import { describe, expect, it } from "vitest";
import {
  FADE_SECONDS,
  FULL_BURN_SECONDS,
  HOLD_SECONDS,
  IGNITE_SECONDS,
  MIN_BURN_SECONDS,
  burnSeconds,
  cycleSeconds,
  diameterRatio,
  fitRadius,
  frameAt,
  heat,
  restFrame,
  shareAt,
  tauFor,
} from "@/lib/flame";

describe("droplet size", () => {
  it("inverts the engine's rule share = 1 - (diameter left / start)^3", () => {
    for (const share of [0, 0.1, 0.5, 0.798, 1]) {
      expect(1 - diameterRatio(share) ** 3).toBeCloseTo(share, 10);
    }
    expect(diameterRatio(0)).toBe(1);
    expect(diameterRatio(1)).toBe(0);
  });

  it("keeps a share outside 0 to 1 inside it", () => {
    expect(diameterRatio(-0.2)).toBe(1);
    expect(diameterRatio(1.4)).toBe(0);
  });
});

describe("illustration time", () => {
  it("burns by the d-squared law: the square of the diameter falls in a straight line", () => {
    for (const tau of [0, 0.25, 0.5, 0.75, 1]) {
      expect(diameterRatio(shareAt(tau)) ** 2).toBeCloseTo(1 - tau, 10);
    }
  });

  it("finds the moment a share is reached", () => {
    for (const share of [0.02, 0.26, 0.55, 0.9]) expect(shareAt(tauFor(share))).toBeCloseTo(share, 10);
  });

  it("lets a flame that goes out sooner burn for a shorter time", () => {
    expect(burnSeconds(0.26)).toBeLessThan(burnSeconds(0.8));
    expect(burnSeconds(1)).toBeCloseTo(FULL_BURN_SECONDS, 10);
    expect(burnSeconds(0.001)).toBe(MIN_BURN_SECONDS);
  });
});

describe("the picture over one loop", () => {
  const share = 0.55;
  const burning = burnSeconds(share);

  it("starts unburned and lights up", () => {
    const first = frameAt(0, share);
    expect(first).toMatchObject({ phase: "igniting", share: 0, ratio: 1, flame: 0 });
    expect(frameAt(IGNITE_SECONDS / 2, share).flame).toBeGreaterThan(0);
  });

  it("burns up to the prediction and never past it", () => {
    let last = 0;
    for (let t = IGNITE_SECONDS; t < IGNITE_SECONDS + burning; t += 0.05) {
      const frame = frameAt(t, share);
      expect(frame.phase).toBe("burning");
      expect(frame.flame).toBe(1);
      expect(frame.share).toBeGreaterThanOrEqual(last);
      expect(frame.share).toBeLessThanOrEqual(share);
      last = frame.share;
    }
    expect(frameAt(IGNITE_SECONDS + burning - 1e-6, share).share).toBeCloseTo(share, 4);
  });

  it("goes out at the prediction and leaves the droplet that size", () => {
    const going = frameAt(IGNITE_SECONDS + burning + FADE_SECONDS / 2, share);
    expect(going.phase).toBe("going-out");
    expect(going.share).toBe(share);
    expect(going.flame).toBeGreaterThan(0);
    expect(going.flame).toBeLessThan(1);
    const out = frameAt(IGNITE_SECONDS + burning + FADE_SECONDS + HOLD_SECONDS / 2, share);
    expect(out).toMatchObject({ phase: "out", share, flame: 0 });
    expect(out.ratio).toBeCloseTo(diameterRatio(share), 10);
  });

  it("loops", () => {
    expect(cycleSeconds(share)).toBeCloseTo(IGNITE_SECONDS + burning + FADE_SECONDS + HOLD_SECONDS, 10);
    expect(frameAt(cycleSeconds(share) + 0.1, share).phase).toBe(frameAt(0.1, share).phase);
    expect(frameAt(cycleSeconds(share) + 0.1, share).flame).toBeCloseTo(frameAt(0.1, share).flame, 8);
  });

  it("burns the whole droplet when the prediction is 100%", () => {
    const out = frameAt(IGNITE_SECONDS + FULL_BURN_SECONDS + FADE_SECONDS + 0.1, 1);
    expect(out).toMatchObject({ phase: "out", share: 1, ratio: 0 });
  });

  it("has a still picture for reduced motion: the flame out, the droplet left", () => {
    expect(restFrame(share)).toMatchObject({ phase: "out", share, flame: 0 });
    expect(restFrame(share).ratio).toBeCloseTo(diameterRatio(share), 10);
  });
});

describe("flame radius in the stage (DOB-146)", () => {
  it("keeps the wanted radius when there is room", () => {
    expect(fitRadius(80, 170, 130, 284)).toBe(80);
  });

  it("cuts it to the room around the centre", () => {
    expect(fitRadius(200, 170, 130, 284)).toBe(120);
    expect(fitRadius(200, 60, 130, 284)).toBe(50);
  });

  it("is never negative, even when the stage is hidden and has no width", () => {
    expect(fitRadius(80, -44, 130, 284)).toBe(0);
    expect(fitRadius(80, 0, 130, 284)).toBe(0);
  });
});

describe("brightness", () => {
  it("places a temperature between the coldest and hottest mixture", () => {
    expect(heat(1800, 1800, 2800)).toBe(0);
    expect(heat(2800, 1800, 2800)).toBe(1);
    expect(heat(2300, 1800, 2800)).toBeCloseTo(0.5, 10);
    expect(heat(3000, 1800, 2800)).toBe(1);
  });

  it("stays in the middle when the temperature or the range is missing", () => {
    expect(heat(null, 1800, 2800)).toBe(0.5);
    expect(heat(2000, 2000, 2000)).toBe(0.5);
  });
});
