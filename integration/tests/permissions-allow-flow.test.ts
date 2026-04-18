/**
 * permissions-allow-flow.test.ts — /ashlr-allow script idempotency.
 *
 * - Empty ~/.claude/settings.json.
 * - Run bun run scripts/install-permissions.ts --settings <tmpPath>.
 * - Assert: file contains all mcp__ashlr-* entries.
 * - Run again.
 * - Assert: no duplicates.
 */

import { describe, it, expect, afterEach } from "bun:test";
import { rmSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import {
  makeTempHome,
  PLUGIN_ROOT,
} from "../lib/harness.ts";

describe("permissions-allow-flow", () => {
  let cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const fn of cleanup) await fn().catch(() => {});
    cleanup = [];
  });

  it("adds mcp__ashlr-* entries and is idempotent on re-run", async () => {
    const tempHome = makeTempHome();
    cleanup.push(async () => rmSync(tempHome, { recursive: true, force: true }));

    const settingsDir = join(tempHome, ".claude");
    mkdirSync(settingsDir, { recursive: true });
    const settingsPath = join(settingsDir, "settings.json");
    // Start with an empty settings file
    writeFileSync(settingsPath, JSON.stringify({}), "utf8");

    const scriptPath = join(PLUGIN_ROOT, "scripts/install-permissions.ts");

    // First run
    const run1 = Bun.spawnSync(
      ["bun", "run", scriptPath, "--settings", settingsPath],
      { env: { ...process.env, HOME: tempHome } },
    );
    const out1 = new TextDecoder().decode(run1.stdout);
    const err1 = new TextDecoder().decode(run1.stderr);

    expect(run1.exitCode).toBe(0);

    const settings1 = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      permissions?: { allow?: string[] };
    };

    const allow1 = settings1?.permissions?.allow ?? [];
    // Must have at least some ashlr MCP tool entries
    const ashlrEntries1 = allow1.filter((e: string) => e.includes("mcp__ashlr"));
    expect(ashlrEntries1.length).toBeGreaterThan(0);

    // Second run — idempotency check
    const run2 = Bun.spawnSync(
      ["bun", "run", scriptPath, "--settings", settingsPath],
      { env: { ...process.env, HOME: tempHome } },
    );
    expect(run2.exitCode).toBe(0);

    const settings2 = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      permissions?: { allow?: string[] };
    };

    const allow2 = settings2?.permissions?.allow ?? [];
    const ashlrEntries2 = allow2.filter((e: string) => e.includes("mcp__ashlr"));

    // Count must be same — no duplicates
    expect(ashlrEntries2.length).toBe(ashlrEntries1.length);

    // No duplicate strings in the full allow list
    const unique = new Set(allow2);
    expect(unique.size).toBe(allow2.length);
  }, 30_000);
});
