/**
 * status/[incidentId]/page.tsx — Individual incident detail page.
 *
 * Server component. Fetches the incident and all its updates from the API.
 * Degrades gracefully to 404 if the incident is not found.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { IncidentUpdateEntry } from "@/components/status/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IncidentDetail {
  id: string;
  title: string;
  status: string;
  affectedComponents: string[];
  createdAt: string;
  resolvedAt: string | null;
  body: string;
  updates: IncidentUpdateEntry[];
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

const API_BASE = process.env["API_BASE_URL"] ?? "https://api.ashlr.ai";

async function fetchIncident(id: string): Promise<IncidentDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/status/incident/${id}`, {
      next: { revalidate: 30 },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as IncidentDetail;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata(
  { params }: { params: Promise<{ incidentId: string }> },
): Promise<Metadata> {
  const { incidentId } = await params;
  const incident = await fetchIncident(incidentId);
  if (!incident) return { title: "Incident not found" };
  return {
    title: `${incident.title} — ashlr Status`,
    description: incident.body.slice(0, 160),
  };
}

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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function IncidentPage(
  { params }: { params: Promise<{ incidentId: string }> },
) {
  const { incidentId } = await params;
  const incident = await fetchIncident(incidentId);

  if (!incident) notFound();

  const statusColor = STATUS_COLOR[incident.status] ?? "#4a5568";
  const statusLabel = STATUS_LABEL[incident.status] ?? incident.status;

  return (
    <main style={{ minHeight: "70vh" }}>
      <div
        className="wrap"
        style={{ maxWidth: 1000, paddingTop: 48, paddingBottom: 80 }}
      >
        {/* Back link */}
        <Link
          href="/status"
          style={{
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 11,
            color: "var(--ink-55)",
            letterSpacing: "0.08em",
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 32,
          }}
        >
          &larr; All status
        </Link>

        {/* Incident header */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: statusColor,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: statusColor,
                  display: "inline-block",
                }}
              />
              {statusLabel}
            </span>
          </div>

          <h1
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontWeight: 300,
              fontSize: "clamp(28px, 4vw, 40px)",
              fontVariationSettings: '"opsz" 72, "SOFT" 30',
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              color: "var(--ink)",
              margin: "0 0 10px",
            }}
          >
            {incident.title}
          </h1>

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
            <span>Started: {formatDate(incident.createdAt)}</span>
            {incident.resolvedAt && (
              <span>Resolved: {formatDate(incident.resolvedAt)}</span>
            )}
            {incident.affectedComponents.length > 0 && (
              <span>Components: {incident.affectedComponents.join(", ")}</span>
            )}
          </div>
        </div>

        {/* Initial body */}
        {incident.body && (
          <p
            style={{
              fontFamily: "var(--font-ibm-plex), sans-serif",
              fontSize: 14,
              lineHeight: 1.65,
              color: "var(--ink-80)",
              marginBottom: 40,
              maxWidth: 680,
            }}
          >
            {incident.body}
          </p>
        )}

        {/* Timeline */}
        {incident.updates.length > 0 && (
          <section>
            <h2
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--ink-55)",
                marginBottom: 20,
                fontWeight: 400,
              }}
            >
              Timeline
            </h2>

            <div style={{ position: "relative" }}>
              {/* Vertical line */}
              <div
                style={{
                  position: "absolute",
                  left: 6,
                  top: 10,
                  bottom: 10,
                  width: 1,
                  background: "var(--ink-10)",
                }}
              />

              {[...incident.updates].reverse().map((update) => {
                const uColor = STATUS_COLOR[update.status] ?? "#4a5568";
                const uLabel = STATUS_LABEL[update.status] ?? update.status;
                return (
                  <div
                    key={update.id}
                    style={{
                      display: "flex",
                      gap: 20,
                      marginBottom: 28,
                      paddingLeft: 28,
                      position: "relative",
                    }}
                  >
                    {/* Dot */}
                    <div
                      style={{
                        position: "absolute",
                        left: 2,
                        top: 5,
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: uColor,
                        border: "2px solid var(--paper)",
                        flexShrink: 0,
                      }}
                    />

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginBottom: 6,
                          flexWrap: "wrap",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-jetbrains), monospace",
                            fontSize: 10,
                            textTransform: "uppercase",
                            letterSpacing: "0.1em",
                            color: uColor,
                            fontWeight: 600,
                          }}
                        >
                          {uLabel}
                        </span>
                        <span
                          style={{
                            fontFamily: "var(--font-jetbrains), monospace",
                            fontSize: 11,
                            color: "var(--ink-30)",
                          }}
                        >
                          {formatDate(update.postedAt)}
                        </span>
                      </div>
                      <p
                        style={{
                          fontFamily: "var(--font-ibm-plex), sans-serif",
                          fontSize: 14,
                          lineHeight: 1.6,
                          color: "var(--ink-80)",
                          margin: 0,
                        }}
                      >
                        {update.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
