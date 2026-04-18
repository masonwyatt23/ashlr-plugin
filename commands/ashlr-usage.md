---
name: ashlr-usage
description: Show tool usage patterns from the session log.
argument-hint: "[--hours N]"
---

Run the session-log report and render its output to the user.

```sh
bun run "${CLAUDE_PLUGIN_ROOT}/scripts/session-log-report.ts"
```

Capture stdout and display it verbatim inside a fenced code block (```) so column alignment renders correctly.

The report covers:
- Header: total calls, unique sessions, unique projects, log time range.
- Top 10 tools by call count, with median input/output sizes.
- Per-project breakdown (top 5 by call count): project name, call count, tool variety.
- Last-24h vs lifetime comparison: calls, approximate tokens, tools used.
- Session summary: recent session_end events from the last 7 days, with duration, call count, and tokens saved.

After the verbatim block, add **at most one** short line:
- If the output contains "no activity recorded yet": "No session log data yet — tool calls are recorded automatically as you work."
- Otherwise: say nothing extra. The report speaks for itself.

Do not paraphrase the numbers.
