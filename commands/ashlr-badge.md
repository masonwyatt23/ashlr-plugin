---
name: ashlr-badge
description: Generate and save an ashlr savings badge SVG you can embed in your GitHub profile README.
---

Run the badge generator and save to `~/.ashlr/badge.svg`:

```
bun run /Users/masonwyatt/Desktop/ashlr-plugin/scripts/generate-badge.ts --out ~/.ashlr/badge.svg
```

For a dollars metric:
```
bun run /Users/masonwyatt/Desktop/ashlr-plugin/scripts/generate-badge.ts --metric dollars --out ~/.ashlr/badge.svg
```

For a card-style badge with a mini bar chart:
```
bun run /Users/masonwyatt/Desktop/ashlr-plugin/scripts/generate-badge.ts --style card --out ~/.ashlr/badge.svg
```

After running, report success with:
1. The full local file path where the SVG was written (e.g. `/Users/<you>/.ashlr/badge.svg`).
2. The exact Markdown snippet the user can paste into their GitHub profile README:

```markdown
![ashlr savings](./badge.svg)
```

> For local copies of the badge in the same repo directory, use the relative path above. If you copy the SVG to your profile repo root and commit it, GitHub will render it inline.

3. A one-line note: "A hosted dynamic version (auto-updating URL) is on the ashlr roadmap."

**Flags reference** (append any of these to the command above):
- `--metric tokens|dollars|calls` — what the right cell shows (default: `tokens`)
- `--style flat|pill|card` — shape variant; `card` is 240×80 with a daily bar chart (default: `pill`)
- `--window lifetime|last30|last7` — time window for the number (default: `lifetime`)
- `--out <path>` — write to a custom path instead of stdout
- `--serve` — start a local HTTP server at `http://localhost:7777/ashlr.svg` for live preview
