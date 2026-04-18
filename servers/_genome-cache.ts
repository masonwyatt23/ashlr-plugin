/**
 * In-memory LRU cache for genome retrieval results.
 *
 * Wraps retrieveSectionsV2 from @ashlr/core-efficiency with a 64-entry LRU
 * keyed by (genomeRoot, pattern). Entries are invalidated when the genome
 * manifest mtime changes — detected cheaply on each cache hit.
 *
 * Never throws: on any miss or error, falls through to direct retrieval.
 */

import { statSync } from "fs";
import { join } from "path";
import { retrieveSectionsV2 as _retrieveSectionsV2 } from "@ashlr/core-efficiency";

const CAPACITY = 64;

type Retriever = typeof _retrieveSectionsV2;

interface CacheEntry {
  result: Awaited<ReturnType<Retriever>>;
  manifestMtime: number;
  /** LRU recency counter — higher = more recent. */
  lru: number;
}

const cache = new Map<string, CacheEntry>();
let lruClock = 0;

function manifestMtime(genomeRoot: string): number {
  try {
    return statSync(join(genomeRoot, ".ashlrcode", "genome", "manifest.json")).mtimeMs;
  } catch {
    return 0;
  }
}

function cacheKey(genomeRoot: string, pattern: string): string {
  return `${genomeRoot}\x00${pattern}`;
}

function evictLRU(): void {
  if (cache.size < CAPACITY) return;
  let oldestKey = "";
  let oldestLru = Infinity;
  for (const [k, v] of cache) {
    if (v.lru < oldestLru) { oldestLru = v.lru; oldestKey = k; }
  }
  if (oldestKey) cache.delete(oldestKey);
}

/**
 * Retrieve genome sections, returning a cached result when the manifest mtime
 * has not changed since the last retrieval for this (genomeRoot, pattern).
 *
 * The optional `retriever` parameter exists solely for testing: callers can
 * inject a stub without needing `mock.module`, which would leak module state
 * across the full test suite.  Production callers omit it and get the real
 * `retrieveSectionsV2` from @ashlr/core-efficiency.
 */
export async function retrieveCached(
  genomeRoot: string,
  pattern: string,
  limit: number,
  retriever: Retriever = _retrieveSectionsV2,
): Promise<Awaited<ReturnType<Retriever>>> {
  const key = cacheKey(genomeRoot, pattern);
  const mtime = manifestMtime(genomeRoot);
  const entry = cache.get(key);

  if (entry && entry.manifestMtime === mtime) {
    entry.lru = ++lruClock;
    return entry.result;
  }

  // Miss or stale — retrieve directly. Never throw.
  try {
    const result = await retriever(genomeRoot, pattern, limit);
    evictLRU();
    cache.set(key, { result, manifestMtime: mtime, lru: ++lruClock });
    return result;
  } catch {
    return [];
  }
}

/** Exposed for tests — clears all cache state. */
export function _clearCache(): void {
  cache.clear();
  lruClock = 0;
}

/** Exposed for tests — current cache size. */
export function _cacheSize(): number {
  return cache.size;
}
