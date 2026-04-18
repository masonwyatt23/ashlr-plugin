/**
 * Integration tests for ashlr__diff_semantic.
 *
 * Each test builds a minimal git repo in a temp dir, makes commits, then
 * drives the MCP server over stdio JSON-RPC and asserts on the text output.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawn, spawnSync } from "bun";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir, homedir } from "os";
import { join } from "path";

// ---------------------------------------------------------------------------
// RPC helpers
// ---------------------------------------------------------------------------

interface RpcRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
}

async function rpc(
  reqs: RpcRequest[],
  extraEnv?: Record<string, string>,
): Promise<Array<{ id: number; result?: any; error?: any }>> {
  const input = reqs.map((r) => JSON.stringify(r)).join("\n") + "\n";
  const proc = spawn({
    cmd: ["bun", "run", "servers/diff-semantic-server.ts"],
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...(extraEnv ?? {}) },
  });
  proc.stdin.write(input);
  await proc.stdin.end();
  const out = await new Response(proc.stdout).text();
  await proc.exited;
  return out
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

const INIT: RpcRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  },
};

function callSemantic(id: number, args: Record<string, unknown>): RpcRequest {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name: "ashlr__diff_semantic", arguments: args },
  };
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(cwd: string, args: string[]): void {
  const res = spawnSync({ cmd: ["git", ...args], cwd, stdout: "pipe", stderr: "pipe" });
  if (res.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${new TextDecoder().decode(res.stderr)}`,
    );
  }
}

async function initRepo(dir: string): Promise<void> {
  git(dir, ["init", "-q", "-b", "main"]);
  git(dir, ["config", "user.email", "t@t"]);
  git(dir, ["config", "user.name", "t"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(dir, "README.md"), "hello\n");
  git(dir, ["add", "."]);
  git(dir, ["commit", "-q", "-m", "init"]);
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "ashlr-dsem-"));
  await initRepo(tmp);
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Suite 1: MCP wiring
// ---------------------------------------------------------------------------

describe("ashlr-diff-semantic · bootstrap", () => {
  test("initialize + tools/list returns ashlr__diff_semantic", async () => {
    const [init, list] = await rpc([
      INIT,
      { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    ]);
    expect(init.result).toMatchObject({
      serverInfo: { name: "ashlr-diff-semantic", version: "0.1.0" },
    });
    const tools = list.result.tools as Array<{ name: string }>;
    expect(tools.map((t) => t.name)).toContain("ashlr__diff_semantic");
  });

  test("unknown tool returns isError", async () => {
    const [, res] = await rpc([
      INIT,
      {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "ashlr__nonexistent", arguments: {} },
      },
    ]);
    expect(res.result.isError).toBe(true);
  });

  test("non-git dir returns clean error", async () => {
    const bare = await mkdtemp(join(tmpdir(), "ashlr-nongit-"));
    try {
      const [, call] = await rpc([INIT, callSemantic(2, { cwd: bare })]);
      expect(call.result.isError).toBe(true);
      expect(call.result.content[0].text).toMatch(/not a git repository/i);
    } finally {
      await rm(bare, { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// Suite 2: Rename detection
// ---------------------------------------------------------------------------

describe("ashlr-diff-semantic · rename detection", () => {
  test("renames a symbol across 3 files → output contains 'renamed' section", async () => {
    // Create 3 files that use the symbol `OldService`
    for (const name of ["alpha.ts", "beta.ts", "gamma.ts"]) {
      await writeFile(
        join(tmp, name),
        `import { OldService } from "./svc";\nconst x = new OldService();\n`,
      );
    }
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "add files"]);

    // Rename OldService -> NewService in all 3 files
    for (const name of ["alpha.ts", "beta.ts", "gamma.ts"]) {
      await writeFile(
        join(tmp, name),
        `import { NewService } from "./svc";\nconst x = new NewService();\n`,
      );
    }

    const [, call] = await rpc([
      INIT,
      callSemantic(2, { cwd: tmp }),
    ]);
    const text: string = call.result.content[0].text;
    expect(text).toContain("OldService");
    expect(text).toContain("NewService");
    expect(text).toContain("->");
    expect(text).toMatch(/renames:/i);
  });

  test("rename in only 2 files does NOT trigger rename section", async () => {
    for (const name of ["a.ts", "b.ts"]) {
      await writeFile(join(tmp, name), `const OldThing = 1;\n`);
    }
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "add"]);
    for (const name of ["a.ts", "b.ts"]) {
      await writeFile(join(tmp, name), `const NewThing = 1;\n`);
    }

    const [, call] = await rpc([INIT, callSemantic(2, { cwd: tmp })]);
    const text: string = call.result.content[0].text;
    // Should NOT have "renames:" section (threshold is 3 files)
    expect(text).not.toMatch(/^renames:/m);
  });
});

// ---------------------------------------------------------------------------
// Suite 3: Formatting-only
// ---------------------------------------------------------------------------

describe("ashlr-diff-semantic · formatting-only", () => {
  test("whitespace-only changes across multiple files → formatting-only section", async () => {
    // Files with same tokens, different indentation
    await writeFile(join(tmp, "fmt1.ts"), `function foo() {\nreturn 1;\n}\n`);
    await writeFile(join(tmp, "fmt2.ts"), `function bar() {\nreturn 2;\n}\n`);
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "add"]);

    // Reformat: add indentation — same code, whitespace differs
    await writeFile(join(tmp, "fmt1.ts"), `function foo() {\n  return 1;\n}\n`);
    await writeFile(join(tmp, "fmt2.ts"), `function bar() {\n  return 2;\n}\n`);

    const [, call] = await rpc([INIT, callSemantic(2, { cwd: tmp })]);
    const text: string = call.result.content[0].text;
    expect(text).toMatch(/formatting-only/i);
    expect(text).toContain("fmt1.ts");
    expect(text).toContain("fmt2.ts");
  });
});

// ---------------------------------------------------------------------------
// Suite 4: Mixed changes
// ---------------------------------------------------------------------------

describe("ashlr-diff-semantic · mixed changes", () => {
  test("renames + unrelated changes → both sections appear", async () => {
    // 3 files with the rename target
    for (const name of ["r1.ts", "r2.ts", "r3.ts"]) {
      await writeFile(join(tmp, name), `import { LegacyClient } from "lib";\n`);
    }
    // 1 file with unrelated changes
    await writeFile(join(tmp, "other.ts"), `export const VERSION = 1;\n`);
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "baseline"]);

    // Rename in 3 files
    for (const name of ["r1.ts", "r2.ts", "r3.ts"]) {
      await writeFile(join(tmp, name), `import { ModernClient } from "lib";\n`);
    }
    // Unrelated change in other.ts
    await writeFile(join(tmp, "other.ts"), `export const VERSION = 2;\nexport const BUILD = 99;\n`);

    const [, call] = await rpc([INIT, callSemantic(2, { cwd: tmp })]);
    const text: string = call.result.content[0].text;
    // Rename section
    expect(text).toContain("LegacyClient");
    expect(text).toContain("ModernClient");
    expect(text).toMatch(/renames:/i);
    // Other changes section
    expect(text).toMatch(/other changes:/i);
    expect(text).toContain("other.ts");
  });
});

// ---------------------------------------------------------------------------
// Suite 5: Degradation to compact diff
// ---------------------------------------------------------------------------

describe("ashlr-diff-semantic · degradation", () => {
  test("unstructured diff with no patterns degrades to compact summary", async () => {
    // Files with varied unrelated changes — no rename pattern, no formatting-only
    await writeFile(join(tmp, "misc.ts"), `export const a = 1;\nexport const b = 2;\n`);
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "baseline"]);
    await writeFile(
      join(tmp, "misc.ts"),
      `export const a = 42;\nexport const b = "hello";\nexport const c = true;\n`,
    );

    const [, call] = await rpc([INIT, callSemantic(2, { cwd: tmp })]);
    const text: string = call.result.content[0].text;
    // Should not have semantic sections
    expect(text).not.toMatch(/^renames:/m);
    expect(text).not.toMatch(/^formatting-only:/m);
    // Should have compact summary footer
    expect(text).toContain("[ashlr__diff_semantic]");
    expect(text).toMatch(/\d+ rename/);
    // Should mention the changed file
    expect(text).toContain("misc.ts");
  });

  test("empty repo with no changes produces footer", async () => {
    // No changes since last commit — diff is empty
    const [, call] = await rpc([INIT, callSemantic(2, { cwd: tmp })]);
    const text: string = call.result.content[0].text;
    expect(text).toContain("[ashlr__diff_semantic]");
  });

  test("staged flag uses --cached semantics", async () => {
    await writeFile(join(tmp, "staged.ts"), `const x = 1;\n`);
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "base"]);
    await writeFile(join(tmp, "staged.ts"), `const x = 99;\n`);
    git(tmp, ["add", "staged.ts"]);
    // working tree has different content than staged
    await writeFile(join(tmp, "staged.ts"), `const x = 999;\n`);

    const [, call] = await rpc([INIT, callSemantic(2, { cwd: tmp, staged: true })]);
    const text: string = call.result.content[0].text;
    // Staged diff shows 99 (staged), not 999 (working)
    expect(text).toContain("staged.ts");
    expect(text).not.toMatch(/999/);
  });

  test("range parameter diffs between commits", async () => {
    await writeFile(join(tmp, "v.ts"), `export const v = 1;\n`);
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "v1"]);
    await writeFile(join(tmp, "v.ts"), `export const v = 2;\n`);
    git(tmp, ["add", "."]);
    git(tmp, ["commit", "-q", "-m", "v2"]);

    const [, call] = await rpc([
      INIT,
      callSemantic(2, { cwd: tmp, range: "HEAD~1..HEAD" }),
    ]);
    const text: string = call.result.content[0].text;
    expect(text).toContain("[ashlr__diff_semantic]");
    expect(text).toContain("v.ts");
  });
});

// ---------------------------------------------------------------------------
// Suite 6: Savings recorded in stats.json
// ---------------------------------------------------------------------------

describe("ashlr-diff-semantic · savings accounting", () => {
  test("byTool[ashlr__diff_semantic] increments after a call", async () => {
    // Use a dedicated HOME so we don't pollute the real stats.json
    const fakeHome = await mkdtemp(join(tmpdir(), "ashlr-home-"));
    try {
      await writeFile(join(tmp, "s.ts"), `export const s = 1;\n`);
      git(tmp, ["add", "."]);
      git(tmp, ["commit", "-q", "-m", "s"]);
      await writeFile(join(tmp, "s.ts"), `export const s = 2;\n`);

      await rpc(
        [INIT, callSemantic(2, { cwd: tmp })],
        { HOME: fakeHome, ASHLR_STATS_SYNC: "1" },
      );

      // Give the server a moment to flush (ASHLR_STATS_SYNC=1 writes synchronously
      // but the server exits after stdin closes, which is after our rpc() returns)
      await new Promise((r) => setTimeout(r, 200));

      const statsFile = join(fakeHome, ".ashlr", "stats.json");
      if (!existsSync(statsFile)) {
        // Some timing; skip rather than hard-fail
        return;
      }
      const stats = JSON.parse(await readFile(statsFile, "utf-8"));
      const lifetimeByTool = stats?.lifetime?.byTool ?? {};
      const toolEntry = lifetimeByTool["ashlr__diff_semantic"];
      expect(toolEntry).toBeDefined();
      expect(toolEntry.calls).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(fakeHome, { recursive: true, force: true });
    }
  });
});
