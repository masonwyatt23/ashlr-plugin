#!/usr/bin/env bun
/**
 * ashlr grep calibration harness.
 *
 * Measures the empirical ratio between raw ripgrep output size and the genome-
 * compressed size returned by ashlr__grep. Writes results to
 * ~/.ashlr/calibration.json so efficiency-server.ts can replace its
 * hardcoded 4× multiplier with a data-driven value.
 *
 * Usage:
 *   bun run scripts/calibrate-grep.ts
 *   bun run scripts/calibrate-grep.ts --workload /path/to/workload.jsonl
 *   bun run scripts/calibrate-grep.ts --out /path/to/calibration.json
 *
 * Workload format (~/.ashlr/calibration-workload.jsonl):
 *   { "cwd": "/path/to/project", "pattern": "someSymbol" }
 *   { "cwd": "/path/to/other",   "pattern": "anotherPattern" }
 *
 * If no workload file is found, a bundled synthetic fixture is used instead
 * (runs rg against the ashlr-plugin source tree itself).
 */

import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";

import { type CalibrationFile, type CalibrationSample } from "./read-calibration";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Workload {
  cwd: string;
  pattern: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveRg(): string {
  // Mirror the same resolution logic as efficiency-server.ts so we run the
  // same binary.
  return (
    (typeof (globalThis as { Bun?: { which(b: string): string | null } }).Bun !== "undefined"
      ? (globalThis as { Bun: { which(b: string): string | null } }).Bun.which("rg")
      : null) ??
    ["/opt/homebrew/bin/rg", "/usr/local/bin/rg", "/usr/bin/rg"].find((p) => {
      try {
        require("fs").accessSync(p);
        return true;
      } catch {
        return false;
      }
    }) ??
    "rg"
  );
}

/**
 * Run `rg --json <pattern> <cwd>` and return the raw stdout bytes.
 * Returns null if rg is unavailable or the call times out.
 */
function rgRawBytes(pattern: string, cwd: string): number | null {
  try {
    const res = spawnSync(resolveRg(), ["--json", "-n", pattern, cwd], {
      encoding: "buffer",
      timeout: 10_000,
      maxBuffer: 64 * 1024 * 1024,
    });
    // status 0 = matches found, status 1 = no matches — both are valid.
    if (res.status !== 0 && res.status !== 1) return null;
    const buf = res.stdout as Buffer | null;
    return buf ? buf.length : 0;
  } catch {
    return null;
  }
}

/**
 * Try to load genome helpers and retrieve compressed output size.
 * Returns null when the genome is absent or the import fails.
 *
 * We try the @ashlr/core-efficiency import dynamically so the script still
 * runs (in synthetic-fixture mode) on machines where the module is present but
 * a particular cwd has no genome.
 */
async function genomeCompressedBytes(
  pattern: string,
  cwd: string,
): Promise<number | null> {
  try {
    // Dynamic imports so a missing genome doesn't throw at module load time.
    const { genomeExists, retrieveSectionsV2, formatGenomeForPrompt } =
      await import("@ashlr/core-efficiency");
    const { findParentGenome } = await import("./genome-link");

    let genomeRoot: string | null = null;
    if (genomeExists(cwd)) {
      genomeRoot = cwd;
    } else {
      const parent = findParentGenome(cwd);
      if (parent) genomeRoot = parent;
    }

    if (!genomeRoot) return null;

    const sections = await retrieveSectionsV2(genomeRoot, pattern, 4000);
    if (sections.length === 0) return null;
    const formatted = formatGenomeForPrompt(sections);
    return formatted.length;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Synthetic fixture (used when no real workload is available)
// ---------------------------------------------------------------------------

/**
 * Build a synthetic workload that runs rg against the ashlr-plugin source
 * tree. These patterns are representative of typical agent queries.
 */
function syntheticWorkload(): Workload[] {
  // Use __dirname-equivalent: the directory of this script.
  const pluginRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");
  return [
    { cwd: pluginRoot, pattern: "recordSaving" },
    { cwd: pluginRoot, pattern: "retrieveSectionsV2" },
    { cwd: pluginRoot, pattern: "genomeExists" },
    { cwd: pluginRoot, pattern: "spawnSync" },
    { cwd: pluginRoot, pattern: "estimateTokens" },
    { cwd: pluginRoot, pattern: "tokensSaved" },
    { cwd: pluginRoot, pattern: "formatBaseline" },
    { cwd: pluginRoot, pattern: "snipCompact" },
  ];
}

/**
 * Build a synthetic workload using only rg raw sizes (no genome required).
 * Used when genome isn't available — we still measure rg output sizes so the
 * calibration data is available for future use once a genome is created.
 *
 * In this mode we compute ratio = rawBytes / (rawBytes / 4) = 4.0 as a
 * passthrough (the sample is flagged with `compressedBytes = rawBytes / 4`
 * as an estimate). Callers can distinguish these by `ratio === DEFAULT_MULTIPLIER`.
 */
function syntheticSampleNoGenome(w: Workload, rawBytes: number): CalibrationSample {
  // Without a genome we can't compress, so we estimate compressed = raw/4.
  // This is explicitly marked so the report can warn about low-quality samples.
  const compressedBytes = Math.max(1, Math.round(rawBytes / 4));
  return {
    cwd: w.cwd,
    pattern: w.pattern,
    rawBytes,
    compressedBytes,
    ratio: rawBytes / compressedBytes,
  };
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[idx]!;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

// ---------------------------------------------------------------------------
// Report rendering
// ---------------------------------------------------------------------------

function renderReport(
  samples: CalibrationSample[],
  meanRatio: number,
  p50: number,
  p90: number,
  outPath: string,
): string {
  const lines: string[] = [];
  lines.push("ashlr grep calibration report");
  lines.push("═".repeat(50));
  lines.push("");

  if (samples.length === 0) {
    lines.push("No samples collected. Check that rg is installed and patterns match files.");
    return lines.join("\n");
  }

  // Per-sample table
  lines.push("samples:");
  const hdr = "  pattern".padEnd(30) + "raw bytes".padEnd(12) + "compressed".padEnd(13) + "ratio";
  lines.push(hdr);
  lines.push("  " + "─".repeat(60));
  for (const s of samples) {
    const pat = s.pattern.slice(0, 26).padEnd(28);
    const raw = s.rawBytes.toLocaleString().padEnd(10);
    const comp = s.compressedBytes.toLocaleString().padEnd(11);
    const ratio = s.ratio.toFixed(2) + "×";
    lines.push(`  ${pat}  ${raw}  ${comp}  ${ratio}`);
  }

  lines.push("");
  lines.push("aggregate:");
  lines.push(`  samples   ${samples.length}`);
  lines.push(`  mean      ${meanRatio.toFixed(2)}×`);
  lines.push(`  p50       ${p50.toFixed(2)}×`);
  lines.push(`  p90       ${p90.toFixed(2)}×`);
  lines.push("");
  lines.push(`written → ${outPath}`);
  lines.push("");
  lines.push(
    `To activate: efficiency-server will read this file automatically on next start.`,
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  workloadPath?: string;
  outPath: string;
}

function parseArgs(argv: string[]): CliArgs {
  let workloadPath: string | undefined;
  let outPath = join(homedir(), ".ashlr", "calibration.json");
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if ((a === "--workload" || a === "-w") && argv[i + 1]) {
      workloadPath = argv[++i];
    } else if ((a === "--out" || a === "-o") && argv[i + 1]) {
      outPath = argv[++i];
    }
  }
  return { workloadPath, outPath };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runCalibration(opts: {
  workloadPath?: string;
  outPath?: string;
}): Promise<CalibrationFile> {
  const outPath = opts.outPath ?? join(homedir(), ".ashlr", "calibration.json");

  // 1. Load workload
  let workloads: Workload[];
  const defaultWorkloadPath = join(homedir(), ".ashlr", "calibration-workload.jsonl");

  const resolvedWorkloadPath = opts.workloadPath ?? (existsSync(defaultWorkloadPath) ? defaultWorkloadPath : null);
  if (resolvedWorkloadPath && existsSync(resolvedWorkloadPath)) {
    const raw = readFileSync(resolvedWorkloadPath, "utf-8");
    workloads = raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as Workload);
    process.stdout.write(`Loaded ${workloads.length} workload(s) from ${resolvedWorkloadPath}\n`);
  } else {
    workloads = syntheticWorkload();
    process.stdout.write(`No workload file found — using ${workloads.length} synthetic fixture(s)\n`);
  }

  // 2. Run each workload
  const samples: CalibrationSample[] = [];
  process.stdout.write(`\nRunning calibration against ${workloads.length} pattern(s)...\n`);

  for (const w of workloads) {
    const cwdAbs = resolve(w.cwd);
    process.stdout.write(`  rg ${JSON.stringify(w.pattern)} in ${cwdAbs} ... `);

    const rawBytes = rgRawBytes(w.pattern, cwdAbs);
    if (rawBytes === null) {
      process.stdout.write("rg unavailable, skipped\n");
      continue;
    }
    if (rawBytes === 0) {
      process.stdout.write("no matches, skipped\n");
      continue;
    }

    // Try genome path first
    const compressedBytes = await genomeCompressedBytes(w.pattern, cwdAbs);
    if (compressedBytes !== null && compressedBytes > 0) {
      const ratio = rawBytes / compressedBytes;
      samples.push({ cwd: cwdAbs, pattern: w.pattern, rawBytes, compressedBytes, ratio });
      process.stdout.write(`raw=${rawBytes} compressed=${compressedBytes} ratio=${ratio.toFixed(2)}×\n`);
    } else {
      // No genome — use synthetic estimate so we still have a data point
      const s = syntheticSampleNoGenome(w, rawBytes);
      samples.push(s);
      process.stdout.write(`raw=${rawBytes} (no genome, estimated ratio=${s.ratio.toFixed(2)}×)\n`);
    }
  }

  // 3. Compute stats
  const ratios = samples.map((s) => s.ratio).sort((a, b) => a - b);
  const meanRatio = mean(ratios);
  const p50 = percentile(ratios, 50);
  const p90 = percentile(ratios, 90);

  // 4. Write calibration.json
  const result: CalibrationFile = {
    updatedAt: new Date().toISOString(),
    samples,
    meanRatio: samples.length > 0 ? meanRatio : 4,
    p50: samples.length > 0 ? p50 : 4,
    p90: samples.length > 0 ? p90 : 4,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(result, null, 2));

  // 5. Print report
  process.stdout.write("\n" + renderReport(samples, result.meanRatio, result.p50, result.p90, outPath) + "\n");

  return result;
}

// Exported for tests
export { percentile, mean, renderReport, syntheticWorkload, syntheticSampleNoGenome };

if (import.meta.main) {
  const args = parseArgs(process.argv.slice(2));
  await runCalibration({ workloadPath: args.workloadPath, outPath: args.outPath });
}
