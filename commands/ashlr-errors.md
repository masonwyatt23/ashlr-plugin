---
name: ashlr-errors
description: Show recent MCP server errors with deduplication.
argument-hint: "[--hours N]"
---

Run the errors report and render its output to the user.

```sh
bun run "${CLAUDE_PLUGIN_ROOT}/scripts/errors-report.ts" $ARGUMENTS
```

Capture stdout and display it verbatim inside a fenced code block (```) so column alignment renders correctly.

The report covers:
- Header: total errors, unique signatures, time window, time range.
- Top 10 error signatures by frequency — count, first-seen, last-seen, one-line sample.
- Per-tool error breakdown (from session-log `tool_error` events): tool name and count.
- If zero errors: a clean "(no errors recorded in the last Nh)" message.

The default window is the last 168 hours (7 days). Pass `--hours N` to narrow or widen it.

After the verbatim block, add **at most one** short line:
- If the output contains "no errors recorded": "No errors in the log — things look clean."
- Otherwise: say nothing extra. The report speaks for itself.

Do not paraphrase the numbers.
