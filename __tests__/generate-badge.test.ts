/**
 * Tests for scripts/generate-badge.ts
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  generateBadgeSvg,
  extractData,
  fmtTokens,
  fmtDollars,
  fmtCalls,
  rightLabel,
  PRICING,
  costFor,
  type BadgeOptions,
} from "../scripts/generate-badge.ts";
import type { StatsFile } from "../servers/_stats.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(
  calls: number,
  tokensSaved: number,
  byDay: Record<string, { calls: number; tokensSaved: number }> = {},
): StatsFile {
  return {
    schemaVersion: 2,
    sessions: {},
    lifetime: { calls, tokensSaved, byTool: {}, byDay },
  };
}

const DEFAULT_OPTS: BadgeOptions = { metric: "tokens", style: "pill", window: "lifetime" };

// ---------------------------------------------------------------------------
// Valid SVG structure
// ---------------------------------------------------------------------------

describe("generateBadgeSvg — valid SVG structure", () => {
  test("starts with <svg and ends with </svg>", () => {
    const svg = generateBadgeSvg(makeStats(10, 3_400_000), DEFAULT_OPTS);
    expect(svg.trimStart()).toMatch(/^<svg /);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });

  test("contains the formatted token number", () => {
    const svg = generateBadgeSvg(makeStats(10, 3_400_000), DEFAULT_OPTS);
    expect(svg).toContain("3.4M tokens");
  });

  test("contains 'ashlr' brand label", () => {
    const svg = generateBadgeSvg(makeStats(10, 1_000), DEFAULT_OPTS);
    expect(svg).toContain("ashlr");
  });

  test("no external resource URLs in output (xmlns namespace URI is allowed)", () => {
    const svg = generateBadgeSvg(makeStats(100, 5_000_000), DEFAULT_OPTS);
    // Strip the standard SVG namespace declaration before checking —
    // xmlns="http://www.w3.org/2000/svg" is a namespace, not an external resource.
    const stripped = svg.replace(/xmlns="[^"]*"/g, "");
    expect(stripped).not.toContain("http://");
    expect(stripped).not.toContain("https://");
  });
});

// ---------------------------------------------------------------------------
// Placeholder when stats missing
// ---------------------------------------------------------------------------

describe("generateBadgeSvg — missing stats", () => {
  test("null stats → placeholder pill badge", () => {
    const svg = generateBadgeSvg(null, DEFAULT_OPTS);
    expect(svg.trimStart()).toMatch(/^<svg /);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
    expect(svg).toContain("no data yet");
  });

  test("zero-calls stats → no data yet", () => {
    const svg = generateBadgeSvg(makeStats(0, 0), DEFAULT_OPTS);
    expect(svg).toContain("no data yet");
  });

  test("placeholder has no external URLs", () => {
    const svg = generateBadgeSvg(null, DEFAULT_OPTS);
    const stripped = svg.replace(/xmlns="[^"]*"/g, "");
    expect(stripped).not.toContain("http://");
  });
});

// ---------------------------------------------------------------------------
// Metric: dollars
// ---------------------------------------------------------------------------

describe("dollars metric", () => {
  test("uses PRICING['sonnet-4.5'] input rate", () => {
    // 1M tokens × $3.00/M = $3.00
    const tokens = 1_000_000;
    const cost = costFor(tokens, "sonnet-4.5");
    expect(cost).toBeCloseTo(3.0, 4);
    expect(PRICING["sonnet-4.5"]!.input).toBe(3.0);
  });

  test("badge right cell contains '$' sign", () => {
    const svg = generateBadgeSvg(
      makeStats(5, 2_000_000),
      { ...DEFAULT_OPTS, metric: "dollars" },
    );
    expect(svg).toContain("$");
  });

  test("fmtDollars for 0 tokens produces small dollar string", () => {
    expect(fmtDollars(0)).toMatch(/^\$0/);
  });

  test("fmtDollars for 1M tokens = $3.00 saved", () => {
    expect(fmtDollars(1_000_000)).toBe("$3.00 saved");
  });
});

// ---------------------------------------------------------------------------
// Metric: calls
// ---------------------------------------------------------------------------

describe("calls metric", () => {
  test("badge right cell shows formatted calls", () => {
    const svg = generateBadgeSvg(
      makeStats(1_100, 500_000),
      { ...DEFAULT_OPTS, metric: "calls" },
    );
    expect(svg).toContain("1.1K calls");
  });

  test("fmtCalls < 1000 — no K suffix", () => {
    expect(fmtCalls(42)).toBe("42 calls");
  });

  test("fmtCalls ≥ 1000 — K suffix", () => {
    expect(fmtCalls(2500)).toBe("2.5K calls");
  });
});

// ---------------------------------------------------------------------------
// Style: card
// ---------------------------------------------------------------------------

describe("card style", () => {
  test("card width attribute is 240", () => {
    const svg = generateBadgeSvg(
      makeStats(10, 3_000_000),
      { ...DEFAULT_OPTS, style: "card" },
    );
    expect(svg).toContain('width="240"');
  });

  test("card height attribute is 80", () => {
    const svg = generateBadgeSvg(
      makeStats(10, 3_000_000),
      { ...DEFAULT_OPTS, style: "card" },
    );
    expect(svg).toContain('height="80"');
  });

  test("pill width is narrower than card (240)", () => {
    const stats = makeStats(10, 3_000_000);
    const pill = generateBadgeSvg(stats, { ...DEFAULT_OPTS, style: "pill" });
    // pill width extracted
    const m = pill.match(/width="(\d+)"/);
    expect(m).not.toBeNull();
    const pillW = parseInt(m![1], 10);
    expect(pillW).toBeLessThan(240);
  });

  test("card has no external URLs", () => {
    const svg = generateBadgeSvg(makeStats(10, 5_000_000), { ...DEFAULT_OPTS, style: "card" });
    const stripped = svg.replace(/xmlns="[^"]*"/g, "");
    expect(stripped).not.toContain("http://");
  });
});

// ---------------------------------------------------------------------------
// Style: flat
// ---------------------------------------------------------------------------

describe("flat style", () => {
  test("flat badge is valid SVG", () => {
    const svg = generateBadgeSvg(makeStats(5, 1_000), { ...DEFAULT_OPTS, style: "flat" });
    expect(svg.trimStart()).toMatch(/^<svg /);
    expect(svg.trimEnd()).toMatch(/<\/svg>$/);
  });
});

// ---------------------------------------------------------------------------
// Window filtering
// ---------------------------------------------------------------------------

describe("window filtering — extractData", () => {
  function dayStr(daysBack: number): string {
    const d = new Date(Date.now() - daysBack * 86_400_000);
    return d.toISOString().slice(0, 10);
  }

  test("last7 includes day 3, excludes day 10", () => {
    const stats = makeStats(20, 5000, {
      [dayStr(3)]:  { calls: 5,  tokensSaved: 1000 },
      [dayStr(10)]: { calls: 15, tokensSaved: 4000 },
    });
    const data = extractData(stats, "last7");
    expect(data.tokens).toBe(1000);
    expect(data.calls).toBe(5);
  });

  test("last30 includes day 10, excludes day 40", () => {
    const stats = makeStats(20, 5000, {
      [dayStr(10)]: { calls: 5,  tokensSaved: 1000 },
      [dayStr(40)]: { calls: 15, tokensSaved: 4000 },
    });
    const data = extractData(stats, "last30");
    expect(data.tokens).toBe(1000);
    expect(data.calls).toBe(5);
  });

  test("lifetime returns all tokens regardless of date", () => {
    const stats = makeStats(20, 5000, {
      [dayStr(100)]: { calls: 20, tokensSaved: 5000 },
    });
    const data = extractData(stats, "lifetime");
    expect(data.tokens).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// --out flag: write to file
// ---------------------------------------------------------------------------

describe("--out file writing", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), "badge-test-"));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  test("generateBadgeSvg output can be written and re-read correctly", async () => {
    const outPath = join(tmp, "test.svg");
    const svg = generateBadgeSvg(makeStats(5, 1_500_000), DEFAULT_OPTS);
    await writeFile(outPath, svg, "utf8");
    const read = await readFile(outPath, "utf8");
    expect(read).toBe(svg);
    expect(read).toContain("1.5M tokens");
  });
});

// ---------------------------------------------------------------------------
// fmtTokens
// ---------------------------------------------------------------------------

describe("fmtTokens", () => {
  test("below 1K — plain number", () => {
    expect(fmtTokens(500)).toBe("500 tokens");
  });

  test("1K–999K — K suffix", () => {
    expect(fmtTokens(3400)).toBe("3.4K tokens");
  });

  test("≥ 1M — M suffix", () => {
    expect(fmtTokens(3_400_000)).toBe("3.4M tokens");
  });
});
