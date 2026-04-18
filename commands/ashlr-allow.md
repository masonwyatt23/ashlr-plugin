---
name: ashlr-allow
description: Auto-approve every ashlr MCP tool so Claude Code stops prompting in bypass-permissions mode.
---

Run the permissions installer and render its output.

```sh
bun run "${CLAUDE_PLUGIN_ROOT}/scripts/install-permissions.ts"
```

Capture stdout and display it to the user verbatim.

Then tell the user:

- Which entries were added (or that all were already present).
- That Claude Code must be **restarted** (or `/reload-plugins` run) to pick up the settings change before the prompts disappear.
- If they want to undo, they can run: `bun run "${CLAUDE_PLUGIN_ROOT}/scripts/install-permissions.ts" --remove`
- If they want to preview without writing, they can run with `--dry-run`.

Do not paraphrase the installer output — show it as-is, then add the above notes only if the installer did not already mention them.
