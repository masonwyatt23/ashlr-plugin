/**
 * Unit tests for the confidenceBadge() pure helper in servers/_summarize.ts.
 *
 * Tests cover: tier math, boundary conditions, fellBack/nonZeroExit overrides,
 * output width ≤ 80 chars, empty-string when no compression, escalation hint
 * presence on low tier.
 */

import { describe, expect, test } from "bun:test";
import { confidenceBadge, confidenceTier } from "../servers/_summarize";

describe("confidenceTier", () => {
  test("returns high when output >= 1/3 of raw", () => {
    expect(confidenceTier({ toolName: "t", rawBytes: 900, outputBytes: 300 })).toBe("high");
    expect(confidenceTier({ toolName: "t", rawBytes: 900, outputBytes: 900 })).toBe("high");
    // exactly at boundary: 300/900 = 1/3
    expect(confidenceTier({ toolName: "t", rawBytes: 900, outputBytes: 300 })).toBe("high");
  });

  test("returns medium when output >= 1/8 but < 1/3 of raw", () => {
    // 100/800 = 1/8 exactly → high boundary is 1/3 = 266, so 100 < 266/800? No:
    // 1/3 of 800 = 266.6; 1/8 of 800 = 100. ratio=100/800=0.125 >= 1/8 → medium
    expect(confidenceTier({ toolName: "t", rawBytes: 800, outputBytes: 100 })).toBe("medium");
    // 200/800 = 0.25, between 1/8 and 1/3
    expect(confidenceTier({ toolName: "t", rawBytes: 800, outputBytes: 200 })).toBe("medium");
  });

  test("returns low when output < 1/8 of raw", () => {
    // 99/800 = 0.12375 < 1/8=0.125 → low
    expect(confidenceTier({ toolName: "t", rawBytes: 800, outputBytes: 99 })).toBe("low");
    expect(confidenceTier({ toolName: "t", rawBytes: 10_000, outputBytes: 100 })).toBe("low");
  });

  test("fellBack always → low regardless of ratio", () => {
    expect(confidenceTier({ toolName: "t", rawBytes: 100, outputBytes: 90, fellBack: true })).toBe("low");
    expect(confidenceTier({ toolName: "t", rawBytes: 100, outputBytes: 80, fellBack: true })).toBe("low");
  });

  test("nonZeroExit always → low regardless of ratio", () => {
    expect(confidenceTier({ toolName: "t", rawBytes: 100, outputBytes: 90, nonZeroExit: true })).toBe("low");
  });

  test("rawBytes=0 or outputBytes=0 → high (no compression signal)", () => {
    expect(confidenceTier({ toolName: "t", rawBytes: 0, outputBytes: 0 })).toBe("high");
  });
});

describe("confidenceBadge", () => {
  test("returns empty string when no compression (output >= raw)", () => {
    expect(confidenceBadge({ toolName: "t", rawBytes: 100, outputBytes: 100 })).toBe("");
    expect(confidenceBadge({ toolName: "t", rawBytes: 50, outputBytes: 200 })).toBe("");
  });

  test("returns empty string when rawBytes=0 and fellBack=false", () => {
    expect(confidenceBadge({ toolName: "t", rawBytes: 0, outputBytes: 0 })).toBe("");
  });

  test("returns non-empty when fellBack=true even if output > raw", () => {
    const badge = confidenceBadge({ toolName: "t", rawBytes: 50, outputBytes: 200, fellBack: true });
    expect(badge.length).toBeGreaterThan(0);
  });

  test("returns non-empty when nonZeroExit=true", () => {
    const badge = confidenceBadge({ toolName: "t", rawBytes: 100, outputBytes: 90, nonZeroExit: true });
    expect(badge.length).toBeGreaterThan(0);
  });

  test("badge starts with newline when non-empty", () => {
    const badge = confidenceBadge({ toolName: "t", rawBytes: 1000, outputBytes: 50 });
    expect(badge).toMatch(/^\n/);
  });

  test("content line is ≤ 80 chars", () => {
    const cases = [
      { rawBytes: 1000, outputBytes: 400 },         // high
      { rawBytes: 1000, outputBytes: 100 },          // medium
      { rawBytes: 100_000, outputBytes: 100 },       // low by ratio
      { rawBytes: 100, outputBytes: 90, fellBack: true },  // low by fellBack
      { rawBytes: 100, outputBytes: 90, nonZeroExit: true },
      // Very large KB values that could push width over
      { rawBytes: 99_999_999, outputBytes: 10 },
    ];
    for (const c of cases) {
      const badge = confidenceBadge({ toolName: "ashlr__read", ...c });
      if (badge.length === 0) continue;
      const line = badge.slice(1); // strip leading \n
      expect(line.length).toBeLessThanOrEqual(80);
    }
  });

  test("high tier badge contains 'bypassSummary:true'", () => {
    const badge = confidenceBadge({ toolName: "t", rawBytes: 1000, outputBytes: 400 });
    expect(badge).toContain("bypassSummary:true");
    expect(badge).toContain("high");
  });

  test("medium tier badge contains 'bypassSummary:true'", () => {
    // 200/1000 = 0.2, clearly in the medium band (between 1/8 and 1/3).
    const badge = confidenceBadge({ toolName: "t", rawBytes: 1000, outputBytes: 200 });
    expect(badge).toContain("bypassSummary:true");
    expect(badge).toContain("medium");
  });

  test("low tier badge contains escalation hint", () => {
    const badge = confidenceBadge({ toolName: "t", rawBytes: 10_000, outputBytes: 10 });
    expect(badge).toContain("low");
    expect(badge).toContain("bypassSummary:true");
    expect(badge).toContain("recover fidelity");
  });

  test("low tier from fellBack contains escalation hint", () => {
    const badge = confidenceBadge({ toolName: "t", rawBytes: 100, outputBytes: 90, fellBack: true });
    expect(badge).toContain("low");
    expect(badge).toContain("recover fidelity");
  });

  test("extra tag appears in badge when compression occurred", () => {
    const badge = confidenceBadge({
      toolName: "t",
      rawBytes: 1000,
      outputBytes: 400,
      extra: "mtime=12345",
    });
    expect(badge).toContain("mtime=12345");
  });

  test("tier boundary: exactly 1/3 ratio → high", () => {
    const badge = confidenceBadge({ toolName: "t", rawBytes: 900, outputBytes: 300 });
    expect(badge).toContain("high");
  });

  test("tier boundary: exactly 1/8 ratio → medium", () => {
    const badge = confidenceBadge({ toolName: "t", rawBytes: 800, outputBytes: 100 });
    expect(badge).toContain("medium");
  });

  test("tier boundary: just below 1/8 → low", () => {
    // 99/800 < 1/8
    const badge = confidenceBadge({ toolName: "t", rawBytes: 800, outputBytes: 99 });
    expect(badge).toContain("low");
  });
});
