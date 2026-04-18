/**
 * Pure, deterministic animation helpers for the ashlr status line.
 *
 * Everything here is a function of (values, frame, activityMs, capability
 * flags). No I/O, no random, no Date calls inside — the caller passes time
 * in. That keeps this module trivially testable and also lets us render the
 * same frame consistently across terminals.
 *
 * Three effects compose:
 *   1. Sparkline glyph ramp — 16-rung Unicode bars/braille, with an ASCII
 *      fallback for terminals that can't do Unicode. Shows the last-N-day
 *      savings shape, same as the existing 9-rung sparkline but smoother.
 *   2. Gradient sweep — a truecolor gradient shimmering left→right across
 *      the sparkline, anchor position driven by `frame`. Terminals without
 *      truecolor fall back to a single brand color.
 *   3. Activity pulse — when a recordSaving happened in the last 4s, a
 *      bright traveling cell sweeps across the sparkline. Fades out cleanly
 *      during the 4-4.5s window rather than snapping off.
 *
 * Plus a single-char heartbeat glyph between `ashlr` and the sparkline that
 * pulses when active, sits as a dim middle-dot when idle. All widths are
 * stable: every state of every effect occupies exactly the same column
 * count, so the status line never jitters.
 */

// ---------------------------------------------------------------------------
// Capability detection
// ---------------------------------------------------------------------------

export interface Capability {
  /** Terminal supports 24-bit color escapes (`\x1b[38;2;R;G;Bm`). */
  truecolor: boolean;
  /** Terminal supports Unicode. If false we use an ASCII ramp. */
  unicode: boolean;
  /** Master animation switch. When false, output is a single static frame. */
  animate: boolean;
}

export function detectCapability(env: NodeJS.ProcessEnv = process.env): Capability {
  const noColor = truthyEnv(env.NO_COLOR);
  const animateOff = env.ASHLR_STATUS_ANIMATE === "0";
  const forceAnimate = env.ASHLR_STATUS_ANIMATE === "1";
  const colorterm = (env.COLORTERM ?? "").toLowerCase();
  const term = (env.TERM ?? "").toLowerCase();
  const truecolor = !noColor && (colorterm === "truecolor" || colorterm === "24bit" || forceAnimate);
  // Unicode is safe to assume on macOS/Linux TTYs and any terminal advertising UTF-8.
  const lang = (env.LANG ?? env.LC_ALL ?? env.LC_CTYPE ?? "").toLowerCase();
  const unicode = lang.includes("utf") || term.includes("xterm") || term.includes("256color") || truecolor;
  const animate = !animateOff && (truecolor || forceAnimate);
  return { truecolor, unicode, animate };
}

function truthyEnv(v: string | undefined): boolean {
  if (v == null) return false;
  const t = v.trim().toLowerCase();
  return t !== "" && t !== "0" && t !== "false" && t !== "no";
}

// ---------------------------------------------------------------------------
// Frame clock
// ---------------------------------------------------------------------------

export const FRAME_MS = 120;

/** Integer frame index for a given wall-clock ms. Loops within 1 day. */
export function frameAt(nowMs: number, frameMs: number = FRAME_MS): number {
  return Math.floor(nowMs / frameMs);
}

// ---------------------------------------------------------------------------
// Sparkline glyph ramps
// ---------------------------------------------------------------------------

// 16-rung ramp mixing braille (bottom half) and unicode block chars (top half)
// so the visual gradient is smoother than the 9-rung braille ladder. The
// leading cell (idx 0) is U+2800 blank-but-present braille, which keeps the
// cell from collapsing visually in some monospaced fonts.
export const UNICODE_RAMP: readonly string[] = [
  "\u2800", // 0: blank braille
  "\u2840",
  "\u2844",
  "\u2846",
  "\u2847",
  "\u28E7",
  "\u28F7",
  "\u28FF", // 7: full braille
  "\u2581", // 8: lower 1/8 block
  "\u2582",
  "\u2583",
  "\u2584",
  "\u2585",
  "\u2586",
  "\u2587",
  "\u2588", // 15: full block
];

// 5-rung ASCII fallback. Different chars at different heights so gradient
// still reads even without Unicode.
export const ASCII_RAMP: readonly string[] = [" ", ".", ":", "|", "#"];

function pickRamp(cap: Capability): readonly string[] {
  return cap.unicode ? UNICODE_RAMP : ASCII_RAMP;
}

/**
 * Map each value to a ramp index in [0, ramp.length-1]. Zero values
 * always map to rung 0; anything > 0 maps to at least rung 1 so an
 * active-but-quiet day is still visible.
 */
export function valuesToRamp(values: readonly number[], rampLen: number): number[] {
  const max = Math.max(...values, 0);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => {
    if (v <= 0) return 0;
    const last = rampLen - 1;
    return Math.max(1, Math.min(last, Math.ceil((v / max) * last)));
  });
}

// ---------------------------------------------------------------------------
// Color helpers (truecolor + fallback)
// ---------------------------------------------------------------------------

export interface RGB { r: number; g: number; b: number }

/** Ashlr brand palette. Green darker→brighter for the sparkline gradient. */
export const BRAND_DARK:  RGB = { r: 0,   g: 208, b: 156 }; // #00d09c
export const BRAND_LIGHT: RGB = { r: 124, g: 255, b: 214 }; // #7cffd6
export const PULSE_CELL: RGB = { r: 255, g: 255, b: 255 }; // bright white sweep

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

export function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

function fg(c: RGB): string { return `\x1b[38;2;${c.r};${c.g};${c.b}m`; }
const RESET = "\x1b[0m";

// ---------------------------------------------------------------------------
// Gradient sweep + activity pulse
// ---------------------------------------------------------------------------

/**
 * Compute the shimmering gradient position 0..1 for each cell of a sparkline
 * of width N, as a function of frame. The gradient moves one cell per frame,
 * wrapping cleanly.
 */
export function gradientTs(width: number, frame: number): number[] {
  if (width <= 0) return [];
  if (width === 1) return [0];
  const ts: number[] = [];
  const phase = ((frame % (width * 2)) + width * 2) % (width * 2);
  for (let i = 0; i < width; i++) {
    // Ping-pong t across [0,1] based on shifted cell index.
    const shifted = (i + phase) % (width * 2);
    const raw = shifted < width ? shifted / (width - 1) : (width * 2 - 1 - shifted) / (width - 1);
    ts.push(raw);
  }
  return ts;
}

export interface PulseState {
  /** Linear position 0..1 along the sparkline (wraps). */
  position: number;
  /** Intensity 0..1 used to blend the pulse color over the base cell. */
  intensity: number;
}

/**
 * Given ms since the last activity, compute a pulse sweep state. When
 * `msSinceActive` is small, the pulse is at full intensity and sweeps
 * left→right at one cell per frame. After 4s the pulse fades out over
 * the next 500ms, then is dormant (intensity 0).
 */
export function computePulse(frame: number, msSinceActive: number, width: number): PulseState {
  if (!Number.isFinite(msSinceActive) || msSinceActive < 0 || width <= 0) {
    return { position: 0, intensity: 0 };
  }
  const ACTIVE_MS = 4_000;
  const FADE_MS = 500;
  let intensity: number;
  if (msSinceActive <= ACTIVE_MS) intensity = 1;
  else if (msSinceActive <= ACTIVE_MS + FADE_MS) {
    intensity = 1 - (msSinceActive - ACTIVE_MS) / FADE_MS;
  } else intensity = 0;
  const position = ((frame % (width * 3)) + width * 3) % (width * 3) / (width * 3);
  return { position, intensity };
}

/**
 * Per-cell blend factor for the sweep-with-trail effect.
 *
 * The sweep reads as directed motion (L→R) via a 3-cell gradient:
 *   lead cell  (i === head)     → full brightness (factor 1.0)
 *   trail cell (i === head - 1) → half brightness (factor 0.45)
 *   dim cell   (i === head - 2) → faint echo       (factor 0.15)
 *   all others                  → no pulse effect  (factor 0.0)
 *
 * All indices wrap modulo `width` so the effect is seamless at the edges.
 * The returned factor is multiplied by `pulse.intensity` before blending so
 * the whole sweep fades together during the 4–4.5s window.
 */
export function sweepFactor(cellIndex: number, headCell: number, width: number): number {
  const w = Math.max(1, width);
  const delta = ((cellIndex - headCell) % w + w) % w;
  // delta 0 = lead, delta w-1 = one behind (i.e. trail), delta w-2 = dim echo.
  if (delta === 0) return 1.0;
  if (delta === w - 1) return 0.45;
  if (delta === w - 2) return 0.15;
  return 0.0;
}

// ---------------------------------------------------------------------------
// Heartbeat glyph (single char between "ashlr" and the sparkline)
// ---------------------------------------------------------------------------

// 15-frame braille wave: rising then falling. When idle we emit a dim middle
// dot instead.
export const HEARTBEAT_FRAMES = [
  "\u2840", "\u2844", "\u2846", "\u2847", "\u28C7",
  "\u28E7", "\u28F7", "\u28FF", "\u28F7", "\u28E7",
  "\u28C7", "\u2847", "\u2846", "\u2844", "\u2840",
] as const;
export const HEARTBEAT_IDLE = "\u00B7"; // middle dot
export const HEARTBEAT_ASCII_IDLE = ".";
export const HEARTBEAT_ASCII_ACTIVE = ["-", "=", "*", "=", "-"] as const;

export function renderHeartbeat(frame: number, msSinceActive: number, cap: Capability): string {
  const active = msSinceActive <= 4_500; // includes 500ms fade window
  if (!cap.animate) {
    return cap.unicode ? HEARTBEAT_IDLE : HEARTBEAT_ASCII_IDLE;
  }
  if (!active) {
    const idle = cap.unicode ? HEARTBEAT_IDLE : HEARTBEAT_ASCII_IDLE;
    return cap.truecolor ? `${fg({ r: 100, g: 110, b: 120 })}${idle}${RESET}` : idle;
  }
  const frames = cap.unicode ? HEARTBEAT_FRAMES : HEARTBEAT_ASCII_ACTIVE;
  const ch = frames[((frame % frames.length) + frames.length) % frames.length]!;
  if (!cap.truecolor) return ch;
  // Fade color with activity intensity — pop bright right after a saving,
  // settle to brand green as we approach the fade window.
  const ACTIVE_MS = 4_000;
  const FADE_MS = 500;
  const t = msSinceActive <= ACTIVE_MS
    ? 0
    : Math.min(1, (msSinceActive - ACTIVE_MS) / FADE_MS);
  const color = lerpColor(BRAND_LIGHT, BRAND_DARK, t);
  return `${fg(color)}${ch}${RESET}`;
}

// ---------------------------------------------------------------------------
// Full sparkline render
// ---------------------------------------------------------------------------

export interface RenderSparklineInput {
  values: readonly number[];
  frame: number;
  msSinceActive: number;
  cap: Capability;
}

export function renderSparkline({ values, frame, msSinceActive, cap }: RenderSparklineInput): string {
  const ramp = pickRamp(cap);
  const idxs = valuesToRamp(values, ramp.length);
  const chars = idxs.map((i) => ramp[i]!);
  if (!cap.animate || !cap.truecolor) {
    // Static — emit chars possibly with a single brand-green color if color
    // is enabled but animation isn't.
    return chars.join("");
  }
  const ts = gradientTs(chars.length, frame);
  const pulse = computePulse(frame, msSinceActive, chars.length);
  // Head cell of the 3-cell sweep (lead → trail → dim-echo).
  const headCell = pulse.intensity > 0
    ? Math.floor(pulse.position * chars.length) % chars.length
    : -1;
  const parts: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const base = lerpColor(BRAND_DARK, BRAND_LIGHT, ts[i] ?? 0);
    let color = base;
    if (headCell >= 0) {
      const factor = sweepFactor(i, headCell, chars.length) * pulse.intensity;
      if (factor > 0) {
        color = lerpColor(base, PULSE_CELL, factor);
      }
    }
    parts.push(`${fg(color)}${chars[i]}`);
  }
  parts.push(RESET);
  return parts.join("");
}

/**
 * Visible (character) width of a rendered string — strips ANSI escapes. Used
 * by the status line to enforce its 80-column budget regardless of color.
 */
export function visibleWidth(s: string): number {
  // Strip ESC[…m style sequences.
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  // Count code points (handles multi-byte Unicode, but not wide-vs-narrow
  // — in the status line we control the glyph set and all our chars are
  // narrow so this is fine).
  return Array.from(stripped).length;
}

// ---------------------------------------------------------------------------
// Context-pressure widget
// ---------------------------------------------------------------------------

/** Color tiers for context pressure. */
const CTX_GREEN:  RGB = { r: 0,   g: 160, b: 120 }; // dim brand-green
const CTX_YELLOW: RGB = { r: 212, g: 167, b: 44  }; // #d4a72c
const CTX_ORANGE: RGB = { r: 217, g: 121, b: 58  }; // #d9793a
const CTX_RED:    RGB = { r: 225, g: 91,  b: 91  }; // #e15b5b

/**
 * Render the context-pressure micro-widget for a given percentage (0–100).
 *
 * Returns a string like `ctx: 72%` (8–9 visible chars). When `cap.truecolor`
 * is false the string is returned plain (no ANSI). Never lies — callers must
 * only call this when they have a real percentage.
 *
 * Color tiers:
 *   0–60%:  dim brand-green
 *   60–80%: yellow  (#d4a72c)
 *   80–95%: orange  (#d9793a)
 *   95%+:   red + bold (#e15b5b)
 */
export function renderContextPressure(pct: number, cap: Capability): string {
  const label = `ctx: ${Math.round(pct)}%`;
  if (!cap.truecolor) return label;

  let color: RGB;
  let bold = false;
  if (pct >= 95) {
    color = CTX_RED;
    bold = true;
  } else if (pct >= 80) {
    color = CTX_ORANGE;
  } else if (pct >= 60) {
    color = CTX_YELLOW;
  } else {
    color = CTX_GREEN;
  }

  const boldOn  = bold ? "\x1b[1m" : "";
  const boldOff = bold ? "\x1b[22m" : "";
  return `${fg(color)}${boldOn}${label}${boldOff}${RESET}`;
}

// ---------------------------------------------------------------------------
// Activity indicator (single glyph next to session counter)
// ---------------------------------------------------------------------------

/**
 * Returns a single-character activity indicator when `msSinceActive` is within
 * the active window (4 seconds), or an empty string when idle.
 *
 * Width contract: always 0 or 1 visible character — never changes the column
 * count of the surrounding text by more than 1.
 *
 * Active states:
 *   truecolor + unicode: "↑" rendered in BRAND_LIGHT green  → 1 visible char
 *   plain unicode:       "↑"  plain                         → 1 visible char
 *   ASCII fallback:      "+"  plain                         → 1 visible char
 *
 * Idle: "" (empty string, 0 visible chars).
 *
 * The caller decides whether to include the indicator in the `session +N`
 * segment. Typical usage: `session ${activityIndicator(...)}+N`.
 */
export const ACTIVITY_ACTIVE_MS = 4_000;
export const ACTIVITY_GLYPH_UNICODE = "\u2191"; // ↑ UPWARDS ARROW
export const ACTIVITY_GLYPH_ASCII   = "+";

export function activityIndicator(msSinceActive: number, cap: Capability): string {
  if (!Number.isFinite(msSinceActive) || msSinceActive > ACTIVITY_ACTIVE_MS) return "";
  const glyph = cap.unicode ? ACTIVITY_GLYPH_UNICODE : ACTIVITY_GLYPH_ASCII;
  if (!cap.truecolor) return glyph;
  // Pulse color: full BRAND_LIGHT right after a save, fading to BRAND_DARK
  // as we approach the 4s boundary.
  const t = msSinceActive / ACTIVITY_ACTIVE_MS; // 0 = fresh, 1 = about to expire
  const color = lerpColor(BRAND_LIGHT, BRAND_DARK, t);
  return `${fg(color)}${glyph}${RESET}`;
}
