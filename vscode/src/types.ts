/**
 * Types mirrored from servers/_stats.ts — kept in sync manually.
 * The extension reads stats.json written by the ashlr MCP servers.
 */

export interface PerTool {
  calls: number;
  tokensSaved: number;
}

export interface ByTool {
  [k: string]: PerTool;
}

export interface ByDay {
  [date: string]: { calls: number; tokensSaved: number };
}

/** Per-session bucket keyed by CLAUDE_SESSION_ID. */
export interface SessionBucket {
  startedAt: string;
  lastSavingAt: string | null;
  calls: number;
  tokensSaved: number;
  byTool: ByTool;
}

export interface LifetimeBucket {
  calls: number;
  tokensSaved: number;
  byTool: ByTool;
  byDay: ByDay;
}

export interface SummarizationStats {
  calls: number;
  cacheHits: number;
}

/** On-disk shape at ~/.ashlr/stats.json — schemaVersion 2. */
export interface StatsFile {
  schemaVersion: 2;
  sessions: { [sessionId: string]: SessionBucket };
  lifetime: LifetimeBucket;
  summarization?: SummarizationStats;
}

/** Aggregated session totals across all live sessions. */
export interface AggregatedSession {
  calls: number;
  tokensSaved: number;
  byTool: ByTool;
}
