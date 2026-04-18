---
name: ashlr-coach
description: Show proactive token-saving nudges based on your usage history.
argument-hint: "[--days N]"
---

Run the coach report and render its output to the user.

```sh
bun run "${CLAUDE_PLUGIN_ROOT}/scripts/coach-report.ts" "$@"
```

Capture stdout and display it verbatim inside a fenced code block (```) so
column alignment renders correctly.

The report scans the session log for the last 7 days (or `--days N`) and
emits up to 5 actionable bullets when any of these patterns are detected:

- Native Read called on large files (> 2KB) — wasted tokens estimate.
- Native Grep calls — ashlr__grep is ~5x smaller per call.
- Bash commands returning very large output — ashlr__bash auto-compresses.
- Heavy ashlr__grep usage in a project with no genome.
- Repeated reads of the same file within one session.

After the verbatim block, add **at most one** short line:
- If the output contains "No obvious improvements": "Great — keep using the
  ashlr tools and the savings will compound."
- Otherwise: say nothing extra. The bullets speak for themselves.

Do not paraphrase the numbers.
