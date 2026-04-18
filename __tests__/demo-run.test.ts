/**
 * Tests for scripts/demo-run.ts
 *
 * Runs the script headlessly against a tmp project directory.
 * Asserts: exits 0, output contains expected markers, no files written.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "bun";

const DEMO_SCRIPT = join(import.meta.dir, "../scripts/demo-run.ts");

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runDemo(cwd: string, home: string): Promise<RunResult> {
  const proc = spawn({
    cmd: ["bun", "run", DEMO_SCRIPT, "--cwd", cwd],
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, HOME: home },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let home: string;
let project: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "ashlr-demo-home-"));
  project = await mkdtemp(join(tmpdir(), "ashlr-demo-proj-"));
  await mkdir(join(home, ".ashlr"), { recursive: true });
  await mkdir(join(project, "src"), { recursive: true });

  // Create a source file > 2KB so the demo finds something to read.
  const content =
    "// demo source file\n" +
    "import { foo } from './bar';\n".repeat(150) +
    "function main() { return 42; }\n";
  await writeFile(join(project, "src", "index.ts"), content);
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
  await rm(project, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("demo-run.ts", () => {
  test("exits 0 always", async () => {
    const { exitCode } = await runDemo(project, home);
    expect(exitCode).toBe(0);
  });

  test("output contains 'demo' heading", async () => {
    const { stdout } = await runDemo(project, home);
    expect(stdout.toLowerCase()).toContain("demo");
  });

  test("output contains byte counts for read step", async () => {
    const { stdout } = await runDemo(project, home);
    // Byte counts appear as "X B", "X.Y KB", etc.
    expect(stdout).toMatch(/\d+(\.\d+)?\s*(B|KB|MB)/);
  });

  test("output contains tokens-saved metric", async () => {
    const { stdout } = await runDemo(project, home);
    expect(stdout).toContain("tokens saved");
  });

  test("output is at most 30 lines", async () => {
    const { stdout } = await runDemo(project, home);
    const lines = stdout.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeLessThanOrEqual(30);
  });

  test("does not write any new files to project cwd", async () => {
    const beforeFiles = await readdir(project, { recursive: true });
    await runDemo(project, home);
    const afterFiles = await readdir(project, { recursive: true });
    expect(afterFiles.sort()).toEqual(beforeFiles.sort());
  });

  test("does not write any new files to home .ashlr dir", async () => {
    const ashlrDir = join(home, ".ashlr");
    const beforeFiles = await readdir(ashlrDir).catch(() => [] as string[]);
    await runDemo(project, home);
    const afterFiles = await readdir(ashlrDir).catch(() => [] as string[]);
    expect(afterFiles.sort()).toEqual(beforeFiles.sort());
  });

  test("works gracefully on empty project (no source files)", async () => {
    const emptyProj = await mkdtemp(join(tmpdir(), "ashlr-demo-empty-"));
    try {
      const { exitCode, stdout } = await runDemo(emptyProj, home);
      expect(exitCode).toBe(0);
      expect(stdout.length).toBeGreaterThan(0);
    } finally {
      await rm(emptyProj, { recursive: true, force: true });
    }
  });

  test("works when HOME has no stats.json (no lifetime data)", async () => {
    const freshHome = await mkdtemp(join(tmpdir(), "ashlr-demo-fresh-"));
    try {
      const { exitCode, stdout } = await runDemo(project, freshHome);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("demo");
    } finally {
      await rm(freshHome, { recursive: true, force: true });
    }
  });

  test("projects annual savings when lifetime has >= 10 calls", async () => {
    await writeFile(
      join(home, ".ashlr", "stats.json"),
      JSON.stringify({
        schemaVersion: 2,
        sessions: {},
        lifetime: { calls: 50, tokensSaved: 100_000, byTool: {}, byDay: {} },
      }),
    );
    const { stdout } = await runDemo(project, home);
    expect(stdout).toContain("projected annual");
  });

  test("skips annual projection when lifetime has < 10 calls", async () => {
    await writeFile(
      join(home, ".ashlr", "stats.json"),
      JSON.stringify({
        schemaVersion: 2,
        sessions: {},
        lifetime: { calls: 3, tokensSaved: 500, byTool: {}, byDay: {} },
      }),
    );
    const { stdout } = await runDemo(project, home);
    expect(stdout).not.toContain("projected annual");
  });
});
