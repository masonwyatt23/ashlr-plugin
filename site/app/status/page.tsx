/**
 * status/page.tsx — ashlr service status page.
 *
 * Server component: fetches current health + 90-day history from the API at
 * request time. The StatusPoller client component re-polls every 30s to keep
 * the overall indicator live without a full reload.
 *
 * Degraded mode: if the API is unreachable, renders a static "status unknown"
 * page rather than a hard error. The page never 500s — it degrades gracefully.
 */

import type { Metadata } from "next";
import ComponentRow from "@/components/status/component-row";
import IncidentCard from "@/components/status/incident-card";
import SubscribeForm from "@/components/status/subscribe-form";
import StatusPoller from "@/components/status/status-poller";
import type {
  ComponentHealth,
  DayHistory,
  IncidentSummary,
  OverallStatus,
} from "@/components/status/types";

// ---------------------------------------------------------------------------
// Types from the API
// ---------------------------------------------------------------------------

interface CurrentResponse {
  overall: OverallStatus;
  components: ComponentHealth[];
  recentIncidents: IncidentSummary[];
  generatedAt: string;
}

interface HistoryResponse {
  days: number;
  history: Record<string, DayHistory[]>;
}

// ---------------------------------------------------------------------------
// Component display names
// ---------------------------------------------------------------------------

const DISPLAY_NAMES: Record<string, string> = {
  "plugin-registry":  "Plugin registry (plugin.ashlr.ai)",
  "api":              "API (api.ashlr.ai)",
  "llm-summarizer":   "LLM summarizer (Anthropic)",
  "stripe-billing":   "Stripe billing",
  "email-delivery":   "Email delivery (Resend)",
  "docs":             "Docs site (docs.ashlr.ai)",
};

// Canonical order — shown even when no health-check data exists
const COMPONENT_ORDER = [
  "plugin-registry",
  "api",
  "llm-summarizer",
  "stripe-billing",
  "email-delivery",
  "docs",
];

// ---------------------------------------------------------------------------
// Data fetching (server-side, no auth required)
// ---------------------------------------------------------------------------

const API_BASE = process.env["API_BASE_URL"] ?? "https://api.ashlr.ai";
const FETCH_TIMEOUT_MS = 5_000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 30 },
    });
  } finally {
    clearTimeout(t);
  }
}

async function fetchCurrentStatus(): Promise<CurrentResponse | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/status/current`);
    if (!res.ok) return null;
    return (await res.json()) as CurrentResponse;
  } catch {
    return null;
  }
}

async function fetchHistory(): Promise<HistoryResponse | null> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/status/history?days=90`);
    if (!res.ok) return null;
    return (await res.json()) as HistoryResponse;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: "System Status",
  description: "Real-time health of ashlr services — plugin registry, API, LLM summarizer, billing, email, and docs.",
  alternates: { canonical: "https://status.ashlr.ai" },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function StatusPage() {
  const [current, historyData] = await Promise.all([
    fetchCurrentStatus(),
    fetchHistory(),
  ]);

  const overall: OverallStatus = current?.overall ?? "unknown";
  const components = current?.components ?? [];
  const incidents  = current?.recentIncidents ?? [];
  const history    = historyData?.history ?? {};

  // Build a map for quick lookup
  const componentMap = new Map<string, ComponentHealth>(
    components.map((c) => [c.name, c]),
  );

  return (
    <>
      {/* Overall strip — client component polls every 30s */}
      <StatusPoller initialStatus={overall} />

      <main style={{ minHeight: "70vh" }}>
        <div
          className="wrap"
          style={{
            maxWidth: 1000,
            paddingTop: 56,
            paddingBottom: 80,
          }}
        >
          {/* Header */}
          <div style={{ marginBottom: 40 }}>
            <p
              className="eyebrow"
              style={{ marginBottom: 12 }}
            >
              ashlr
            </p>
            <h1
              style={{
                fontFamily: "var(--font-fraunces), serif",
                fontWeight: 300,
                fontSize: "clamp(36px, 5vw, 52px)",
                fontVariationSettings: '"opsz" 72, "SOFT" 30',
                letterSpacing: "-0.025em",
                lineHeight: 1.05,
                color: "var(--ink)",
                margin: 0,
              }}
            >
              System Status
            </h1>
            {current && (
              <p
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                  fontSize: 11,
                  color: "var(--ink-30)",
                  marginTop: 8,
                }}
              >
                Updated {new Date(current.generatedAt).toUTCString().replace(" GMT", " UTC").slice(0, 25)}
                {" · "}
                <a
                  href="/status/rss.xml"
                  style={{ color: "var(--ink-30)", textDecoration: "underline" }}
                >
                  RSS feed
                </a>
              </p>
            )}
          </div>

          {/* Components */}
          <section style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--ink-55)",
                marginBottom: 4,
                fontWeight: 400,
              }}
            >
              Components
            </h2>
            <div>
              {COMPONENT_ORDER.map((name) => {
                const comp = componentMap.get(name);
                const hist: DayHistory[] = history[name] ?? [];
                return (
                  <ComponentRow
                    key={name}
                    name={name}
                    displayName={DISPLAY_NAMES[name] ?? name}
                    status={(comp?.status as "ok" | "degraded" | "down") ?? "unknown"}
                    lastCheckedAt={comp?.lastCheckedAt ?? null}
                    latencyMs={comp?.latencyMs ?? null}
                    history={hist}
                  />
                );
              })}
            </div>
          </section>

          {/* Recent incidents */}
          <section style={{ marginBottom: 56 }}>
            <h2
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--ink-55)",
                marginBottom: 4,
                fontWeight: 400,
              }}
            >
              Recent Incidents
            </h2>
            {incidents.length === 0 ? (
              <p
                style={{
                  fontFamily: "var(--font-jetbrains), monospace",
                  fontSize: 12,
                  color: "var(--ink-30)",
                  padding: "16px 0",
                }}
              >
                No incidents in the past 30 days.
              </p>
            ) : (
              <div>
                {incidents.map((inc) => (
                  <IncidentCard key={inc.id} incident={inc} />
                ))}
              </div>
            )}
          </section>

          {/* Subscribe */}
          <section
            style={{
              borderTop: "1px solid var(--ink-10)",
              paddingTop: 32,
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: "var(--ink-55)",
                marginBottom: 12,
                fontWeight: 400,
              }}
            >
              Subscribe to updates
            </h2>
            <p
              style={{
                fontFamily: "var(--font-ibm-plex), sans-serif",
                fontSize: 13,
                color: "var(--ink-55)",
                marginBottom: 16,
                maxWidth: 480,
                lineHeight: 1.55,
              }}
            >
              Receive an email when an incident is opened, updated, or
              resolved. One confirmation email to verify your address.
            </p>
            <SubscribeForm />
          </section>
        </div>
      </main>
    </>
  );
}
