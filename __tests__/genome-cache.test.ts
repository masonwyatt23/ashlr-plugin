/**
 * Unit tests for servers/_genome-cache.ts — LRU wrapper around retrieveSectionsV2.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// We need to control retrieveSectionsV2 calls — mock before importing cache.
let retrieveCallCount = 0;
let retrieveResult: unknown[] = [{ id: "sec1", content: "hello" }];

mock.module("@ashlr/core-efficiency", () => ({
  retrieveSectionsV2: async (_root: string, _pattern: string, _limit: number) => {
    retrieveCallCount++;
    return retrieveResult;
  },
  // other exports used elsewhere — provide stubs
  estimateTokensFromString: () => 0,
  formatGenomeForPrompt: () => "",
  genomeExists: () => false,
  snipCompact: (s: string) => s,
}));

const { retrieveCached, _clearCache, _cacheSize } = await import("../servers/_genome-cache");

let tmpHome: string;

beforeEach(async () => {
  tmpHome = await mkdtemp(join(tmpdir(), "genome-cache-"));
  retrieveCallCount = 0;
  retrieveResult = [{ id: "sec1", content: "hello" }];
  _clearCache();
});

afterEach(async () => {
  _clearCache();
  await rm(tmpHome, { recursive: true, force: true });
});

async function makeGenomeRoot(): Promise<string> {
  const root = join(tmpHome, "project");
  await mkdir(join(root, ".ashlrcode", "genome"), { recursive: true });
  await writeFile(join(root, ".ashlrcode", "genome", "manifest.json"), "{}");
  return root;
}

describe("retrieveCached — cache hit", () => {
  test("second call with same args hits cache, not retriever", async () => {
    const root = await makeGenomeRoot();
    await retrieveCached(root, "foo", 4000);
    await retrieveCached(root, "foo", 4000);
    expect(retrieveCallCount).toBe(1);
  });

  test("different patterns are cached independently", async () => {
    const root = await makeGenomeRoot();
    await retrieveCached(root, "alpha", 4000);
    await retrieveCached(root, "beta", 4000);
    await retrieveCached(root, "alpha", 4000);
    await retrieveCached(root, "beta", 4000);
    expect(retrieveCallCount).toBe(2);
    expect(_cacheSize()).toBe(2);
  });
});

describe("retrieveCached — manifest mtime invalidation", () => {
  test("bumped manifest mtime causes cache miss", async () => {
    const root = await makeGenomeRoot();
    await retrieveCached(root, "foo", 4000);
    expect(retrieveCallCount).toBe(1);

    // Touch the manifest to bump mtime.
    await new Promise((r) => setTimeout(r, 10)); // ensure different mtime
    await writeFile(join(root, ".ashlrcode", "genome", "manifest.json"), "{}");

    await retrieveCached(root, "foo", 4000);
    expect(retrieveCallCount).toBe(2);
  });
});

describe("retrieveCached — capacity eviction", () => {
  test("cache never grows beyond 64 entries", async () => {
    const root = await makeGenomeRoot();
    // Insert 70 unique patterns.
    for (let i = 0; i < 70; i++) {
      await retrieveCached(root, `pattern-${i}`, 4000);
    }
    expect(_cacheSize()).toBeLessThanOrEqual(64);
  });
});

describe("retrieveCached — never throws", () => {
  test("does not throw when manifest path is missing", async () => {
    // genomeRoot with no manifest — manifestMtime returns 0, retriever still called.
    const root = join(tmpHome, "no-genome");
    await mkdir(root, { recursive: true });
    let threw = false;
    try {
      await retrieveCached(root, "anything", 4000);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
  });

  test("returns empty array when retriever returns empty", async () => {
    retrieveResult = [];
    const root = await makeGenomeRoot();
    const result = await retrieveCached(root, "empty-pattern", 4000);
    expect(result).toEqual([]);
  });
});
