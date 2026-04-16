/**
 * Unit + subprocess tests for hooks/orient-nudge-hook.ts
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  DEBOUNCE_MS,
  decide,
  loadState,
  NUDGE_MESSAGE,
  passThrough,
  statePath,
  WINDOW_MS,
} from "../hooks/orient-nudge-hook";

let home: string;
const PID = 424242;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "ashlr-orient-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("orient-nudge-hook decide()", () => {
  test("first Read call does not nudge, events has 1 entry", () => {
    const out = decide(
      { tool_name: "Read", tool_input: { file_path: "/x" } },
      { home, pid: PID, now: 1_000 },
    );
    expect(out).toEqual(passThrough());
    const state = loadState(statePath(home), PID);
    expect(state.events.length).toBe(1);
    expect(state.events[0]?.tool).toBe("Read");
  });

  test("three Read calls in succession → nudge fires on the third", () => {
    const base = 10_000;
    const first = decide({ tool_name: "Read" }, { home, pid: PID, now: base });
    const second = decide(
      { tool_name: "Read" },
      { home, pid: PID, now: base + 1_000 },
    );
    const third = decide(
      { tool_name: "Grep" },
      { home, pid: PID, now: base + 2_000 },
    );
    expect(first.hookSpecificOutput.additionalContext).toBeUndefined();
    expect(second.hookSpecificOutput.additionalContext).toBeUndefined();
    expect(third.hookSpecificOutput.additionalContext).toBe(NUDGE_MESSAGE);
  });

  test("Edit between Reads clears the window; nudge fires on 6th call", () => {
    const base = 20_000;
    // Reads 1–2
    decide({ tool_name: "Read" }, { home, pid: PID, now: base });
    decide({ tool_name: "Read" }, { home, pid: PID, now: base + 1_000 });
    // Edit clears events
    const editOut = decide(
      { tool_name: "Edit" },
      { home, pid: PID, now: base + 2_000 },
    );
    expect(editOut).toEqual(passThrough());
    expect(loadState(statePath(home), PID).events.length).toBe(0);
    // Reads 4, 5, 6 — nudge fires on 6
    const r4 = decide({ tool_name: "Read" }, { home, pid: PID, now: base + 3_000 });
    const r5 = decide({ tool_name: "Read" }, { home, pid: PID, now: base + 4_000 });
    const r6 = decide({ tool_name: "Read" }, { home, pid: PID, now: base + 5_000 });
    expect(r4.hookSpecificOutput.additionalContext).toBeUndefined();
    expect(r5.hookSpecificOutput.additionalContext).toBeUndefined();
    expect(r6.hookSpecificOutput.additionalContext).toBe(NUDGE_MESSAGE);
  });

  test("three Reads spread over > 60s → no nudge (window pruned)", () => {
    const base = 100_000;
    const a = decide({ tool_name: "Read" }, { home, pid: PID, now: base });
    const b = decide(
      { tool_name: "Read" },
      { home, pid: PID, now: base + 40_000 },
    );
    const c = decide(
      { tool_name: "Read" },
      { home, pid: PID, now: base + 90_000 },
    );
    expect(a.hookSpecificOutput.additionalContext).toBeUndefined();
    expect(b.hookSpecificOutput.additionalContext).toBeUndefined();
    // c is 50s after b, 90s after a → a pruned, only b+c in window
    expect(c.hookSpecificOutput.additionalContext).toBeUndefined();
    const state = loadState(statePath(home), PID);
    expect(state.events.length).toBe(2);
  });

  test("after nudge, 4th Read 1 minute later does NOT re-nudge (debounce)", () => {
    const base = 200_000;
    decide({ tool_name: "Read" }, { home, pid: PID, now: base });
    decide({ tool_name: "Read" }, { home, pid: PID, now: base + 1_000 });
    const third = decide(
      { tool_name: "Read" },
      { home, pid: PID, now: base + 2_000 },
    );
    expect(third.hookSpecificOutput.additionalContext).toBe(NUDGE_MESSAGE);
    // 60s later — still within 5min debounce
    const fourth = decide(
      { tool_name: "Read" },
      { home, pid: PID, now: base + 62_000 },
    );
    expect(fourth.hookSpecificOutput.additionalContext).toBeUndefined();
  });

  test("after nudge, 6 minutes later → nudged again", () => {
    const base = 300_000;
    decide({ tool_name: "Read" }, { home, pid: PID, now: base });
    decide({ tool_name: "Read" }, { home, pid: PID, now: base + 1_000 });
    const third = decide(
      { tool_name: "Read" },
      { home, pid: PID, now: base + 2_000 },
    );
    expect(third.hookSpecificOutput.additionalContext).toBe(NUDGE_MESSAGE);
    // Past debounce. Need to re-fill window since prior events are > 60s stale.
    const later = base + DEBOUNCE_MS + 60_000;
    decide({ tool_name: "Read" }, { home, pid: PID, now: later });
    decide({ tool_name: "Read" }, { home, pid: PID, now: later + 1_000 });
    const sixth = decide(
      { tool_name: "Read" },
      { home, pid: PID, now: later + 2_000 },
    );
    expect(sixth.hookSpecificOutput.additionalContext).toBe(NUDGE_MESSAGE);
  });

  test("opt-out via settings.json → no nudge ever", () => {
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(
      join(home, ".claude", "settings.json"),
      JSON.stringify({ ashlr: { orientNudge: false } }),
    );
    const base = 400_000;
    for (let i = 0; i < 10; i++) {
      const out = decide(
        { tool_name: "Read" },
        { home, pid: PID, now: base + i * 100 },
      );
      expect(out.hookSpecificOutput.additionalContext).toBeUndefined();
    }
  });

  test("stale state with different PID is ignored; starts fresh", () => {
    // Seed state with old PID and 5 events that would otherwise trigger.
    mkdirSync(join(home, ".ashlr"), { recursive: true });
    writeFileSync(
      statePath(home),
      JSON.stringify({
        pid: 1,
        events: [
          { tool: "Read", at: 1 },
          { tool: "Read", at: 2 },
          { tool: "Read", at: 3 },
          { tool: "Read", at: 4 },
        ],
      }),
    );
    const out = decide(
      { tool_name: "Read" },
      { home, pid: PID, now: 5_000 },
    );
    expect(out.hookSpecificOutput.additionalContext).toBeUndefined();
    const state = loadState(statePath(home), PID);
    expect(state.events.length).toBe(1);
  });

  test("mcp-prefixed ashlr read/grep tool names also count", () => {
    const base = 500_000;
    decide(
      { tool_name: "mcp__ashlr-efficiency__ashlr__read" },
      { home, pid: PID, now: base },
    );
    decide(
      { tool_name: "mcp__ashlr-efficiency__ashlr__grep" },
      { home, pid: PID, now: base + 1_000 },
    );
    const third = decide(
      { tool_name: "mcp__ashlr-efficiency__ashlr__read" },
      { home, pid: PID, now: base + 2_000 },
    );
    expect(third.hookSpecificOutput.additionalContext).toBe(NUDGE_MESSAGE);
  });

  test("non-tracked tool (Bash) passes through, does not touch window", () => {
    const base = 600_000;
    decide({ tool_name: "Read" }, { home, pid: PID, now: base });
    decide({ tool_name: "Read" }, { home, pid: PID, now: base + 1_000 });
    const bash = decide(
      { tool_name: "Bash" },
      { home, pid: PID, now: base + 2_000 },
    );
    expect(bash).toEqual(passThrough());
    expect(loadState(statePath(home), PID).events.length).toBe(2);
  });
});

describe("orient-nudge-hook subprocess (stdio)", () => {
  const HOOK = join(import.meta.dir, "..", "hooks", "orient-nudge-hook.ts");

  async function runHook(
    stdin: string,
    env: Record<string, string>,
  ): Promise<{ stdout: string; exitCode: number }> {
    const proc = Bun.spawn(["bun", "run", HOOK], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, ...env },
    });
    proc.stdin.write(stdin);
    await proc.stdin.end();
    const stdout = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    return { stdout, exitCode };
  }

  test("malformed JSON from stdin → pass-through, no crash", async () => {
    const { stdout, exitCode } = await runHook("not json {{{", { HOME: home });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed).toEqual(passThrough());
  });

  test("valid Read payload returns well-formed pass-through", async () => {
    const { stdout, exitCode } = await runHook(
      JSON.stringify({ tool_name: "Read", tool_input: { file_path: "/x" } }),
      { HOME: home },
    );
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
  });

  test("empty stdin → pass-through", async () => {
    const { stdout, exitCode } = await runHook("", { HOME: home });
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual(passThrough());
  });

  test("window unused and expired: length check is rolling",
    () => {
      const base = 700_000;
      decide({ tool_name: "Read" }, { home, pid: PID, now: base });
      decide({ tool_name: "Read" }, { home, pid: PID, now: base + WINDOW_MS - 1 });
      const out = decide(
        { tool_name: "Read" },
        { home, pid: PID, now: base + WINDOW_MS },
      );
      // All 3 still within window (<=60s from first)
      expect(out.hookSpecificOutput.additionalContext).toBe(NUDGE_MESSAGE);
    });
});
