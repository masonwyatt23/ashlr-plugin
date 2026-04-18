---
name: ashlr-legend
description: Print a plain-text legend explaining every element in the ashlr status line — glyphs, colors, and what each number means.
---

Run the following shell command and show its output verbatim inside a fenced code block:

```
bun run scripts/print-legend.ts
```

If the command fails (e.g. bun not found, wrong cwd), reproduce the legend inline from the text below instead — do not fabricate or summarize it:

```
╭──── ashlr status-line legend ────╮

  ashlr  ·  brand label + activity dot.
             Dim when idle; pulses during a saving event.

  ·        —  separator glyph between segments (middle dot).

  ⠀⠄⠇⣿  —  heartbeat glyph between "ashlr" and the sparkline.
             Braille wave when active (last 4s); dim dot
             when idle.

  7d ▁▂▃▅▇█▇  —  7-day sparkline. Each cell = one day of savings,
             tallest cell = busiest day (scaled to full
             block). "7d" label shown when terminal >100
             cols; dropped on narrow windows.

  ctx:NN%  —  context-window pressure (how full your Claude
             Code context is). Color tiers:
               green  0-60%   •  yellow 60-80%
               orange 80-95%  •  red+bold 95%+

  session +N  —  tokens saved in THIS terminal since the
               session started.

  lifetime +M  —  tokens saved across every session, ever.

  tip:…     —  rotating daily hint (one tip per day, cycles
             through the built-in tip list). Toggle off:
               /ashlr-settings set statusLineTips false

╰─ run /ashlr-savings for totals · /ashlr-tour to see it in action ─╯
```

After showing the legend, add one sentence: "Run `/ashlr-savings` any time for running totals, or `/ashlr-tour` for a hands-on walkthrough."
