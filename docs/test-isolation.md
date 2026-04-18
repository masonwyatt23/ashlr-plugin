# Test Isolation in the ashlr-plugin Suite

## Why Bun shares module state across test files

Bun runs all test files in a single worker process (by default). Every `import`
resolves against a shared module cache, so a module imported by `a.test.ts` and
then imported again by `b.test.ts` returns the *same* object — not a fresh copy.

Consequences:

- **Module-level variables** (caches, flags, counters) survive between files.
- **`mock.module(specifier, factory)`** replaces the module in that shared cache
  and is *not* automatically restored when the test file finishes. Bun's
  `mock.restore()` only clears `mockFn` spies, not `mock.module` overrides.
- **`process.env` mutations** are visible to all subsequent imports and code that
  reads env at call-time.

## Patterns to follow

### 1. Save and restore `process.env` in outer scope

If a test must set an env var, capture the original value before `beforeEach`
and restore it in `afterEach`:

```ts
let origHome: string | undefined;

beforeEach(() => { origHome = process.env.HOME; process.env.HOME = tmpDir; });
afterEach(() => {
  if (origHome !== undefined) process.env.HOME = origHome;
  else delete process.env.HOME;
});
```

### 2. Never use `mock.module` for shared packages

`mock.module` leaks permanently into the module cache. Prefer **dependency
injection**: add an optional `retriever` / `logger` / `handler` parameter to
the production function, defaulting to the real implementation.  Tests pass
stubs via that parameter — no module patching needed.

```ts
// production code
export async function retrieveCached(
  root: string, pattern: string, limit: number,
  retriever: Retriever = _retrieveSectionsV2,  // real default
) { ... }

// test code — no mock.module
await retrieveCached(root, "foo", 4000, stubRetriever);
```

### 3. Clear module-level caches in `beforeEach`

Any module that exposes a `_clearCache()` / `_resetXxx()` test hook must be
called in `beforeEach`, not just `afterEach`. Running it only in `afterEach`
leaves stale state if the previous test in another file did not clean up.

### 4. Use `ASHLR_STATS_SYNC=1` when asserting on-disk state

`_stats.ts` debounces file writes by 250 ms. Tests that assert a stats file was
written must either:

- set `ASHLR_STATS_SYNC=1` in the test environment (disables debounce), or
- poll with a bounded wait loop after the action.

### 5. Spawn subprocesses with a minimal env

When a test spawns an MCP server subprocess to verify event emission, pass only
the env vars the subprocess actually needs:

```ts
env: { HOME: isolatedTmpDir, PATH: process.env.PATH ?? "/usr/bin:/bin" }
```

Stripping the full `process.env` prevents a previously mutated `HOME` or
`ASHLR_SESSION_LOG_PATH` from leaking into the subprocess.

## Fixes applied in this repo

### Leaker: `__tests__/genome-cache.test.ts`

**What leaked:** A top-level `mock.module("@ashlr/core-efficiency", ...)` call
that replaced the entire package — including `estimateTokensFromString: () => 0`
— in Bun's shared module cache.  Every test file loaded after
`genome-cache.test.ts` (alphabetically: `genome-init`, `genome-live`, …,
`run-benchmark`, …) received the stubbed module.  `run-benchmark.test.ts`
calls `estimateTokensFromString` to measure token savings; with the stub
returning 0, every ratio computed as `0 / 0 → 1`, making the
`medium/large ratio < 1` assertion fail.

**Fix:** Refactored `servers/_genome-cache.ts` to accept an optional `retriever`
parameter (defaulting to the real `retrieveSectionsV2`). Rewrote
`genome-cache.test.ts` to pass a stub directly — no `mock.module` needed.

### Affected skip removed: `run-benchmark.test.ts`

`test.skip("ashlr__edit medium and large samples have ratio < 1 …")` was
un-skipped once the `genome-cache.test.ts` leak was fixed. The test passes
reliably in both isolation and the full suite.
