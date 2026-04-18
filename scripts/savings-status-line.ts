#!/usr/bin/env bun
/**
 * ashlr status line script.
 *
 * Claude Code invokes this command periodically and renders the first line of
 * stdout in its status bar. We surface lifetime + session token-savings from
 * ~/.ashlr/stats.json, gated by toggles in ~/.claude/settings.json under the
 * "ashlr" key:
 *
 *   {
 *     "ashlr": {
 *       "statusLine":         true,   // master switch (default: true)
 *       "statusLineSession":  true,   // show "session +N" segment
 *       "statusLineLifetime": true,   // show "lifetime +N" segment
 *       "statusLineTips":     true    // rotate a helpful tip at the end
 *     }
 *   }
 *
 * Contract:
 *   - Always exits 0.
 *   - On any error, emits an empty line.
 *   - Output is a single line, target ≤ 80 chars (Claude Code truncates
 *     overflow rather than scrolling, so we self-trim).
 */

import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { c } from "./ui.ts";
import {
  detectCapability,
  frameAt,
  renderHeartbeat,
  renderSparkline as renderAnimatedSparkline,
  visibleWidth,
  type Capability,
} from "./ui-animation.ts";

// ---------------------------------------------------------------------------
// Stats shape (v2 schema — keyed by session id)
// ---------------------------------------------------------------------------
//
// We read the file defensively and support both the v1 shape (`session`
// singular) and the v2 shape (`sessions` map + `schemaVersion: 2`). The
// status line should never crash a terminal because stats.json is on an
// old version — we just fall back to zero.

interface ByDay { [date: string]: { calls?: number; tokensSaved?: number } }
interface SessionBucket {
  calls?: number;
  tokensSaved?: number;
  lastSavingAt?: string | null;
}
interface Stats {
  schemaVersion?: number;
  /** v2: per-session buckets keyed by CLAUDE_SESSION_ID. */
  sessions?: Record<string, SessionBucket>;
  /** v1 legacy shape — kept for readback compatibility during migration. */
  session?: SessionBucket;
  lifetime?: {
    calls?: number;
    tokensSaved?: number;
    byDay?: ByDay;
  };
}

function currentSessionId(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.CLAUDE_SESSION_ID ?? env.ASHLR_SESSION_ID;
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  // Fallback to the same PPID-derived hash shape _stats.ts uses so a
  // terminal without CLAUDE_SESSION_ID still reads its own bucket.
  const seed = `ppid:${typeof process.ppid === "number" ? process.ppid : "?"}:${env.HOME ?? ""}`;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  return `p${(h >>> 0).toString(16)}`;
}

/** Return the current session's counters, or null if unknown. */
function pickSession(stats: Stats | null, sessionId: string): SessionBucket | null {
  if (!stats) return null;
  if (stats.sessions && stats.sessions[sessionId]) return stats.sessions[sessionId]!;
  // If v1 shape is still on disk, don't use it — the legacy global session
  // is exactly the counter that lies across terminals. Return null so the
  // status line shows 0 until the session records something.
  return null;
}

interface AshlrSettings {
  statusLine?: boolean;
  statusLineSession?: boolean;
  statusLineLifetime?: boolean;
  statusLineTips?: boolean;
  statusLineSparkline?: boolean;
}

// 9-rung Braille ladder: empty → full. Each char represents one day's
// tokens-saved, bucketed against the busiest day in the window.
//   0% → ⠀ (U+2800, blank-but-present braille), 100% → ⣿
const SPARK_LADDER = ["\u2800", "\u2840", "\u2844", "\u2846", "\u2847", "\u28E7", "\u28F7", "\u28FF", "\u28FF"];
// Note: we use a 9-slot ladder so that ratio 0 maps to blank, anything >0 maps
// to at least the first rung (so an active-but-quiet day is still visible).

function lastNDayKeys(n: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function renderSparkline(
  byDay: Record<string, { tokensSaved?: number }> | undefined,
  days = 7,
): string {
  const keys = lastNDayKeys(days);
  const vals = keys.map((k) => byDay?.[k]?.tokensSaved ?? 0);
  const max = Math.max(...vals, 0);
  if (max <= 0) return SPARK_LADDER[0]!.repeat(days);
  return vals
    .map((v) => {
      if (v <= 0) return SPARK_LADDER[0]!;
      // Scale 1..max → rungs 1..8 (skip rung 0 so any activity is visible).
      const idx = Math.max(1, Math.min(8, Math.ceil((v / max) * 8)));
      return SPARK_LADDER[idx]!;
    })
    .join("");
}

const MAX_LEN = 80;

// Editable list — keep small, keep useful.
const TIPS: readonly string[] = [
  "use /ashlr-savings to see totals",
  "ashlr__read auto-snips files >2KB",
  "ashlr__edit ships diffs, not full files",
  "ashlr__grep is genome-aware in mapped repos",
  "toggle status line via /ashlr-settings",
  "run `ashlr map` to build a code genome",
  "savings persist in ~/.ashlr/stats.json",
];

/** Resolve the terminal-width budget for the status line.
 *  - Reads $COLUMNS from the environment (terminals typically set this).
 *  - Clamped to [1, 120] to avoid absurdly wide rendering.
 *  - Falls back to 80 when unset/invalid.
 */
export function resolveBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.COLUMNS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) return 80;
  return Math.min(parsed, 120);
}

export function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return String(Math.floor(n));
  if (n < 1_000_000) return (n / 1000).toFixed(1) + "K";
  return (n / 1_000_000).toFixed(1) + "M";
}

function readJson<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2-second read cache (mtime-aware)
// ---------------------------------------------------------------------------
// Claude Code invokes the status line frequently (on every prompt tick).
// Re-reading + re-parsing stats.json on every call is wasteful — the status
// bar does not need sub-second freshness. We cache JSON reads for 2s keyed by
// absolute path, but a cache entry is invalidated whenever the file's mtime
// changes (or its existence flips). That keeps the cache effective under
// steady load while staying correct across tests and mid-session writes.
//
// Cache is process-local — each fresh invocation of this script as a Claude
// Code subprocess starts empty; the cache only helps long-running hosts and
// within-test batch calls.
const READ_CACHE_TTL_MS = 2000;
interface CacheEntry {
  at: number;
  mtimeMs: number;
  value: unknown;
}
const _readCache = new Map<string, CacheEntry>();

function fileMtime(path: string): number {
  try {
    return statSync(path).mtimeMs;
  } catch {
    // Missing → sentinel -1 so "absent → present" also invalidates.
    return -1;
  }
}

function readJsonCached<T>(path: string): T | null {
  const now = Date.now();
  const mtime = fileMtime(path);
  const hit = _readCache.get(path);
  if (hit && now - hit.at < READ_CACHE_TTL_MS && hit.mtimeMs === mtime) {
    return hit.value as T | null;
  }
  const fresh = readJson<T>(path);
  _readCache.set(path, { at: now, mtimeMs: mtime, value: fresh });
  return fresh;
}

/** Test hook — flush the 2s read cache. */
export function _resetReadCache(): void {
  _readCache.clear();
}

function pickTip(tips: readonly string[], seed?: number): string {
  if (tips.length === 0) return "";
  const idx = (seed ?? Math.floor(Date.now() / 86_400_000)) % tips.length;
  return tips[idx]!;
}

export interface BuildOptions {
  home?: string;
  /** Deterministic tip index, used by tests. */
  tipSeed?: number;
  /** Explicit budget override (bypasses $COLUMNS detection). */
  budget?: number;
  /** Environment to read $COLUMNS from — used by tests. */
  env?: NodeJS.ProcessEnv;
  /** Clock injection — tests pin this; production uses Date.now. */
  now?: number;
}

export function buildStatusLine(opts: BuildOptions = {}): string {
  try {
    const home = opts.home ?? homedir();
    const env = opts.env ?? process.env;
    const budget = opts.budget ?? resolveBudget(env);
    const now = opts.now ?? Date.now();
    const settings = readJsonCached<{ ashlr?: AshlrSettings }>(
      join(home, ".claude", "settings.json"),
    );
    const cfg: AshlrSettings = settings?.ashlr ?? {};

    // Defaults: master on, session on, lifetime on, tips on.
    const master = cfg.statusLine ?? true;
    if (!master) return "";

    const showSession = cfg.statusLineSession ?? true;
    const showLifetime = cfg.statusLineLifetime ?? true;
    const showTips = cfg.statusLineTips ?? true;
    const showSpark = cfg.statusLineSparkline ?? true;

    const stats = readJsonCached<Stats>(join(home, ".ashlr", "stats.json"));
    const sessionId = currentSessionId(env);
    const sess = pickSession(stats, sessionId);
    const session = sess?.tokensSaved ?? 0;
    const lifetime = stats?.lifetime?.tokensSaved ?? 0;
    const lastSavingAt = sess?.lastSavingAt ?? null;
    const msSinceActive = lastSavingAt ? Math.max(0, now - Date.parse(lastSavingAt)) : Number.POSITIVE_INFINITY;

    const cap = detectCapability(env);
    const frame = frameAt(now);

    // -----------------------------------------------------------------------
    // Left edge: "ashlr" brand + heartbeat + animated sparkline
    // -----------------------------------------------------------------------
    const brandParts: string[] = ["ashlr"];
    if (showSpark) {
      // Heartbeat glyph: dim middle-dot when idle, braille-wave when active.
      brandParts.push(renderHeartbeat(frame, msSinceActive, cap));
      // 7-day sparkline. Values come from the existing lifetime.byDay map
      // so the 7-day shape stays stable across the new per-session stats.
      const keys = lastNDayKeys(7);
      const values = keys.map((k) => stats?.lifetime?.byDay?.[k]?.tokensSaved ?? 0);
      brandParts.push(renderAnimatedSparkline({ values, frame, msSinceActive, cap }));
    }
    const brand = brandParts.join(" ");

    const parts: string[] = [brand];
    if (showSession) parts.push(`session +${formatTokens(session)}`);
    if (showLifetime) parts.push(`lifetime +${formatTokens(lifetime)}`);

    let line = parts.join(" · ");

    if (showTips) {
      const tip = pickTip(TIPS, opts.tipSeed);
      const candidate = `${line} · tip: ${tip}`;
      if (visibleWidth(candidate) <= budget) {
        line = candidate;
      }
      // Otherwise drop the tip entirely (no partial/truncated rendering).
    }

    // Budget enforcement operates on VISIBLE width — ANSI escapes don't count.
    if (visibleWidth(line) > budget) {
      // Naive slice works because our ANSI runs only bracket colored regions
      // ("…m<char>…\x1b[0m"). In practice we hit budget only when tip was
      // dropped already; cutting here is a last-resort safety.
      line = line.slice(0, budget - 1) + "…";
    }

    return colorize(line);
  } catch {
    return "";
  }
}

/** Overlay color on a finished, length-bounded status line. */
function colorize(line: string): string {
  // Brand (green, bold) — the very first "ashlr" token.
  let out = line.replace(/^ashlr\b/, c.bold(c.brightGreen("ashlr")));
  // Savings numbers — green for positive, dim grey for the zero case.
  out = out.replace(/(session |lifetime )\+([\d.]+[KM]?)/g, (_m, lbl, num) => {
    const isZero = num === "0";
    const coloredLabel = c.dim(lbl);
    const coloredNum = isZero ? c.dim(`+${num}`) : c.green(`+${num}`);
    return `${coloredLabel}${coloredNum}`;
  });
  // Tip prefix — dim cyan label, dim body.
  out = out.replace(/tip: (.+)$/, (_m, body) => `${c.cyan("tip:")} ${c.dim(body)}`);
  // Mid-dot separators — dim.
  out = out.replaceAll(" · ", ` ${c.dim("\u00B7")} `);
  return out;
}

// Run as script (skip when imported by tests).
if (import.meta.main) {
  process.stdout.write(buildStatusLine() + "\n");
  process.exit(0);
}
