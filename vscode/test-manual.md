# ashlr VS Code Extension — Manual QA Checklist

Run these checks after `bun run build` and loading the extension with "Run Extension" (F5) in VS Code.

## Setup

- [ ] `cd vscode && bun install` completes without errors.
- [ ] `bun run build` produces `out/extension.js` without TypeScript or esbuild errors.
- [ ] Opening the Extension Development Host (`F5`) activates the extension without errors in the Debug Console.

## Status Bar

- [ ] Status bar item appears in the bottom-right corner.
- [ ] When `~/.ashlr/stats.json` does not exist, status bar shows `ashlr · not running` in warning color.
- [ ] When `stats.json` exists with valid data, status bar shows `ashlr · session +N · lifetime +M` with correct token counts.
- [ ] Clicking the status bar item opens the dashboard webview.
- [ ] Changing `ashlr.pollIntervalMs` in settings restarts the polling timer (verify in Debug Console).

## Dashboard Webview

- [ ] `ashlr: Show Dashboard` command opens a webview tab titled "ashlr dashboard".
- [ ] With no stats data: empty-state message is shown with a link to plugin.ashlr.ai.
- [ ] With stats data: three hero tiles (session / lifetime / best day) render with correct values.
- [ ] Per-tool bar chart shows up to 8 tools, sorted descending by tokens saved.
- [ ] Bar fills animate from 0 to their target width on open.
- [ ] 7-day and 30-day sparkline SVGs render (bars visible for days with data).
- [ ] Projected annual savings row appears when there is 30-day data.
- [ ] "Open full dashboard" link is present at the bottom.
- [ ] Webview auto-refreshes every 2 s (verify by appending a row to stats.json manually).
- [ ] Dark theme: colors switch to dark palette.
- [ ] Light theme: parchment palette renders correctly.

## Gutter Decorations

- [ ] Open a TypeScript file containing a line like `ashlr__read("path/to/file.ts")`.
- [ ] A grey italic badge `~N tokens saved via ashlr` appears at the end of that line.
- [ ] Setting `ashlr.showGutterBadges` to `false` removes all badges immediately.
- [ ] Re-enabling the setting restores badges.
- [ ] Badge estimate reflects file size (larger file = larger estimate).

## Commands

- [ ] `ashlr: Show Dashboard` — opens/focuses dashboard panel.
- [ ] `ashlr: Open Genome Folder` — with a workspace open and `.ashlrcode/genome/` present, reveals it in the Explorer.
- [ ] `ashlr: Open Genome Folder` — when the folder is absent, prompts to create it; accepting creates the folder and `.gitkeep` file.
- [ ] `ashlr: Run Benchmark` — with the ashlr-plugin repo as the workspace root, opens a terminal and runs the benchmark script.
- [ ] `ashlr: Run Benchmark` — without the plugin repo open, shows an error message.
- [ ] `ashlr: Show Savings` — opens a webview panel with plain-text savings summary including session, lifetime, best day, and projected annual rows.
- [ ] `ashlr: Show Savings` — with no data, shows an info message.
- [ ] `ashlr: Sign in to Pro` — opens `https://plugin.ashlr.ai/signin` in the default browser.

## Settings

- [ ] `ashlr.statsPath` — set to a custom path; status bar and dashboard read from that file.
- [ ] `ashlr.pollIntervalMs` — change to 500; status bar refreshes noticeably faster.
- [ ] `ashlr.showGutterBadges` — toggle; badges appear and disappear without reload.

## Extension Packaging (do not publish yet)

- [ ] `npx vsce package` (or `bun run package`) completes and produces `ashlr-0.1.0.vsix`.
- [ ] VSIX contains `out/extension.js`, `resources/dashboard.css`, `webview/dashboard.js`, `resources/icon.png`, `package.json`, `README.md`, `LICENSE`.
- [ ] VSIX does not contain `src/`, `node_modules/`, `test-manual.md`.
