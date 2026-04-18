/**
 * Tests for the grep calibration harness.
 *
 * Covers:
 *   - getCalibrationMultiplier(): absent file → 4, present file → meanRatio,
 *     malformed file → 4
 *   - percentile / mean helpers
 *   - renderReport output shape
 *   - runCalibration: writes calibration.json with correct shape (synthetic
 *     fixture, no real genome required)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  mean,
  percentile,
  renderReport,
  runCalibration,
  syntheticSampleNoGenome,
  syntheticWorkload,
} from "../scripts/calibrate-grep";
import {
  clearCalibrationCache,
  DEFAULT_MULTIPLIER,
  getCalibrationMultiplier,
  type CalibrationFile,
} from "../scripts/read-calibration";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpHome: string;

function calibPath(): string {
  return join(tmpHome, "calibration.json");
}

function writeCalib(data: unknown): void {
  writeFileSync(calibPath(), JSON.stringify(data));
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "ashlr-calib-test-"));
  // Always clear in-process cache before each test so file reads are fresh.
  clearCalibrationCache();
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  clearCalibrationCache();
});

// ---------------------------------------------------------------------------
// getCalibrationMultiplier
// ---------------------------------------------------------------------------

describe("getCalibrationMultiplier", () => {
  test("absent file → DEFAULT_MULTIPLIER (4)", () => {
    const result = getCalibrationMultiplier(calibPath());
    expect(result).toBe(DEFAULT_MULTIPLIER);
    expect(result).toBe(4);
  });

  test("valid file → returns meanRatio", () => {
    writeCalib({
      updatedAt: new Date().toISOString(),
      samples: [],
      meanRatio: 6.7,
      p50: 5.5,
      p90: 9.2,
    } satisfies CalibrationFile);
    const result = getCalibrationMultiplier(calibPath());
    expect(result).toBeCloseTo(6.7);
  });

  test("meanRatio of 1.0 is valid and returned", () => {
    writeCalib({ updatedAt: "2026-01-01T00:00:00Z", samples: [], meanRatio: 1.0, p50: 1.0, p90: 1.0 });
    expect(getCalibrationMultiplier(calibPath())).toBe(1.0);
  });

  test("malformed JSON → DEFAULT_MULTIPLIER", () => {
    writeFileSync(calibPath(), "{ not valid json }}}");
    expect(getCalibrationMultiplier(calibPath())).toBe(DEFAULT_MULTIPLIER);
  });

  test("missing meanRatio field → DEFAULT_MULTIPLIER", () => {
    writeCalib({ updatedAt: "2026-01-01T00:00:00Z", samples: [] });
    expect(getCalibrationMultiplier(calibPath())).toBe(DEFAULT_MULTIPLIER);
  });

  test("meanRatio: null → DEFAULT_MULTIPLIER", () => {
    writeCalib({ updatedAt: "2026-01-01T00:00:00Z", samples: [], meanRatio: null });
    expect(getCalibrationMultiplier(calibPath())).toBe(DEFAULT_MULTIPLIER);
  });

  test("meanRatio: 0 → DEFAULT_MULTIPLIER (non-positive rejected)", () => {
    writeCalib({ updatedAt: "2026-01-01T00:00:00Z", samples: [], meanRatio: 0, p50: 0, p90: 0 });
    expect(getCalibrationMultiplier(calibPath())).toBe(DEFAULT_MULTIPLIER);
  });

  test("meanRatio: -1 → DEFAULT_MULTIPLIER", () => {
    writeCalib({ updatedAt: "2026-01-01T00:00:00Z", samples: [], meanRatio: -1, p50: -1, p90: -1 });
    expect(getCalibrationMultiplier(calibPath())).toBe(DEFAULT_MULTIPLIER);
  });

  test("meanRatio: NaN → DEFAULT_MULTIPLIER", () => {
    // JSON.stringify turns NaN → null, so we write raw JSON
    writeFileSync(calibPath(), '{"updatedAt":"2026-01-01","samples":[],"meanRatio":null,"p50":null,"p90":null}');
    expect(getCalibrationMultiplier(calibPath())).toBe(DEFAULT_MULTIPLIER);
  });

  test("empty file → DEFAULT_MULTIPLIER", () => {
    writeFileSync(calibPath(), "");
    expect(getCalibrationMultiplier(calibPath())).toBe(DEFAULT_MULTIPLIER);
  });
});

// ---------------------------------------------------------------------------
// percentile + mean
// ---------------------------------------------------------------------------

describe("percentile", () => {
  test("empty array → 0", () => {
    expect(percentile([], 50)).toBe(0);
  });

  test("single element", () => {
    expect(percentile([7], 50)).toBe(7);
    expect(percentile([7], 90)).toBe(7);
  });

  test("p50 of sorted array", () => {
    // floor(50/100 * 10) = index 5 → value 6 (0-based floor implementation)
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(6);
  });

  test("p90 of sorted array", () => {
    // floor(90/100 * 10) = index 9 → value 10
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 90)).toBe(10);
  });

  test("p100 is the last element", () => {
    const sorted = [1, 2, 3];
    expect(percentile(sorted, 100)).toBe(3);
  });
});

describe("mean", () => {
  test("empty → 0", () => {
    expect(mean([])).toBe(0);
  });

  test("single value", () => {
    expect(mean([42])).toBe(42);
  });

  test("multiple values", () => {
    expect(mean([2, 4, 6])).toBeCloseTo(4);
  });
});

// ---------------------------------------------------------------------------
// renderReport
// ---------------------------------------------------------------------------

describe("renderReport", () => {
  test("empty samples → fallback message", () => {
    const out = renderReport([], 4, 4, 4, "/tmp/calibration.json");
    expect(out).toContain("No samples");
  });

  test("with samples → shows header, table, aggregates, output path", () => {
    const samples = [
      { cwd: "/a", pattern: "foo", rawBytes: 1000, compressedBytes: 200, ratio: 5.0 },
      { cwd: "/b", pattern: "bar", rawBytes: 2000, compressedBytes: 500, ratio: 4.0 },
    ];
    const out = renderReport(samples, 4.5, 4.5, 5.0, "/tmp/calibration.json");
    expect(out).toContain("ashlr grep calibration report");
    expect(out).toContain("foo");
    expect(out).toContain("bar");
    expect(out).toContain("4.50×");   // mean
    expect(out).toContain("5.00×");   // p90
    expect(out).toContain("/tmp/calibration.json");
    expect(out).toContain("samples   2");
  });
});

// ---------------------------------------------------------------------------
// syntheticWorkload
// ---------------------------------------------------------------------------

describe("syntheticWorkload", () => {
  test("returns at least 5 workloads", () => {
    const wl = syntheticWorkload();
    expect(wl.length).toBeGreaterThanOrEqual(5);
  });

  test("each workload has cwd and pattern strings", () => {
    for (const w of syntheticWorkload()) {
      expect(typeof w.cwd).toBe("string");
      expect(w.cwd.length).toBeGreaterThan(0);
      expect(typeof w.pattern).toBe("string");
      expect(w.pattern.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// syntheticSampleNoGenome
// ---------------------------------------------------------------------------

describe("syntheticSampleNoGenome", () => {
  test("ratio is rawBytes / compressedBytes", () => {
    const s = syntheticSampleNoGenome({ cwd: "/x", pattern: "p" }, 4000);
    expect(s.rawBytes).toBe(4000);
    expect(s.compressedBytes).toBeGreaterThan(0);
    expect(s.ratio).toBeCloseTo(s.rawBytes / s.compressedBytes);
  });

  test("very small rawBytes → compressedBytes is at least 1", () => {
    const s = syntheticSampleNoGenome({ cwd: "/x", pattern: "p" }, 1);
    expect(s.compressedBytes).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// runCalibration integration (synthetic, no genome)
// ---------------------------------------------------------------------------

describe("runCalibration (synthetic fixture)", () => {
  test("writes calibration.json with correct shape", async () => {
    const outPath = join(tmpHome, "calibration.json");
    const result = await runCalibration({ outPath });

    expect(typeof result.updatedAt).toBe("string");
    expect(Array.isArray(result.samples)).toBe(true);
    expect(typeof result.meanRatio).toBe("number");
    expect(typeof result.p50).toBe("number");
    expect(typeof result.p90).toBe("number");
    // meanRatio must be positive (either empirical or fallback 4 when rg absent)
    expect(result.meanRatio).toBeGreaterThan(0);
  }, 30_000);

  test("written file is readable by getCalibrationMultiplier", async () => {
    const outPath = join(tmpHome, "calibration.json");
    const result = await runCalibration({ outPath });

    const { existsSync } = await import("fs");
    expect(existsSync(outPath)).toBe(true);

    clearCalibrationCache();
    const multiplier = getCalibrationMultiplier(outPath);
    expect(multiplier).toBeCloseTo(result.meanRatio);
  }, 30_000);

  test("custom outPath is respected — does not write to default location", async () => {
    const outPath = join(tmpHome, "custom-calib.json");
    await runCalibration({ outPath });

    const { existsSync } = await import("fs");
    expect(existsSync(outPath)).toBe(true);
    // The default calibration.json should not have been written
    expect(existsSync(join(tmpHome, "calibration.json"))).toBe(false);
  }, 30_000);

  test("samples array (when rg available) has required fields", async () => {
    const outPath = join(tmpHome, "calibration.json");
    const result = await runCalibration({ outPath });

    // rg may not be available in the test sandbox — skip field checks when
    // no samples were collected (that case is covered by the shape test above).
    if (result.samples.length === 0) return;

    for (const s of result.samples) {
      expect(typeof s.cwd).toBe("string");
      expect(typeof s.pattern).toBe("string");
      expect(typeof s.rawBytes).toBe("number");
      expect(typeof s.compressedBytes).toBe("number");
      expect(typeof s.ratio).toBe("number");
      expect(s.rawBytes).toBeGreaterThan(0);
      expect(s.compressedBytes).toBeGreaterThan(0);
      expect(s.ratio).toBeGreaterThan(0);
    }
  }, 30_000);
});
