"use client";

import { useEffect, useState, useCallback } from "react";
import { fetchAdminAudit, type AuditEvent } from "@/lib/admin-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return document.querySelector("[data-admin-token]")?.getAttribute("data-admin-token")
    ?? localStorage.getItem("ashlr_token") ?? "";
}

export default function AdminAuditPage() {
  const [events, setEvents]   = useState<AuditEvent[]>([]);
  const [orgFilter, setOrg]   = useState("");
  const [offset, setOffset]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const limit = 100;

  const load = useCallback((org: string, off: number) => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    fetchAdminAudit(token, { orgId: org || undefined, limit, offset: off })
      .then((d) => setEvents(d.events))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(orgFilter, offset); }, [load, orgFilter, offset]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 28, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
          Audit Log
        </h1>
        <input
          type="text"
          placeholder="Filter by Org ID…"
          value={orgFilter}
          onChange={(e) => { setOrg(e.target.value); setOffset(0); }}
          style={{
            border: "1px solid var(--ink-10)", background: "var(--paper-deep)", color: "var(--ink)",
            fontFamily: "var(--font-jetbrains), monospace", fontSize: 13, padding: "8px 14px", borderRadius: 6, outline: "none", width: 260,
          }}
        />
      </div>

      {error && <p style={{ color: "var(--debit)" }}>{error}</p>}

      <Card>
        <CardContent style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ink-10)" }}>
                {["Time", "Org", "User", "Tool", "Args"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-55)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center" }}><span className="mono-label">Loading…</span></td></tr>
              )}
              {!loading && events.map((ev) => (
                <tr key={ev.id} style={{ borderBottom: "1px solid var(--ink-10)" }}>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)", whiteSpace: "nowrap" }}>{formatTs(ev.at)}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ev.org_id}>{ev.org_id.slice(0, 8)}</td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ev.user_id}>{ev.user_id.slice(0, 8)}</td>
                  <td style={{ padding: "10px 16px" }}>
                    <span style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, color: ev.tool === "admin" ? "var(--debit)" : "var(--ink)" }}>{ev.tool}</span>
                  </td>
                  <td style={{ padding: "10px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)", maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ev.args_json}>
                    {ev.args_json}
                  </td>
                </tr>
              ))}
              {!loading && events.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: "center" }}><span className="mono-label">No events</span></td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button className="btn btn-secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} style={{ opacity: offset === 0 ? 0.4 : 1 }}>← Prev</button>
        <button className="btn btn-secondary" disabled={events.length < limit} onClick={() => setOffset(offset + limit)} style={{ opacity: events.length < limit ? 0.4 : 1 }}>Next →</button>
      </div>
    </div>
  );
}

function formatTs(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}
