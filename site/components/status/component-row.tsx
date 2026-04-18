/**
 * component-row.tsx — One component row on the status page.
 *
 * Shows the component name, current status badge, and a 90-cell uptime bar
 * (one rectangle per day, colored by daily uptime percentage).
 */

import type { DayHistory } from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComponentStatus = "ok" | "degraded" | "down" | "unknown";

export interface ComponentRowProps {
  name: string;
  displayName: string;
  status: ComponentStatus;
  lastCheckedAt: string | null;
  latencyMs: number | null;
  history: DayHistory[]; // up to 90 entries, one per day
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<ComponentStatus, string> = {
  ok:       "#4F5B3F",
  degraded: "#d9793a",
  down:     "#8B2E1A",
  unknown:  "#4a5568",
};

const STATUS_LABEL: Record<ComponentStatus, string> = {
  ok:       "Operational",
  degraded: "Degraded",
  down:     "Down",
  unknown:  "Unknown",
};

function uptimePctToColor(pct: number): string {
  if (pct >= 99.9) return "#4F5B3F";
  if (pct >= 95)   return "#d9793a";
  return "#8B2E1A";
}

function formatLatency(ms: number | null): string {
  if (ms === null) return "";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatCheckedAt(iso: string | null): string {
  if (!iso) return "Never checked";
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  return d.toUTCString().slice(0, 22);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ComponentRow({
  displayName,
  status,
  lastCheckedAt,
  latencyMs,
  history,
}: ComponentRowProps) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.unknown;
  const label = STATUS_LABEL[status] ?? "Unknown";

  // Pad history to 90 cells (oldest on the left, newest on the right)
  const cells: Array<{ pct: number | null; date: string | null }> = [];
  for (let i = 0; i < 90; i++) {
    cells.push({ pct: null, date: null });
  }
  const start = Math.max(0, 90 - history.length);
  history.slice(-90).forEach((h, i) => {
    cells[start + i] = { pct: h.uptimePct, date: h.date };
  });

  return (
    <div
      style={{
        borderBottom: "1px solid var(--ink-10)",
        padding: "18px 0",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* Top row: name + status badge */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontFamily: "var(--font-ibm-plex), sans-serif",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            {displayName}
          </span>
          {latencyMs !== null && (
            <span
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                color: "var(--ink-55)",
              }}
            >
              {formatLatency(latencyMs)}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 11,
              color: "var(--ink-55)",
            }}
          >
            {lastCheckedAt ? formatCheckedAt(lastCheckedAt) : ""}
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: color,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: color,
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            {label}
          </span>
        </div>
      </div>

      {/* 90-day uptime bar */}
      <div style={{ display: "flex", gap: 1.5, alignItems: "flex-end" }}>
        {cells.map((cell, i) => (
          <div
            key={i}
            title={
              cell.date && cell.pct !== null
                ? `${cell.date}: ${cell.pct.toFixed(2)}% uptime`
                : "No data"
            }
            style={{
              width: 3,
              height: 20,
              borderRadius: 1,
              background: cell.pct !== null
                ? uptimePctToColor(cell.pct)
                : "var(--ink-10)",
              flexShrink: 0,
            }}
          />
        ))}

        <span
          style={{
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 10,
            color: "var(--ink-30)",
            marginLeft: 8,
            whiteSpace: "nowrap",
            alignSelf: "center",
          }}
        >
          90 days
        </span>
      </div>
    </div>
  );
}
