/**
 * Unit tests for the status-line animation primitives.
 *
 * Every function under test is pure (no I/O, no date calls), so assertions
 * are deterministic.
 */

import { describe, expect, test } from "bun:test";

import {
  UNICODE_RAMP,
  ASCII_RAMP,
  computePulse,
  detectCapability,
  frameAt,
  gradientTs,
  lerpColor,
  renderHeartbeat,
  renderSparkline,
  valuesToRamp,
  visibleWidth,
} from "../scripts/ui-animation";

describe("detectCapability", () => {
  test("NO_COLOR disables truecolor and animation", () => {
    const cap = detectCapability({ NO_COLOR: "1", COLORTERM: "truecolor" });
    expect(cap.truecolor).toBe(false);
    expect(cap.animate).toBe(false);
  });

  test("COLORTERM=truecolor enables animation", () => {
    const cap = detectCapability({ COLORTERM: "truecolor", LANG: "en_US.UTF-8" });
    expect(cap.truecolor).toBe(true);
    expect(cap.animate).toBe(true);
  });

  test("ASHLR_STATUS_ANIMATE=0 kills animation regardless of color", () => {
    const cap = detectCapability({ COLORTERM: "truecolor", ASHLR_STATUS_ANIMATE: "0" });
    expect(cap.animate).toBe(false);
  });

  test("ASHLR_STATUS_ANIMATE=1 forces animation even without truecolor advertise", () => {
    const cap = detectCapability({ ASHLR_STATUS_ANIMATE: "1" });
    expect(cap.animate).toBe(true);
    expect(cap.truecolor).toBe(true); // forceAnimate also enables truecolor emit
  });

  test("unicode detection works via LANG", () => {
    expect(detectCapability({ LANG: "en_US.UTF-8" }).unicode).toBe(true);
    expect(detectCapability({ LANG: "C", TERM: "dumb" }).unicode).toBe(false);
  });
});

describe("frameAt", () => {
  test("monotonically increases across time", () => {
    const a = frameAt(1000, 120);
    const b = frameAt(1000 + 120, 120);
    expect(b).toBe(a + 1);
  });
  test("equal within the same 120ms window", () => {
    // Frame 8 spans [960, 1080); 1000 and 1079 both fall inside it.
    expect(frameAt(1000, 120)).toBe(frameAt(1079, 120));
  });
});

describe("valuesToRamp", () => {
  test("all zeros map to rung 0", () => {
    expect(valuesToRamp([0, 0, 0], UNICODE_RAMP.length)).toEqual([0, 0, 0]);
  });
  test("any positive value maps to at least rung 1", () => {
    const r = valuesToRamp([0, 1, 100], 16);
    expect(r[0]).toBe(0);
    expect(r[1]).toBeGreaterThanOrEqual(1);
    expect(r[2]).toBe(15);
  });
});

describe("gradientTs", () => {
  test("all values are in [0,1]", () => {
    const ts = gradientTs(7, 42);
    for (const t of ts) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(1);
    }
  });
  test("zero width returns empty", () => {
    expect(gradientTs(0, 0)).toEqual([]);
  });
});

describe("computePulse", () => {
  test("idle → intensity 0", () => {
    expect(computePulse(10, 10_000, 7).intensity).toBe(0);
  });
  test("active window → intensity 1", () => {
    expect(computePulse(10, 1000, 7).intensity).toBe(1);
  });
  test("fade window → intensity between 0 and 1", () => {
    const p = computePulse(10, 4250, 7);
    expect(p.intensity).toBeGreaterThan(0);
    expect(p.intensity).toBeLessThan(1);
  });
});

describe("renderSparkline", () => {
  test("7 values + static caps → 7 visible chars, no ANSI", () => {
    const cap = detectCapability({ NO_COLOR: "1" });
    const out = renderSparkline({
      values: [0, 0, 1, 2, 3, 4, 5],
      frame: 0,
      msSinceActive: Number.POSITIVE_INFINITY,
      cap,
    });
    expect(visibleWidth(out)).toBe(7);
    expect(out).not.toMatch(/\x1b\[/);
  });

  test("truecolor + animate → wraps chars in ANSI but keeps visible width", () => {
    const cap = detectCapability({ COLORTERM: "truecolor", LANG: "en_US.UTF-8" });
    const out = renderSparkline({
      values: [1, 1, 1, 1, 1, 1, 1],
      frame: 3,
      msSinceActive: 1000,
      cap,
    });
    expect(out).toMatch(/\x1b\[38;2;/);
    expect(visibleWidth(out)).toBe(7);
  });

  test("width is stable across 60 consecutive frames", () => {
    const cap = detectCapability({ COLORTERM: "truecolor", LANG: "en_US.UTF-8" });
    const values = [0, 1, 2, 3, 4, 5, 6];
    const widths = new Set<number>();
    for (let f = 0; f < 60; f++) {
      const out = renderSparkline({ values, frame: f, msSinceActive: 2000, cap });
      widths.add(visibleWidth(out));
    }
    expect(widths.size).toBe(1);
  });
});

describe("renderHeartbeat", () => {
  test("idle in animation-disabled mode returns a single plain char", () => {
    const cap = detectCapability({ NO_COLOR: "1" });
    const out = renderHeartbeat(0, Number.POSITIVE_INFINITY, cap);
    expect(visibleWidth(out)).toBe(1);
    expect(out).not.toMatch(/\x1b\[/);
  });
  test("active in truecolor mode wraps with ANSI", () => {
    const cap = detectCapability({ COLORTERM: "truecolor", LANG: "en_US.UTF-8" });
    const out = renderHeartbeat(5, 500, cap);
    expect(out).toMatch(/\x1b\[38;2;/);
    expect(visibleWidth(out)).toBe(1);
  });
});

describe("lerpColor", () => {
  test("t=0 returns a, t=1 returns b", () => {
    const a = { r: 0, g: 0, b: 0 };
    const b = { r: 255, g: 255, b: 255 };
    expect(lerpColor(a, b, 0)).toEqual(a);
    expect(lerpColor(a, b, 1)).toEqual(b);
  });
  test("t=0.5 returns midpoint", () => {
    const mid = lerpColor({ r: 0, g: 0, b: 0 }, { r: 100, g: 200, b: 50 }, 0.5);
    expect(mid.r).toBe(50);
    expect(mid.g).toBe(100);
    expect(mid.b).toBe(25);
  });
});

describe("visibleWidth", () => {
  test("strips CSI escapes", () => {
    expect(visibleWidth("\x1b[38;2;0;208;156mX\x1b[0m")).toBe(1);
    expect(visibleWidth("ashlr \x1b[1m·\x1b[0m")).toBe(7);
  });
});

describe("ASCII fallback", () => {
  test("non-unicode capability uses the ASCII ramp", () => {
    const cap = detectCapability({ LANG: "C", TERM: "dumb", NO_COLOR: "1" });
    expect(cap.unicode).toBe(false);
    const out = renderSparkline({ values: [0, 1, 2, 3, 4, 5, 6], frame: 0, msSinceActive: Infinity, cap });
    for (const ch of out) {
      expect(ASCII_RAMP.includes(ch)).toBe(true);
    }
  });
});
