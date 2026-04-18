/**
 * Tests for servers/_genome-live.ts — in-process genome section refresh.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from "fs/promises";
import { existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { initGenome, writeSection } from "@ashlr/core-efficiency/genome";
import { refreshGenomeAfterEdit } from "../servers/_genome-live";
import { _clearCache, _cacheSize, retrieveCached } from "../servers/_genome-cache";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function makeProject(base: string): Promise<string> {
  const dir = join(base, "project");
  await mkdir(dir, { recursive: true });
  return dir;
}

async function initProject(dir: string): Promise<void> {
  await initGenome(dir, {
    project: "test-project",
    vision: "test vision",
    milestone: "m1",
  });
}

async function sectionExists(dir: string, rel: string): Promise<boolean> {
  const path = join(dir, ".ashlrcode", "genome", rel);
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readSectionContent(dir: string, rel: string): Promise<string> {
  const path = join(dir, ".ashlrcode", "genome", rel);
  return readFile(path, "utf-8");
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let tmpBase: string;
const originalAuto = process.env.ASHLR_GENOME_AUTO;

beforeEach(async () => {
  tmpBase = await mkdtemp(join(tmpdir(), "genome-live-"));
  delete process.env.ASHLR_GENOME_AUTO;
  _clearCache();
});

afterEach(async () => {
  _clearCache();
  if (originalAuto === undefined) {
    delete process.env.ASHLR_GENOME_AUTO;
  } else {
    process.env.ASHLR_GENOME_AUTO = originalAuto;
  }
  await rm(tmpBase, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. Verbatim section updated
// ---------------------------------------------------------------------------

describe("verbatim section — literal replace", () => {
  test("patches section content when editBefore appears verbatim", async () => {
    const dir = await makeProject(tmpBase);
    await initProject(dir);

    // Write a genome section that embeds file content literally.
    const sectionRel = "knowledge/src-file.md";
    const originalSnippet = 'function hello() {\n  return "world";\n}';
    const sectionBody = `# Source: src/index.ts\n\n\`\`\`ts\n${originalSnippet}\n\`\`\`\n`;
    await writeSection(dir, sectionRel, sectionBody, {
      title: "src/index.ts",
      summary: "source file index.ts",
      tags: ["index.ts"],
    });

    const editedFile = join(dir, "src", "index.ts");
    const editAfter = 'function hello() {\n  return "universe";\n}';

    const result = await refreshGenomeAfterEdit(editedFile, originalSnippet, editAfter);

    // updated=1 because the literal string was found and replaced.
    expect(result.updated).toBe(1);

    const updated = await readSectionContent(dir, sectionRel);
    expect(updated).toContain(editAfter);
    expect(updated).not.toContain(originalSnippet);
  });

  test("updates manifest updatedAt for patched section", async () => {
    const dir = await makeProject(tmpBase);
    await initProject(dir);

    const sectionRel = "knowledge/utils.md";
    const snippet = "export const x = 1;";
    await writeSection(dir, sectionRel, `# utils\n\n\`\`\`ts\n${snippet}\n\`\`\`\n`, {
      title: "utils.ts",
      summary: "utility constants utils.ts",
      tags: ["utils.ts"],
    });

    // Record the manifest updatedAt before.
    const { loadManifest } = await import("@ashlr/core-efficiency/genome");
    const before = await loadManifest(dir);
    const sectionBefore = before?.sections.find((s) => s.path === sectionRel);

    // Small delay so timestamps differ.
    await new Promise((r) => setTimeout(r, 15));

    await refreshGenomeAfterEdit(
      join(dir, "src", "utils.ts"),
      snippet,
      "export const x = 42;",
    );

    const after = await loadManifest(dir);
    const sectionAfter = after?.sections.find((s) => s.path === sectionRel);

    expect(sectionAfter?.updatedAt).not.toBe(sectionBefore?.updatedAt);
  });
});

// ---------------------------------------------------------------------------
// 2. Summarized section — invalidated (deleted)
// ---------------------------------------------------------------------------

describe("summarized section — invalidated", () => {
  test("deletes section when editBefore has no literal match in section", async () => {
    const dir = await makeProject(tmpBase);
    await initProject(dir);

    const sectionRel = "knowledge/overview.md";
    // The section summarizes src/index.ts but does NOT embed the literal snippet.
    const summarizedBody =
      "# Overview\n\nThis file exports a hello function that returns a greeting.\n";
    await writeSection(dir, sectionRel, summarizedBody, {
      title: "overview of index.ts",
      summary: "summarized overview index.ts",
      tags: ["index.ts", "overview"],
    });

    const editBefore = 'function hello() {\n  return "world";\n}';
    const editAfter = 'function hello() {\n  return "universe";\n}';

    const result = await refreshGenomeAfterEdit(
      join(dir, "src", "index.ts"),
      editBefore,
      editAfter,
    );

    // skipped=1 because the section was invalidated (no literal match).
    expect(result.skipped).toBe(1);
    expect(result.updated).toBe(0);

    // Section file must no longer exist.
    expect(await sectionExists(dir, sectionRel)).toBe(false);
  });

  test("removes invalidated section from manifest", async () => {
    const dir = await makeProject(tmpBase);
    await initProject(dir);

    const sectionRel = "knowledge/summary.md";
    await writeSection(dir, sectionRel, "# Summary\n\nA helper module helper.ts.\n", {
      title: "summary helper.ts",
      summary: "high-level summary helper.ts",
      tags: ["helper.ts"],
    });

    await refreshGenomeAfterEdit(
      join(dir, "src", "helper.ts"),
      "function doThing() {}",
      "function doThing() { return 1; }",
    );

    const { loadManifest } = await import("@ashlr/core-efficiency/genome");
    const manifest = await loadManifest(dir);
    expect(manifest?.sections.find((s) => s.path === sectionRel)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. LRU cache cleared after refresh
// ---------------------------------------------------------------------------

describe("LRU cache eviction", () => {
  test("cache entries are cleared after a successful refresh", async () => {
    const dir = await makeProject(tmpBase);
    await initProject(dir);

    const sectionRel = "knowledge/cached-file.md";
    const snippet = "const answer = 42;";
    await writeSection(dir, sectionRel, `# cached\n\n\`\`\`\n${snippet}\n\`\`\`\n`, {
      title: "cached-file.ts",
      summary: "cached file cached-file.ts",
      tags: ["cached-file.ts"],
    });

    // Warm the cache with a retrieve call.
    await retrieveCached(dir, "cached", 100);
    const sizeBefore = _cacheSize();
    expect(sizeBefore).toBeGreaterThan(0);

    // Now refresh — should clear cache.
    await refreshGenomeAfterEdit(
      join(dir, "src", "cached-file.ts"),
      snippet,
      "const answer = 99;",
    );

    expect(_cacheSize()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. ASHLR_GENOME_AUTO=0 kill switch
// ---------------------------------------------------------------------------

describe("ASHLR_GENOME_AUTO=0 kill switch", () => {
  test("returns {updated:0, skipped:0} immediately when kill switch is set", async () => {
    process.env.ASHLR_GENOME_AUTO = "0";

    const dir = await makeProject(tmpBase);
    await initProject(dir);

    const sectionRel = "knowledge/guarded.md";
    const snippet = "export const flag = true;";
    await writeSection(dir, sectionRel, `# guarded\n\n\`\`\`\n${snippet}\n\`\`\`\n`, {
      title: "guarded.ts",
      summary: "guarded section guarded.ts",
      tags: ["guarded.ts"],
    });

    const result = await refreshGenomeAfterEdit(
      join(dir, "src", "guarded.ts"),
      snippet,
      "export const flag = false;",
    );

    expect(result).toEqual({ updated: 0, skipped: 0 });

    // Section must be untouched.
    const content = await readSectionContent(dir, sectionRel);
    expect(content).toContain(snippet);
  });
});

// ---------------------------------------------------------------------------
// 5. Never throws
// ---------------------------------------------------------------------------

describe("never throws", () => {
  test("returns {updated:0,skipped:0} for a non-existent file", async () => {
    const result = await refreshGenomeAfterEdit(
      "/absolutely/nonexistent/path/file.ts",
      "old",
      "new",
    );
    expect(result).toEqual({ updated: 0, skipped: 0 });
  });

  test("returns {updated:0,skipped:0} when genome root does not exist", async () => {
    const dir = await makeProject(tmpBase);
    // No genome initialized in dir.
    const result = await refreshGenomeAfterEdit(
      join(dir, "src", "file.ts"),
      "old code",
      "new code",
    );
    expect(result).toEqual({ updated: 0, skipped: 0 });
  });

  test("returns {updated:0,skipped:0} when manifest is missing", async () => {
    const dir = await makeProject(tmpBase);
    // Create genome dir structure without manifest.
    await mkdir(join(dir, ".ashlrcode", "genome"), { recursive: true });

    const result = await refreshGenomeAfterEdit(
      join(dir, "src", "file.ts"),
      "old",
      "new",
    );
    expect(result).toEqual({ updated: 0, skipped: 0 });
  });

  test("does not throw when editBefore is empty string", async () => {
    const dir = await makeProject(tmpBase);
    await initProject(dir);

    let threw = false;
    try {
      await refreshGenomeAfterEdit(join(dir, "src", "file.ts"), "", "new code");
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Integration: ashlrEdit triggers genome section update in same call
// ---------------------------------------------------------------------------

describe("integration: ashlrEdit updates genome section synchronously", () => {
  test("genome section reflects edit without waiting for SessionEnd", async () => {
    const dir = await makeProject(tmpBase);
    await initProject(dir);

    // Create a source file.
    const srcDir = join(dir, "src");
    await mkdir(srcDir, { recursive: true });
    const srcFile = join(srcDir, "widget.ts");
    const originalCode = 'export function widget() {\n  return "v1";\n}';
    const updatedCode = 'export function widget() {\n  return "v2";\n}';
    await writeFile(srcFile, originalCode, "utf-8");

    // Create a genome section that embeds the file content verbatim.
    const sectionRel = "knowledge/widget.md";
    await writeSection(
      dir,
      sectionRel,
      `# widget.ts\n\n\`\`\`ts\n${originalCode}\n\`\`\`\n`,
      {
        title: "widget.ts",
        summary: "widget module widget.ts",
        tags: ["widget.ts"],
      },
    );

    // Simulate what ashlrEdit does: write the file, then refresh.
    await writeFile(srcFile, updatedCode, "utf-8");
    const result = await refreshGenomeAfterEdit(srcFile, originalCode, updatedCode);

    // Must update in the same call — not waiting for SessionEnd.
    expect(result.updated).toBe(1);

    const sectionContent = await readSectionContent(dir, sectionRel);
    expect(sectionContent).toContain(updatedCode);
    expect(sectionContent).not.toContain(originalCode);
  });
});

// ---------------------------------------------------------------------------
// 7. Concurrency — two concurrent refreshes produce coherent results
// ---------------------------------------------------------------------------

describe("concurrency — file-level mutex", () => {
  test("two concurrent refreshes on the same genome root both land coherently", async () => {
    const dir = await makeProject(tmpBase);
    await initProject(dir);

    // Two independent sections referencing different files.
    const s1 = "knowledge/file-a.md";
    const s2 = "knowledge/file-b.md";
    const snippet1 = "const A = 1;";
    const snippet2 = "const B = 2;";

    await writeSection(dir, s1, `# A\n\n\`\`\`\n${snippet1}\n\`\`\`\n`, {
      title: "file-a.ts",
      summary: "module A file-a.ts",
      tags: ["file-a.ts"],
    });
    await writeSection(dir, s2, `# B\n\n\`\`\`\n${snippet2}\n\`\`\`\n`, {
      title: "file-b.ts",
      summary: "module B file-b.ts",
      tags: ["file-b.ts"],
    });

    // Fire both refreshes in parallel.
    const [r1, r2] = await Promise.all([
      refreshGenomeAfterEdit(join(dir, "src", "file-a.ts"), snippet1, "const A = 10;"),
      refreshGenomeAfterEdit(join(dir, "src", "file-b.ts"), snippet2, "const B = 20;"),
    ]);

    // Both must succeed.
    expect(r1.updated + r1.skipped).toBeGreaterThan(0);
    expect(r2.updated + r2.skipped).toBeGreaterThan(0);

    // Manifest must still be valid JSON with both sections (or their absences).
    const { loadManifest } = await import("@ashlr/core-efficiency/genome");
    const manifest = await loadManifest(dir);
    expect(manifest).not.toBeNull();
    // updatedAt must be a valid ISO string.
    expect(new Date(manifest!.updatedAt).getTime()).toBeGreaterThan(0);
  });
});
