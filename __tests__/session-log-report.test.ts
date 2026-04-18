/**
 * Tests for scripts/session-log-report.ts
 *
 * All tests use an isolated mkdtemp home; no real ~/.ashlr is touched.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import { buildReport } from "../scripts/session-log-report";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

let home: string;
let logPath: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "ashlr-log-report-"));
  await mkdir(join(home, ".ashlr"), { recursive: true });
  logPath = join(home, ".ashlr", "session-log.jsonl");
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

interface FakeRecord {
  ts?: string;
  agent?: string;
  event?: string;
  tool?: string;
  cwd?: string;
  session?: string;
  input_size?: number;
  output_size?: number;
  // session_end extras
  calls?: number;
  tokens_saved?: number;
  started_at?: string;
  // fallback/escalate/noop extras
  reason?: string;
}

function makeRecord(overrides: FakeRecord = {}): string {
  const base: FakeRecord = {
    ts: new Date().toISOString(),
    agent: "claude-code",
    event: "tool_call",
    tool: "ashlr__read",
    cwd: "/projects/foo",
    session: "sess-abc",
    input_size: 512,
    output_size: 1024,
  };
  return JSON.stringify({ ...base, ...overrides });
}

async function writeLog(records: string[]): Promise<void> {
  await writeFile(logPath, records.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Empty / missing log
// ---------------------------------------------------------------------------

describe("empty / missing log", () => {
  test("no log file → friendly message, exits cleanly", () => {
    const out = buildReport({ home });
    expect(out).toContain("no activity recorded yet");
    expect(out).toContain("ashlr__read");
  });

  test("empty log file → friendly message", async () => {
    await writeFile(logPath, "");
    const out = buildReport({ home });
    expect(out).toContain("no activity recorded yet");
  });

  test("log with only blank lines → friendly message", async () => {
    await writeFile(logPath, "\n\n   \n");
    const out = buildReport({ home });
    expect(out).toContain("no activity recorded yet");
  });
});

// ---------------------------------------------------------------------------
// Malformed lines
// ---------------------------------------------------------------------------

describe("malformed line handling", () => {
  test("malformed lines are skipped silently; valid lines still counted", async () => {
    const records = [
      "not json at all",
      makeRecord({ tool: "ashlr__grep" }),
      '{"broken":',
      makeRecord({ tool: "ashlr__grep" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).not.toContain("no activity recorded yet");
    expect(out).toContain("ashlr__grep");
    expect(out).toContain("2"); // 2 valid records
  });

  test("record missing ts is skipped", async () => {
    const records = [
      JSON.stringify({ event: "tool_call", tool: "ashlr__read" }), // no ts
      makeRecord({ tool: "ashlr__edit" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("ashlr__edit");
  });
});

// ---------------------------------------------------------------------------
// Top-tool ordering
// ---------------------------------------------------------------------------

describe("top-tool ordering", () => {
  test("tools sorted by call count descending", async () => {
    const records = [
      ...Array(10).fill(null).map(() => makeRecord({ tool: "ashlr__read" })),
      ...Array(5).fill(null).map(() => makeRecord({ tool: "ashlr__grep" })),
      ...Array(2).fill(null).map(() => makeRecord({ tool: "ashlr__edit" })),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    const readPos = out.indexOf("ashlr__read");
    const grepPos = out.indexOf("ashlr__grep");
    const editPos = out.indexOf("ashlr__edit");
    expect(readPos).toBeLessThan(grepPos);
    expect(grepPos).toBeLessThan(editPos);
  });

  test("top 10 cap: 11th tool omitted from top-tools section", async () => {
    const tools = Array.from({ length: 11 }, (_, i) => `tool_${i}`);
    const records = tools.flatMap((t, i) =>
      // Give each tool a distinct count so ordering is deterministic.
      Array(11 - i).fill(null).map(() => makeRecord({ tool: t })),
    );
    await writeLog(records);
    const out = buildReport({ home });
    // tool_0 has 11 calls (rank 1), tool_10 has 1 call (rank 11) — should be cut.
    expect(out).toContain("tool_0");
    expect(out).not.toContain("tool_10");
  });
});

// ---------------------------------------------------------------------------
// Median calculation
// ---------------------------------------------------------------------------

describe("median calculation", () => {
  test("0 records → no data message", () => {
    const out = buildReport({ home });
    expect(out).toContain("no activity recorded yet");
  });

  test("1 record → median equals that value", async () => {
    await writeLog([makeRecord({ tool: "ashlr__read", input_size: 2048, output_size: 4096 })]);
    const out = buildReport({ home });
    expect(out).toContain("ashlr__read");
    // 2048 bytes → "2.0K", 4096 → "4.0K"
    expect(out).toContain("2.0K");
    expect(out).toContain("4.0K");
  });

  test("odd count: median is middle value", async () => {
    // input_sizes: 100, 500, 900 → median 500 → "500B"
    const records = [
      makeRecord({ tool: "ashlr__read", input_size: 100 }),
      makeRecord({ tool: "ashlr__read", input_size: 900 }),
      makeRecord({ tool: "ashlr__read", input_size: 500 }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("500B");
  });

  test("even count: median is average of two middle values", async () => {
    // input_sizes: 100, 300, 500, 700 → median = (300+500)/2 = 400 → "400B"
    const records = [
      makeRecord({ tool: "ashlr__grep", input_size: 100 }),
      makeRecord({ tool: "ashlr__grep", input_size: 700 }),
      makeRecord({ tool: "ashlr__grep", input_size: 300 }),
      makeRecord({ tool: "ashlr__grep", input_size: 500 }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("400B");
  });
});

// ---------------------------------------------------------------------------
// Per-project grouping
// ---------------------------------------------------------------------------

describe("per-project grouping", () => {
  test("groups by cwd, shows top 5", async () => {
    const projects = ["/a/alpha", "/b/beta", "/c/gamma", "/d/delta", "/e/epsilon", "/f/zeta"];
    const records = projects.flatMap((cwd, i) =>
      Array(10 - i).fill(null).map(() => makeRecord({ cwd })),
    );
    await writeLog(records);
    const out = buildReport({ home });
    // Top 5 by calls: alpha(10), beta(9), gamma(8), delta(7), epsilon(6)
    expect(out).toContain("alpha");
    expect(out).toContain("beta");
    expect(out).toContain("epsilon");
    // zeta has only 4 calls (rank 6) — should be cut
    expect(out).not.toContain("zeta");
  });

  test("tool variety counts unique tools per project", async () => {
    const records = [
      makeRecord({ cwd: "/p/myproject", tool: "ashlr__read" }),
      makeRecord({ cwd: "/p/myproject", tool: "ashlr__grep" }),
      makeRecord({ cwd: "/p/myproject", tool: "ashlr__read" }), // duplicate — still 2 unique
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("myproject");
    // 3 calls, 2 unique tools
    expect(out).toMatch(/3\s+.*\s+2|myproject.*3.*2/);
  });
});

// ---------------------------------------------------------------------------
// 24h window filtering
// ---------------------------------------------------------------------------

describe("24h window filtering", () => {
  test("old records excluded from window count", async () => {
    const now = Date.now();
    const old = new Date(now - 48 * 60 * 60 * 1000).toISOString(); // 48h ago
    const recent = new Date(now - 1 * 60 * 60 * 1000).toISOString(); // 1h ago
    const records = [
      makeRecord({ ts: old, tool: "ashlr__read" }),
      makeRecord({ ts: old, tool: "ashlr__read" }),
      makeRecord({ ts: recent, tool: "ashlr__grep" }),
    ];
    await writeLog(records);
    const out = buildReport({ home, now });
    // Window (last 24h): 1 call; lifetime: 3 calls
    // The two-column section should show 1 for last-24h and 3 for lifetime
    expect(out).toMatch(/1\s+3|calls.*1.*3/);
  });

  test("injected now controls window boundary", async () => {
    const anchorNow = new Date("2025-06-01T12:00:00Z").getTime();
    const inside = new Date("2025-06-01T01:00:00Z").toISOString(); // 11h before anchorNow
    const outside = new Date("2025-05-30T12:00:00Z").toISOString(); // 2 days before
    const records = [
      makeRecord({ ts: inside, tool: "ashlr__read" }),
      makeRecord({ ts: outside, tool: "ashlr__edit" }),
    ];
    await writeLog(records);
    const out = buildReport({ home, now: anchorNow });
    // ashlr__read is in window, ashlr__edit is outside
    // lifetime=2, window=1
    expect(out).toContain("ashlr__read");
    expect(out).toContain("ashlr__edit");
  });
});

// ---------------------------------------------------------------------------
// Session end rendering
// ---------------------------------------------------------------------------

describe("session_end records", () => {
  test("session_end records within 7 days appear in session summary", async () => {
    const now = Date.now();
    const endedAt = new Date(now - 2 * 60 * 60 * 1000).toISOString();
    const startedAt = new Date(now - 4 * 60 * 60 * 1000).toISOString();
    const records = [
      JSON.stringify({
        ts: endedAt,
        agent: "claude-code",
        event: "session_end",
        tool: "ashlr__session",
        session: "sess-xyz-123456",
        calls: 42,
        tokens_saved: 15000,
        started_at: startedAt,
      }),
    ];
    await writeLog(records);
    const out = buildReport({ home, now });
    expect(out).toContain("sess-xyz");
    expect(out).toContain("42");
    expect(out).toContain("2h"); // ~2h duration
  });

  test("session_end older than 7 days excluded from summary", async () => {
    const now = Date.now();
    const oldEnd = new Date(now - 8 * 24 * 60 * 60 * 1000).toISOString();
    const records = [
      JSON.stringify({
        ts: oldEnd,
        agent: "claude-code",
        event: "session_end",
        tool: "ashlr__session",
        session: "old-session-999",
        calls: 10,
        tokens_saved: 5000,
        started_at: oldEnd,
      }),
    ];
    await writeLog(records);
    const out = buildReport({ home, now });
    expect(out).toContain("no session_end records in last 7 days");
    expect(out).not.toContain("old-session-999");
  });

  test("session_end not counted in tool_call totals", async () => {
    const records = [
      makeRecord({ tool: "ashlr__read" }),
      JSON.stringify({
        ts: new Date().toISOString(),
        agent: "claude-code",
        event: "session_end",
        session: "sess-abc",
        calls: 5,
        tokens_saved: 1000,
        started_at: new Date().toISOString(),
      }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    // Only 1 tool_call record; session_end doesn't inflate total
    expect(out).toMatch(/total tool calls\s+1/);
  });

  test("multiple session_end records sorted most-recent first", async () => {
    const now = Date.now();
    const end1 = new Date(now - 24 * 60 * 60 * 1000).toISOString(); // 1 day ago
    const end2 = new Date(now - 1 * 60 * 60 * 1000).toISOString(); // 1 hour ago
    const records = [
      JSON.stringify({
        ts: end1,
        event: "session_end",
        session: "older-session",
        calls: 5,
        tokens_saved: 1000,
        started_at: end1,
      }),
      JSON.stringify({
        ts: end2,
        event: "session_end",
        session: "newer-session",
        calls: 10,
        tokens_saved: 2000,
        started_at: end2,
      }),
    ];
    await writeLog(records);
    const out = buildReport({ home, now });
    const newerPos = out.indexOf("newer-se");
    const olderPos = out.indexOf("older-se");
    expect(newerPos).toBeLessThan(olderPos);
  });
});

// ---------------------------------------------------------------------------
// Rotated log (.jsonl.1)
// ---------------------------------------------------------------------------

describe("rotated log file", () => {
  test("reads both main and rotated log", async () => {
    const rotatedPath = join(home, ".ashlr", "session-log.jsonl.1");
    await writeFile(rotatedPath, makeRecord({ tool: "ashlr__read", session: "old-sess" }) + "\n");
    await writeLog([makeRecord({ tool: "ashlr__grep", session: "new-sess" })]);
    const out = buildReport({ home });
    expect(out).toContain("ashlr__read");
    expect(out).toContain("ashlr__grep");
    // 2 total calls
    expect(out).toMatch(/total tool calls\s+2/);
  });

  test("missing rotated log is tolerated", async () => {
    await writeLog([makeRecord({ tool: "ashlr__edit" })]);
    const out = buildReport({ home });
    expect(out).toContain("ashlr__edit");
    expect(out).toMatch(/total tool calls\s+1/);
  });
});

// ---------------------------------------------------------------------------
// Header fields
// ---------------------------------------------------------------------------

describe("header section", () => {
  test("unique sessions counted correctly", async () => {
    const records = [
      makeRecord({ session: "s1" }),
      makeRecord({ session: "s1" }),
      makeRecord({ session: "s2" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toMatch(/unique sessions\s+2/);
  });

  test("unique projects counted correctly", async () => {
    const records = [
      makeRecord({ cwd: "/a/proj1" }),
      makeRecord({ cwd: "/a/proj1" }),
      makeRecord({ cwd: "/b/proj2" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toMatch(/unique projects.*\s+2/);
  });

  test("time range shows earliest and latest timestamps", async () => {
    const early = "2025-01-01T00:00:00.000Z";
    const late = "2025-06-15T12:30:00.000Z";
    const records = [
      makeRecord({ ts: early }),
      makeRecord({ ts: late }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("2025-01-01");
    expect(out).toContain("2025-06-15");
  });
});

// ---------------------------------------------------------------------------
// Fallback & escalation rates section
// ---------------------------------------------------------------------------

function makeFallbackRecord(overrides: FakeRecord & { reason?: string } = {}): string {
  const base: FakeRecord & { reason?: string } = {
    ts: new Date().toISOString(),
    agent: "ashlr-mcp",
    event: "tool_fallback",
    tool: "ashlr__grep",
    cwd: "/projects/foo",
    session: "sess-abc",
    input_size: 0,
    output_size: 0,
  };
  return JSON.stringify({ ...base, ...overrides });
}

describe("fallback & escalation rates section", () => {
  test("section header always present even with no fallback events", async () => {
    await writeLog([makeRecord({ tool: "ashlr__read" })]);
    const out = buildReport({ home });
    expect(out).toContain("FALLBACK & ESCALATION RATES");
    expect(out).toContain("(none recorded)");
  });

  test("fallback events rendered with count and reason", async () => {
    const records = [
      makeRecord({ tool: "ashlr__grep" }),
      makeRecord({ tool: "ashlr__grep" }),
      makeFallbackRecord({ tool: "ashlr__grep", event: "tool_fallback", reason: "no-genome" }),
      makeFallbackRecord({ tool: "ashlr__grep", event: "tool_fallback", reason: "no-genome" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("FALLBACK & ESCALATION RATES");
    expect(out).toContain("tool_fallback:no-genome");
    expect(out).toContain("2"); // count
    // % of tool calls: 2 fallbacks / 2 calls = 100%
    expect(out).toContain("100%");
  });

  test("escalate events appear under correct tool", async () => {
    const records = [
      makeRecord({ tool: "ashlr__grep" }),
      makeFallbackRecord({
        tool: "ashlr__grep",
        event: "tool_escalate",
        reason: "incomplete-genome",
      }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("tool_escalate:incomplete-genome");
  });

  test("noop events appear in the section", async () => {
    const records = [
      makeRecord({ tool: "ashlr__read" }),
      makeFallbackRecord({ tool: "ashlr__read", event: "tool_noop", reason: "small-file" }),
      makeFallbackRecord({ tool: "ashlr__read", event: "tool_noop", reason: "small-file" }),
      makeFallbackRecord({ tool: "ashlr__read", event: "tool_noop", reason: "small-file" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("tool_noop:small-file");
    expect(out).toContain("3");
  });

  test("top 3 reasons shown", async () => {
    const records = [
      makeRecord({ tool: "ashlr__grep" }),
      // 3× no-genome, 2× genome-empty, 1× llm-unreachable
      ...Array(3).fill(null).map(() => makeFallbackRecord({ reason: "no-genome" })),
      ...Array(2).fill(null).map(() => makeFallbackRecord({ reason: "genome-empty" })),
      makeFallbackRecord({ tool: "ashlr__read", event: "tool_fallback", reason: "llm-unreachable" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("no-genome");
    expect(out).toContain("genome-empty");
    expect(out).toContain("llm-unreachable");
    // no-genome should appear before genome-empty (sorted by count desc)
    const noGenomePos = out.indexOf("no-genome");
    const emptyPos = out.lastIndexOf("genome-empty");
    expect(noGenomePos).toBeLessThan(emptyPos);
  });

  test("fallback events excluded from tool_call totals", async () => {
    const records = [
      makeRecord({ tool: "ashlr__read" }),
      makeFallbackRecord({ tool: "ashlr__grep", event: "tool_fallback", reason: "no-genome" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    // Only 1 tool_call record; fallback event doesn't inflate total
    expect(out).toMatch(/total tool calls\s+1/);
  });

  test("mixed record types render section with correct counts", async () => {
    const records = [
      makeRecord({ tool: "ashlr__grep" }),
      makeRecord({ tool: "ashlr__grep" }),
      makeRecord({ tool: "ashlr__read" }),
      makeFallbackRecord({ tool: "ashlr__grep", event: "tool_fallback", reason: "no-genome" }),
      makeFallbackRecord({ tool: "ashlr__grep", event: "tool_escalate", reason: "incomplete-genome" }),
      makeFallbackRecord({ tool: "ashlr__read", event: "tool_noop", reason: "below-threshold" }),
    ];
    await writeLog(records);
    const out = buildReport({ home });
    expect(out).toContain("FALLBACK & ESCALATION RATES");
    expect(out).not.toContain("(none recorded)");
    expect(out).toContain("tool_fallback:no-genome");
    expect(out).toContain("tool_escalate:incomplete-genome");
    expect(out).toContain("tool_noop:below-threshold");
  });
});
