/**
 * Tests for scripts/errors-report.ts
 *
 * All tests use an isolated mkdtemp home; no real ~/.ashlr is touched.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  buildErrorsReport,
  normalizeMessage,
  type ErrorsReportOptions,
} from "../scripts/errors-report";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let home: string;
let ashlrDir: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "ashlr-errors-report-"));
  ashlrDir = join(home, ".ashlr");
  await mkdir(ashlrDir, { recursive: true });
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function opts(extra: Partial<ErrorsReportOptions> = {}): ErrorsReportOptions {
  return { home, now: Date.now(), ...extra };
}

function tsNow(offsetMs = 0): string {
  return new Date(Date.now() + offsetMs).toISOString().replace("T", " ").slice(0, 23);
}

function logLine(level: "ERROR" | "WARNING", message: string, offsetMs = 0): string {
  return `${tsNow(offsetMs)} ${level} ashlr ${message}`;
}

async function writeLog(lines: string[]): Promise<void> {
  await writeFile(join(ashlrDir, "ashlr.log"), lines.join("\n") + "\n");
}

async function writeSessionLog(records: object[]): Promise<void> {
  await writeFile(
    join(ashlrDir, "session-log.jsonl"),
    records.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
}

// ---------------------------------------------------------------------------
// normalizeMessage
// ---------------------------------------------------------------------------

describe("normalizeMessage", () => {
  test("strips ISO timestamps", () => {
    const sig = normalizeMessage("Error at 2026-04-17T10:23:45.123Z in handler");
    expect(sig).not.toContain("2026");
    expect(sig).toContain("<ts>");
  });

  test("strips absolute paths", () => {
    const sig = normalizeMessage("ENOENT: no such file /home/user/.ashlr/stats.json");
    expect(sig).not.toContain("/home/user");
    expect(sig).toContain("<path>");
  });

  test("strips PIDs and large numbers", () => {
    const sig = normalizeMessage("process 98765 crashed with signal 9");
    expect(sig).not.toContain("98765");
    // normalizeMessage lowercases output — token is <n>
    expect(sig).toContain("<n>");
  });

  test("strips UUIDs or their hex components", () => {
    const sig = normalizeMessage("session 550e8400-e29b-41d4-a716-446655440000 not found");
    // The UUID is stripped either as <uuid> or broken down into <hex>/<ts> tokens —
    // either way the raw hex is gone and "not found" is preserved.
    expect(sig).not.toContain("550e8400-e29b-41d4");
    expect(sig).toContain("not found");
  });

  test("strips hex hashes", () => {
    const sig = normalizeMessage("cache miss for abcdef1234567890");
    expect(sig).not.toContain("abcdef1234567890");
    expect(sig).toContain("<hex>");
  });

  test("strips IP addresses", () => {
    const sig = normalizeMessage("connection refused 127.0.0.1:1234");
    expect(sig).not.toContain("127.0.0.1");
    expect(sig).toContain("<ip>");
  });

  test("deduplicates identical normalized messages", () => {
    const a = normalizeMessage("Error at 2026-01-01T00:00:00Z in /home/a/file.ts");
    const b = normalizeMessage("Error at 2026-02-15T12:30:00Z in /home/b/other.ts");
    expect(a).toEqual(b);
  });

  test("preserves meaningful text", () => {
    const sig = normalizeMessage("ENOENT: no such file or directory");
    expect(sig).toContain("enoent");
    expect(sig).toContain("no such file or directory");
  });
});

// ---------------------------------------------------------------------------
// No log files
// ---------------------------------------------------------------------------

describe("missing log files", () => {
  test("returns no-errors message when ~/.ashlr does not exist", () => {
    // Use a completely non-existent home
    const out = buildErrorsReport({ home: join(home, "nonexistent"), now: Date.now() });
    expect(out).toContain("no errors recorded");
  });

  test("returns no-errors message when ashlr.log is absent", async () => {
    // ashlrDir exists but log file does not
    const out = buildErrorsReport(opts());
    expect(out).toContain("no errors recorded");
  });

  test("no-errors output does not contain emoji", async () => {
    const out = buildErrorsReport(opts());
    // No emoji — just the plain text variant
    expect(out).not.toMatch(/[\u{1F300}-\u{1FFFF}]/u);
  });
});

// ---------------------------------------------------------------------------
// Log parsing and window filtering
// ---------------------------------------------------------------------------

describe("log parsing", () => {
  test("counts errors within window", async () => {
    await writeLog([
      logLine("ERROR", "something failed"),
      logLine("ERROR", "another failure"),
    ]);
    const out = buildErrorsReport(opts());
    expect(out).toContain("total errors");
    expect(out).toMatch(/total errors\s+2/);
  });

  test("ignores INFO lines", async () => {
    await writeLog([
      `${tsNow()} INFO ashlr routine message`,
      logLine("ERROR", "real error"),
    ]);
    const out = buildErrorsReport(opts());
    expect(out).toMatch(/total errors\s+1/);
  });

  test("includes WARNING lines", async () => {
    await writeLog([logLine("WARNING", "disk space low")]);
    const out = buildErrorsReport(opts());
    expect(out).toMatch(/total errors\s+1/);
  });

  test("strips ANSI codes from log lines", async () => {
    await writeLog([
      `${tsNow()} \x1b[33mWARNING\x1b[0m ashlr disk usage high`,
    ]);
    const out = buildErrorsReport(opts());
    expect(out).toMatch(/total errors\s+1/);
  });

  test("excludes errors outside the window", async () => {
    const twoWeeksAgo = tsNow(-14 * 24 * 3600 * 1000);
    await writeLog([
      `${twoWeeksAgo} ERROR ashlr old error`,
      logLine("ERROR", "recent error"),
    ]);
    // Default 168h window — old error is 336h ago, should be excluded.
    const out = buildErrorsReport(opts());
    expect(out).toMatch(/total errors\s+1/);
  });

  test("--hours narrows the window", async () => {
    await writeLog([
      logLine("ERROR", "recent error"),
      logLine("ERROR", "another recent error", -2 * 3600 * 1000),
    ]);
    // 1-hour window — only the first line qualifies (offset 0)
    const out = buildErrorsReport(opts({ hours: 1 }));
    expect(out).toMatch(/total errors\s+1/);
  });

  test("reads rotated .1 log file", async () => {
    // Write the main log (empty) and .1 with errors
    await writeLog([]);
    await writeFile(
      join(ashlrDir, "ashlr.log.1"),
      logLine("ERROR", "error from rotated log") + "\n",
    );
    const out = buildErrorsReport(opts());
    expect(out).toMatch(/total errors\s+1/);
  });
});

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

describe("deduplication", () => {
  test("groups identical normalized messages into one signature", async () => {
    await writeLog([
      logLine("ERROR", "ENOENT: no such file /home/a/stats.json"),
      logLine("ERROR", "ENOENT: no such file /home/b/other.json", -60000),
    ]);
    const out = buildErrorsReport(opts());
    // 2 total errors, 1 unique signature
    expect(out).toMatch(/total errors\s+2/);
    expect(out).toMatch(/unique signatures\s+1/);
  });

  test("keeps distinct messages as separate signatures", async () => {
    await writeLog([
      logLine("ERROR", "ENOENT: no such file /x/stats.json"),
      logLine("ERROR", "connection refused to localhost"),
    ]);
    const out = buildErrorsReport(opts());
    expect(out).toMatch(/unique signatures\s+2/);
  });

  test("shows count next to top signature", async () => {
    const lines = Array.from({ length: 5 }, (_, i) =>
      logLine("ERROR", `ENOENT: no such file /path${i}/f.json`, -i * 1000),
    );
    await writeLog(lines);
    const out = buildErrorsReport(opts());
    expect(out).toMatch(/5x/);
  });
});

// ---------------------------------------------------------------------------
// Session-log tool_error events
// ---------------------------------------------------------------------------

describe("session-log tool_error events", () => {
  test("counts tool_error events in per-tool breakdown", async () => {
    await writeSessionLog([
      { ts: new Date().toISOString(), event: "tool_error", tool: "ashlr__read", error: "timeout" },
      { ts: new Date().toISOString(), event: "tool_error", tool: "ashlr__grep", error: "no match" },
      { ts: new Date().toISOString(), event: "tool_error", tool: "ashlr__read", error: "timeout" },
    ]);
    const out = buildErrorsReport(opts());
    // Tool breakdown section should appear
    expect(out).toContain("ashlr__read");
    expect(out).toContain("ashlr__grep");
  });

  test("ignores non-tool_error session-log events", async () => {
    await writeSessionLog([
      { ts: new Date().toISOString(), event: "tool_call", tool: "ashlr__read" },
      { ts: new Date().toISOString(), event: "session_end", tool: "ashlr__session" },
    ]);
    const out = buildErrorsReport(opts());
    expect(out).toContain("no errors recorded");
  });

  test("tolerates missing or malformed session-log", async () => {
    await writeFile(join(ashlrDir, "session-log.jsonl"), "not json\n{broken\n");
    // Should not throw
    expect(() => buildErrorsReport(opts())).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Output rendering
// ---------------------------------------------------------------------------

describe("report rendering", () => {
  test("shows time range when errors exist", async () => {
    await writeLog([logLine("ERROR", "boom")]);
    const out = buildErrorsReport(opts());
    expect(out).toContain("UTC");
    expect(out).toMatch(/from|to/i);
  });

  test("report includes window hours in header", async () => {
    const out = buildErrorsReport(opts({ hours: 48 }));
    expect(out).toContain("48h");
  });

  test("exits cleanly with no errors message (zero-error path)", async () => {
    const out = buildErrorsReport(opts());
    expect(out).toContain("no errors recorded");
    expect(out).toContain("168h");
  });

  test("report always contains rule separators", async () => {
    await writeLog([logLine("ERROR", "something broke")]);
    const out = buildErrorsReport(opts());
    expect(out).toContain("─");
  });
});
