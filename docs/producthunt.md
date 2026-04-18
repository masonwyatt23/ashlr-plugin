# ProductHunt Launch Draft

## Tagline (60 char max)

```
Open-source Claude Code plugin. −71% token waste.
```
(50 chars)

## Description (260 char max)

```
ashlr replaces Claude Code's native Read/Grep/Edit with compressed alternatives. 17 MCP tools + 25 skills. Measured −71.3% token savings on real codebases. MIT free forever. Pro adds cloud sync at $12/mo.
```
(205 chars)

---

## First comment (from the maker)

I started building ashlr in April after watching Claude Code blow through a context window on what should have been a simple refactor. The culprit was obvious once I looked: every native Read call was shipping the full file — 10,000 tokens for a file I needed three lines from.

v0.6 was a rough proof of concept: three MCP tools, a basic snip-compactor, a status line that mostly worked. The numbers were promising but not measured — I was estimating savings, not counting them.

Between v0.6 and v1.4 I built out the full accounting layer: per-session token ledger keyed by CLAUDE_SESSION_ID, an animated status line with a 7-day sparkline, a genome-aware grep path that uses TF-IDF retrieval, and a reproducible benchmark against the plugin's own codebase. The honest −71.3% number comes from that benchmark — including small edits where the plugin is actually worse than native (the diff-summary overhead beats a 15-character replacement). I kept those numbers in because the methodology has to be auditable.

A few things broke along the way that are worth being honest about. The session counter showed `+0` for weeks because Claude Code doesn't forward CLAUDE_SESSION_ID into MCP subprocesses. The `$` interpolation bug silently corrupted multi-edits containing template literals. An unrelated zombie-process issue made `/reload-plugins` look like it worked when it didn't. All three are fixed in the changelog with root causes.

860 tests pass. 2 are skipped for documented reasons. The benchmark runs weekly in CI.

If you use Claude Code on a real codebase, install the free tier and run `/ashlr-benchmark`. The number will either justify itself or it won't — either way it's your number, not mine.

Feedback welcome, especially on the genome-init workflow and anything that looks wrong about the benchmark methodology.

---

## Gallery captions (5 items)

1. **Status line in action**
   Terminal screenshot showing `ashlr · 7d ▁▂▃▅▇█ · session ↑+48.2K · lifetime +2.1M` with the animated gradient sweep and activity pulse indicator. Run `/ashlr-savings` to reproduce.

2. **ASCII dashboard**
   Terminal screenshot of `/ashlr-dashboard` — three CountUp tiles (session / lifetime / best day), per-tool horizontal bar chart, 7-day and 30-day sparklines, projected annual savings. Run `/ashlr-dashboard` on any active session.

3. **Benchmarks page**
   Browser screenshot of `plugin.ashlr.ai/benchmarks` showing the −71.3% overall number, per-tool breakdown (read −82.2%, grep −81.7%), and the methodology panel. Numbers are reproduced weekly by CI.

4. **Before / after token comparison**
   Side-by-side showing the same `ashlr__read` call: raw file (10,846 bytes / 2,709 tokens) vs ashlr output (1,623 bytes / 406 tokens). The 85% reduction on `server/tests/auth.test.ts` from `docs/benchmarks-v2.json`.

5. **Pricing**
   Browser screenshot of `plugin.ashlr.ai/pricing` — three-tier layout (Free / Pro / Team) with the feature comparison table. Emphasizes the free tier is not crippled.
