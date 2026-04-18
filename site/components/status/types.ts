/**
 * types.ts — Shared types for the status page components.
 */

export interface DayHistory {
  date: string;        // "YYYY-MM-DD"
  uptimePct: number;   // 0–100
}

export interface ComponentHealth {
  name: string;
  status: "ok" | "degraded" | "down" | "unknown";
  lastCheckedAt: string | null;
  latencyMs: number | null;
}

export interface IncidentSummary {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  affectedComponents: string[];
  createdAt: string;
  resolvedAt: string | null;
  body: string;
}

export interface IncidentUpdateEntry {
  id: string;
  status: string;
  body: string;
  postedAt: string;
}

export type OverallStatus = "operational" | "partial_outage" | "major_outage" | "unknown";
