#!/usr/bin/env bun
/**
 * print-legend.ts
 *
 * Emits a plain-text ASCII legend for every element in the ashlr status line.
 * Invoked by the /ashlr-legend skill. No I/O dependencies beyond stdout.
 *
 * Output is designed for a monospace terminal, <=60 visible chars per line
 * for the structured rows (the description wraps with a hanging indent).
 * Box-drawing characters (U+256x) are used for the header/footer frame;
 * they render as plain hyphens in terminals that strip Unicode.
 */

const LEGEND = `\u256d\u2500\u2500\u2500\u2500 ashlr status-line legend \u2500\u2500\u2500\u2500\u256e

  ashlr  \u00b7  brand label + activity dot.
             Dim when idle; pulses during a saving event.

  \u00b7        \u2014  separator glyph between segments (middle dot).

  \u2840\u2844\u2847\u28FF  \u2014  heartbeat glyph between "ashlr" and the sparkline.
             Braille wave when active (last 4s); dim dot
             when idle.

  7d \u2581\u2582\u2583\u2585\u2587\u2588\u2587  \u2014  7-day sparkline. Each cell = one day of savings,
             tallest cell = busiest day (scaled to full
             block). "7d" label shown when terminal >100
             cols; dropped on narrow windows.

  ctx:NN%  \u2014  context-window pressure (how full your Claude
             Code context is). Color tiers:
               green  0-60%   \u2022  yellow 60-80%
               orange 80-95%  \u2022  red+bold 95%+

  session +N  \u2014  tokens saved in THIS terminal since the
               session started.

  lifetime +M  \u2014  tokens saved across every session, ever.

  tip:\u2026     \u2014  rotating daily hint (one tip per day, cycles
             through the built-in tip list). Toggle off:
               /ashlr-settings set statusLineTips false

\u2570\u2500 run /ashlr-savings for totals \u00b7 /ashlr-tour to see it in action \u2500\u256f`;

if (import.meta.main) {
  process.stdout.write(LEGEND + "\n");
}

export { LEGEND };
