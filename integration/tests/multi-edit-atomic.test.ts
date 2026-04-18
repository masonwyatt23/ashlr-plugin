/**
 * multi-edit-atomic.test.ts — Atomic multi-edit behaviour.
 *
 * - Create 3 files.
 * - Call ashlr__multi_edit with 2 good edits + 1 bad edit.
 * - Assert: all 3 files unchanged (rollback occurred).
 * - Assert: response is an error.
 * - Call again with 3 good edits.
 * - Assert: all 3 files updated, one stats entry.
 */

import { describe, it, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  makeTempHome,
  startMcpServer,
  readLocalStats,
  SERVERS_DIR,
} from "../lib/harness.ts";

describe("multi-edit-atomic", () => {
  let cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const fn of cleanup) await fn().catch(() => {});
    cleanup = [];
  });

  it("rolls back all edits when one fails; applies all when all are valid", async () => {
    const tempHome = makeTempHome();
    cleanup.push(async () => rmSync(tempHome, { recursive: true, force: true }));

    const projectDir = join(tempHome, "project");
    mkdirSync(projectDir, { recursive: true });

    const fileA = join(projectDir, "a.ts");
    const fileB = join(projectDir, "b.ts");
    const fileC = join(projectDir, "c.ts");

    writeFileSync(fileA, "const foo = 1;\n");
    writeFileSync(fileB, "const bar = 2;\n");
    writeFileSync(fileC, "const baz = 3;\n");

    const { callTool, teardown } = await startMcpServer({
      serverFile: join(SERVERS_DIR, "multi-edit-server.ts"),
      tempHome,
      env: { CLAUDE_SESSION_ID: "test-session-multi-edit" },
    });
    cleanup.push(teardown);

    // --- First call: 2 valid + 1 invalid (search string not found) ---
    let errorCaught = false;
    try {
      await callTool("ashlr__multi_edit", {
        edits: [
          { path: fileA, search: "const foo = 1;", replace: "const foo = 10;" },
          { path: fileB, search: "const bar = 2;", replace: "const bar = 20;" },
          { path: fileC, search: "DOES_NOT_EXIST", replace: "const baz = 30;" },
        ],
      });
    } catch {
      errorCaught = true;
    }

    expect(errorCaught).toBe(true);

    // All files must be unchanged
    expect(readFileSync(fileA, "utf8")).toBe("const foo = 1;\n");
    expect(readFileSync(fileB, "utf8")).toBe("const bar = 2;\n");
    expect(readFileSync(fileC, "utf8")).toBe("const baz = 3;\n");

    // --- Second call: all 3 valid edits ---
    await callTool("ashlr__multi_edit", {
      edits: [
        { path: fileA, search: "const foo = 1;", replace: "const foo = 10;" },
        { path: fileB, search: "const bar = 2;", replace: "const bar = 20;" },
        { path: fileC, search: "const baz = 3;", replace: "const baz = 30;" },
      ],
    });

    expect(readFileSync(fileA, "utf8")).toBe("const foo = 10;\n");
    expect(readFileSync(fileB, "utf8")).toBe("const bar = 20;\n");
    expect(readFileSync(fileC, "utf8")).toBe("const baz = 30;\n");

    // Stats must show exactly 1 successful call (the failed one is not recorded)
    const stats = readLocalStats(tempHome);
    const toolEntry = stats?.lifetime?.byTool?.["ashlr__multi_edit"];
    expect(toolEntry).toBeDefined();
    expect(toolEntry!.calls).toBe(1);
  }, 30_000);
});
