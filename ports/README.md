# ashlr in other MCP hosts

Ashlr is a suite of MCP servers. The servers speak the standard Model Context
Protocol over stdio and work in any MCP-compatible host, not just Claude Code.

This directory contains ready-made config snippets for two hosts: Cursor and Goose.

---

## Install

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/ashlrai/ashlr-plugin
   cd ashlr-plugin
   bun install
   ```

2. Note the absolute path to your clone. You will substitute it for
   `<ASHLR_PLUGIN_ROOT>` in the config files below.

The entry point for every server is `scripts/mcp-entrypoint.sh`. It resolves
the plugin root, sets environment variables, and launches the server with `bun`.

---

## Cursor

Cursor reads MCP server config from `.cursor/mcp.json` in your project, or from
`~/.cursor/mcp.json` globally.

Copy `ports/cursor/mcp.json` to one of those locations, then replace every
occurrence of `<ASHLR_PLUGIN_ROOT>` with the absolute path to your clone:

```bash
# Example using sed
ASHLR_ROOT="/home/you/ashlr-plugin"
sed "s|<ASHLR_PLUGIN_ROOT>|$ASHLR_ROOT|g" \
  ports/cursor/mcp.json > ~/.cursor/mcp.json
```

Restart Cursor. The 14 ashlr tools will appear in the MCP panel.

---

## Goose

Goose reads extensions from a recipe file passed at run time.

Copy `ports/goose/recipe.yaml`, replace `<ASHLR_PLUGIN_ROOT>`, then run:

```bash
ASHLR_ROOT="/home/you/ashlr-plugin"
sed "s|<ASHLR_PLUGIN_ROOT>|$ASHLR_ROOT|g" \
  ports/goose/recipe.yaml > my-ashlr-recipe.yaml

goose run --recipe my-ashlr-recipe.yaml
```

---

## Caveats

The following features are Claude Code-specific and are not available in
Cursor or Goose:

- **Skills** (`/ashlr-savings`, `/ashlr-genome-init`, etc.) — these are Claude
  Code slash commands defined in `.claude-plugin/plugin.json`.
- **Status line** — the animated token-savings counter in the Claude Code
  terminal is wired to Claude Code's `statusLine` hook.
- **Session hooks** — genome auto-propose, session-start greeting, and
  session-end consolidation run via Claude Code's pre/post tool-use hooks.

The underlying MCP tools (`ashlr__read`, `ashlr__grep`, `ashlr__edit`, etc.)
work identically in any host. Token savings are still tracked: the stats server
writes to `~/.ashlr/stats.json` on every call regardless of the host.

### Shell prompt integration

If you want a savings counter in your shell prompt, run the status-line script
as a subshell command:

```bash
# bash / zsh — add to PS1 or PROMPT
PS1='$(bun run /path/to/ashlr-plugin/scripts/savings-status-line.ts) \$ '
```

The script reads `~/.ashlr/stats.json` and prints a compact savings summary
suitable for embedding in any shell prompt.

---

## Servers included

All 14 servers from `.claude-plugin/plugin.json` are registered in both configs:

| Server | Entry point |
|---|---|
| ashlr-efficiency | servers/efficiency-server.ts |
| ashlr-sql | servers/sql-server.ts |
| ashlr-bash | servers/bash-server.ts |
| ashlr-tree | servers/tree-server.ts |
| ashlr-http | servers/http-server.ts |
| ashlr-diff | servers/diff-server.ts |
| ashlr-logs | servers/logs-server.ts |
| ashlr-genome | servers/genome-server.ts |
| ashlr-orient | servers/orient-server.ts |
| ashlr-github | servers/github-server.ts |
| ashlr-glob | servers/glob-server.ts |
| ashlr-webfetch | servers/webfetch-server.ts |
| ashlr-multi-edit | servers/multi-edit-server.ts |
| ashlr-ask | servers/ask-server.ts |
