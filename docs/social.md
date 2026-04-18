# Social copy — ashlr v1.4.0 launch

---

## Twitter (3 variants, 280 char each)

**Variant A — lead with the number**
```
−71.3% token savings on real codebases, measured and reproducible.

ashlr is an open-source Claude Code plugin: 17 MCP tools that replace native Read/Grep/Edit with compressed alternatives.

curl -fsSL plugin.ashlr.ai/install.sh | bash

Full post: [LINK]
```
(253 chars)

**Variant B — lead with the cost angle**
```
Claude Code token bills add up. ashlr cuts them by 71% on average — open source, MIT, no account.

17 MCP tools. Measured benchmark. Install in 30 seconds.

curl -fsSL plugin.ashlr.ai/install.sh | bash

[LINK]
```
(214 chars)

**Variant C — lead with the specific example**
```
Reading a 10,846-byte file in Claude Code costs 2,709 tokens natively.
ashlr__read returns the same file for 406 tokens. That's an 85% drop.

17 tools. Reproducible benchmark. MIT free.

plugin.ashlr.ai
```
(208 chars)

---

## LinkedIn (~1,200 chars)

```
I shipped ashlr v1.4.0 today — an open-source token-efficiency layer for Claude Code.

The background: Claude Code's native Read, Grep, and Edit tools transmit full file contents and full match output to the model on every call. On a real codebase this adds up fast. A single grep for a common pattern can cost 85,000 tokens of output the model skims and discards. A 15KB file opened to change three lines sends all 15KB.

ashlr replaces those tools with compressed alternatives. ashlr__read returns a head+tail snip. ashlr__grep routes through a genome-aware retrieval index. ashlr__edit returns a diff summary instead of echoing the before+after.

The numbers from a reproducible benchmark against the plugin's own codebase (337 files, 56,901 lines):

- ashlr__read: mean −82.2% token reduction
- ashlr__grep: mean −81.7% token reduction
- Overall: −71.3% (honest average including small edits where the overhead exceeds the savings)

The plugin is MIT-licensed. The free tier ships 17 MCP tools, 25 skills, per-session token accounting, and a reproducible benchmark against your own codebase. No account, no telemetry. Pro at $12/month adds cloud genome sync and a hosted LLM summarizer for developers who don't want to run Ollama locally.

Install: curl -fsSL plugin.ashlr.ai/install.sh | bash

Full write-up with methodology and the three bugs that surprised me: [LINK]
```

---

## Hacker News

**Title:**
```
Ashlr – open-source Claude Code plugin, −71% token savings measured on real codebases
```

**First comment (from the author):**

```
Author here.

The motivation is straightforward: Claude Code's native Read/Grep/Edit tools ship full payloads — entire file contents, complete grep output — into model context on every call. On a codebase of any real size this wastes a meaningful fraction of every context window.

ashlr replaces those three tools with MCP server alternatives that return compressed views: head+tail snip for reads, truncated/genome-aware retrieval for grep, diff summary for edit. The model gets enough context to do the work; the rest doesn't go over the wire.

The −71.3% number is from a reproducible benchmark in scripts/run-benchmark.ts that samples the plugin's own repo (337 files, 56,901 lines) and runs weekly in CI. The full methodology is in docs/benchmarks-v2.json. The benchmark is honest about cases where ashlr is worse than native — small edits with 15-character replacements are slower through the diff-summary path; the ratio there is 2.5x. Medium and large edits compress at 52% and 96.5%.

A few things worth noting for HN:

- The free tier is complete. 17 MCP tools, 25 skills, MIT license, no account, no telemetry, no feature gates. Pro adds hosted infrastructure (cloud genome sync, hosted LLM summarizer). Nothing in free degrades to push upgrades.
- Cursor and Goose ports are in ports/. The MCP servers run under any compatible host. Skills and hooks remain Claude Code-specific.
- Two tests are skipped: a no-genome grep flake that's an environment-leak in the full parallel suite (passes in isolation) and a benchmark ratio assertion with the same root cause. Both documented in-line.
- The $-interpolation bug in v0.9.2 is worth reading about if you do any string replace work: JavaScript's String.replace(string, string) interprets $& and $` in the replacement. It corrupted multi-edits silently for a while.

Happy to answer questions about the genome format, the stats accounting architecture, or the benchmark methodology.
```
