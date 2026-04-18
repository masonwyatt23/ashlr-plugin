# Changelog

## 0.1.0 — 2026-04-17

Initial release.

- Status bar item showing session and lifetime token savings (polls `~/.ashlr/stats.json` every 2 s).
- Dashboard webview with hero tiles, per-tool bar chart, 7-day and 30-day sparklines, and projected annual savings.
- Inline gutter badges estimating savings next to Read/Edit/Grep call sites.
- Command palette commands: Show Dashboard, Open Genome Folder, Run Benchmark, Show Savings, Sign in to Pro.
- Settings: `ashlr.statsPath`, `ashlr.pollIntervalMs`, `ashlr.showGutterBadges`.
