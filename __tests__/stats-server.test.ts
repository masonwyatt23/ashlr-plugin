/**
 * Unit tests for servers/_stats.ts — the single source of truth every MCP
 * server writes into. Isolation is via a temp $HOME so nothing touches the
 * real ~/.ashlr.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

import {
  _drainWrites,
  _resetMemCache,
  _getWriteCount,
  _resetWriteCount,
  bumpSummarization,
  currentSessionId,
  dropSessionBucket,
  initSessionBucket,
  migrateToV2,
  readStats,
  recordSaving,
} from "../servers/_stats";

let home: string;
const originalHome = process.env.HOME;
const originalSession = process.env.CLAUDE_SESSION_ID;
const originalSync = process.env.ASHLR_STATS_SYNC;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "ashlr-stats-"));
  await mkdir(join(home, ".ashlr"), { recursive: true });
  process.env.HOME = home;
  process.env.CLAUDE_SESSION_ID = "test-session-a";
});

afterEach(async () => {
  await _drainWrites();
  process.env.HOME = originalHome;
  if (originalSession) process.env.CLAUDE_SESSION_ID = originalSession;
  else delete process.env.CLAUDE_SESSION_ID;
  if (originalSync !== undefined) process.env.ASHLR_STATS_SYNC = originalSync;
  else delete process.env.ASHLR_STATS_SYNC;
  _resetMemCache();
  await rm(home, { recursive: true, force: true });
});

describe("currentSessionId", () => {
  test("honors CLAUDE_SESSION_ID when set", () => {
    expect(currentSessionId()).toBe("test-session-a");
  });

  test("falls back to a PPID-derived hash when unset", () => {
    delete process.env.CLAUDE_SESSION_ID;
    const id = currentSessionId();
    expect(id.startsWith("p")).toBe(true);
    expect(id.length).toBeGreaterThan(1);
  });
});

describe("migrateToV2", () => {
  test("upgrades v1 shape, preserving lifetime totals", () => {
    const v1 = {
      session: { startedAt: "2026-01-01", calls: 10, tokensSaved: 100, byTool: {} },
      lifetime: { calls: 200, tokensSaved: 5000, byTool: { "ashlr__read": { calls: 200, tokensSaved: 5000 } }, byDay: { "2026-01-01": { calls: 10, tokensSaved: 100 } } },
    };
    const v2 = migrateToV2(v1);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.lifetime.tokensSaved).toBe(5000);
    expect(v2.lifetime.byTool["ashlr__read"]!.calls).toBe(200);
    // Legacy session field is dropped — it was never accurate across terminals.
    expect(v2.sessions).toEqual({});
  });

  test("returns empty stats for malformed input", () => {
    expect(migrateToV2(null).schemaVersion).toBe(2);
    expect(migrateToV2("garbage").schemaVersion).toBe(2);
    expect(migrateToV2(undefined).sessions).toEqual({});
  });

  test("passes through a valid v2 document", () => {
    const v2in = {
      schemaVersion: 2,
      sessions: { foo: { startedAt: "t", lastSavingAt: null, calls: 1, tokensSaved: 10, byTool: {} } },
      lifetime: { calls: 1, tokensSaved: 10, byTool: {}, byDay: {} },
    };
    const out = migrateToV2(v2in);
    expect(out.sessions["foo"]!.tokensSaved).toBe(10);
  });
});

describe("recordSaving", () => {
  test("writes per-session and lifetime counters", async () => {
    await recordSaving(4000, 400, "ashlr__read");
    const stats = await readStats();
    expect(stats.lifetime.tokensSaved).toBeGreaterThan(0);
    const sess = stats.sessions["test-session-a"]!;
    expect(sess.tokensSaved).toBeGreaterThan(0);
    expect(sess.byTool["ashlr__read"]!.calls).toBe(1);
    expect(sess.lastSavingAt).not.toBeNull();
  });

  test("different session ids don't share counters", async () => {
    await recordSaving(4000, 400, "ashlr__read", { sessionId: "A" });
    await recordSaving(4000, 400, "ashlr__read", { sessionId: "B" });
    const stats = await readStats();
    expect(stats.sessions["A"]!.calls).toBe(1);
    expect(stats.sessions["B"]!.calls).toBe(1);
    // Lifetime aggregates both.
    expect(stats.lifetime.calls).toBe(2);
  });

  test("parallel writes from the same process don't drop updates", async () => {
    const N = 20;
    await Promise.all(
      Array.from({ length: N }, () => recordSaving(4000, 400, "ashlr__read")),
    );
    const stats = await readStats();
    expect(stats.lifetime.calls).toBe(N);
    expect(stats.sessions["test-session-a"]!.calls).toBe(N);
  });

  test("writes minified JSON (no pretty-print whitespace)", async () => {
    await recordSaving(4000, 400, "ashlr__read");
    await _drainWrites();
    const raw = await readFile(join(home, ".ashlr", "stats.json"), "utf-8");
    // No double-space indent runs — minified.
    expect(raw).not.toMatch(/\n  \"/);
  });

  test("no-op savings still bump call count", async () => {
    await recordSaving(100, 100, "ashlr__read");
    const stats = await readStats();
    expect(stats.sessions["test-session-a"]!.calls).toBe(1);
    expect(stats.sessions["test-session-a"]!.tokensSaved).toBe(0);
  });
});

describe("initSessionBucket / dropSessionBucket", () => {
  test("init creates an empty bucket; drop removes it", async () => {
    await initSessionBucket("X");
    let stats = await readStats();
    expect(stats.sessions["X"]).toBeTruthy();
    expect(stats.sessions["X"]!.calls).toBe(0);

    const dropped = await dropSessionBucket("X");
    stats = await readStats();
    expect(stats.sessions["X"]).toBeUndefined();
    expect(dropped?.calls).toBe(0);
  });

  test("drop preserves lifetime totals", async () => {
    await recordSaving(4000, 400, "ashlr__read", { sessionId: "Y" });
    const before = (await readStats()).lifetime.tokensSaved;
    await dropSessionBucket("Y");
    const after = (await readStats()).lifetime.tokensSaved;
    expect(after).toBe(before);
  });
});

describe("bumpSummarization", () => {
  test("accumulates summarization counters across calls", async () => {
    await bumpSummarization("calls");
    await bumpSummarization("calls");
    await bumpSummarization("cacheHits");
    const stats = await readStats();
    expect(stats.summarization?.calls).toBe(2);
    expect(stats.summarization?.cacheHits).toBe(1);
  });
});

describe("debounced writes", () => {
  beforeEach(() => {
    delete process.env.ASHLR_STATS_SYNC;
    _resetMemCache();
    _resetWriteCount();
  });

  afterEach(() => {
    delete process.env.ASHLR_STATS_SYNC;
  });

  test("10 rapid recordSaving calls coalesce into ≤2 disk writes", async () => {
    _resetWriteCount();
    const calls = Array.from({ length: 10 }, () =>
      recordSaving(4000, 400, "ashlr__read"),
    );
    await Promise.all(calls);
    await _drainWrites();
    // Debounced: all 10 land in 1-2 disk writes (timer coalesces them).
    expect(_getWriteCount()).toBeLessThanOrEqual(2);
    // All 10 calls must be accounted for.
    const stats = await readStats();
    expect(stats.sessions["test-session-a"]!.calls).toBe(10);
  });

  test("ASHLR_STATS_SYNC=1 writes every call synchronously", async () => {
    process.env.ASHLR_STATS_SYNC = "1";
    _resetWriteCount();
    for (let i = 0; i < 5; i++) {
      await recordSaving(4000, 400, "ashlr__read");
    }
    await _drainWrites();
    // Each call hits disk independently in sync mode.
    expect(_getWriteCount()).toBe(5);
  });

  test("pending deltas survive process beforeExit drain", async () => {
    delete process.env.ASHLR_STATS_SYNC;
    _resetMemCache();
    // Fire off saves without draining.
    for (let i = 0; i < 5; i++) {
      await recordSaving(1000, 100, "ashlr__read");
    }
    // Simulate beforeExit by draining explicitly.
    await _drainWrites();
    const stats = await readStats();
    expect(stats.sessions["test-session-a"]!.calls).toBe(5);
    expect(stats.lifetime.calls).toBeGreaterThanOrEqual(5);
  });
});

describe("graceful recovery", () => {
  test("readStats returns empty for malformed file, never throws", async () => {
    await writeFile(join(home, ".ashlr", "stats.json"), "{not json");
    const stats = await readStats();
    expect(stats.schemaVersion).toBe(2);
    expect(stats.lifetime.tokensSaved).toBe(0);
  });

  test("first recordSaving after corrupt file self-heals the schema", async () => {
    await writeFile(join(home, ".ashlr", "stats.json"), "{corrupted");
    await recordSaving(1000, 100, "ashlr__read");
    const stats = await readStats();
    expect(stats.schemaVersion).toBe(2);
    expect(stats.sessions["test-session-a"]!.calls).toBe(1);
  });
});
