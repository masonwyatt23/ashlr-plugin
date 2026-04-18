---
name: ashlr-handoff
description: Generate a context-pack for the next session to resume cold.
argument-hint: "[--session <id>] [--last] [--dir <path>]"
---

Run the handoff-pack script and render its output to the user.

```sh
bun run "${CLAUDE_PLUGIN_ROOT}/scripts/handoff-pack.ts" "$@"
```

Capture stdout and display it verbatim.

The script writes a markdown file to `~/.ashlr/handoffs/YYYY-MM-DD-HHMMSS-<rand>.md`
containing:

- Session summary (calls, tokens saved, dominant tools).
- Recent files touched in this session (top 10 unique paths).
- Genome status for the current project.
- Open todos from the latest TodoWrite call in this session.
- A footer with the paste-ready path to the handoff file.

Flags:
- `--session <id>` — pack a specific session instead of the current one.
- `--last` — re-print the most recent existing handoff (no new write).
- `--dir <path>` — write handoffs to a custom directory.

After displaying the output, tell the user:
"At the start of your next session, paste the contents of that file to
restore context instantly."

Do not paraphrase the path or file contents.
