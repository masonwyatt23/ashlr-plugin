/**
 * incident-card.tsx — One incident summary card for the status page list.
 */

import Link from "next/link";
import type { IncidentSummary } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_COLOR: Record<string, string> = {
  investigating: "#8B2E1A",
  identified:    "#d9793a",
  monitoring:    "#d9793a",
  resolved:      "#4F5B3F",
};

const STATUS_LABEL: Record<string, string> = {
  investigating: "Investigating",
  identified:    "Identified",
  monitoring:    "Monitoring",
  resolved:      "Resolved",
};

function formatDate(iso: string): string {
  return new Date(iso).toUTCString().replace(" GMT", " UTC").slice(0, 25);
}

function formatDuration(start: string, end: string | null): string {
  const startMs = new Date(start).getTime();
  const endMs   = end ? new Date(end).getTime() : Date.now();
  const diffMs  = endMs - startMs;
  const h = Math.floor(diffMs / 3600_000);
  const m = Math.floor((diffMs % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IncidentCard({ incident }: { incident: IncidentSummary }) {
  const color = STATUS_COLOR[incident.status] ?? "#4a5568";
  const label = STATUS_LABEL[incident.status] ?? incident.status;

  return (
    <Link
      href={`/status/${incident.id}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          borderBottom: "1px solid var(--ink-10)",
          padding: "16px 0",
          cursor: "pointer",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            marginBottom: 6,
          }}
        >
          {/* Title */}
          <span
            style={{
              fontFamily: "var(--font-ibm-plex), sans-serif",
              fontSize: 14,
              fontWeight: 500,
              color: "var(--ink)",
            }}
          >
            {incident.title}
          </span>

          {/* Status badge */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: color,
              fontWeight: 600,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: color,
                display: "inline-block",
              }}
            />
            {label}
          </span>
        </div>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "4px 16px",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 11,
            color: "var(--ink-55)",
          }}
        >
          <span>{formatDate(incident.createdAt)}</span>
          {incident.resolvedAt && (
            <span>Duration: {formatDuration(incident.createdAt, incident.resolvedAt)}</span>
          )}
          {incident.affectedComponents.length > 0 && (
            <span>Affected: {incident.affectedComponents.join(", ")}</span>
          )}
        </div>

        {/* Body preview */}
        {incident.body && (
          <p
            style={{
              fontFamily: "var(--font-ibm-plex), sans-serif",
              fontSize: 13,
              color: "var(--ink-80)",
              margin: "6px 0 0",
              lineHeight: 1.55,
              maxWidth: 680,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {incident.body}
          </p>
        )}
      </div>
    </Link>
  );
}
