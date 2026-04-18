"use client";

import { useEffect, useState } from "react";
import { fetchAdminRevenue, type DailyRevenue } from "@/lib/admin-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return document.querySelector("[data-admin-token]")?.getAttribute("data-admin-token")
    ?? localStorage.getItem("ashlr_token") ?? "";
}

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

export default function AdminRevenuePage() {
  const today    = iso(new Date());
  const thirtyAgo = iso(new Date(Date.now() - 30 * 86400000));

  const [from, setFrom]       = useState(thirtyAgo);
  const [to, setTo]           = useState(today);
  const [data, setData]       = useState<DailyRevenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  function load() {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    fetchAdminRevenue(token, { from, to })
      .then((r) => setData(r.timeline))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [from, to]);

  const total = data.reduce((s, d) => s + d.revenue_cents, 0);
  const max   = Math.max(...data.map((d) => d.revenue_cents), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 28, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
          Revenue
        </h1>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label className="mono-label">From</label>
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          <label className="mono-label">To</label>
          <input type="date" value={to} min={from} max={today} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
        </div>
      </div>

      {error && <p style={{ color: "var(--debit)" }}>{error}</p>}

      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        <Card>
          <CardHeader><CardTitle>Period Total</CardTitle></CardHeader>
          <CardContent>
            <p style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 36, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
              ${(total / 100).toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Days with Revenue</CardTitle></CardHeader>
          <CardContent>
            <p style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 36, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
              {data.filter((d) => d.revenue_cents > 0).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      <Card>
        <CardHeader><CardTitle>Daily Revenue</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <span className="mono-label">Loading…</span>
          ) : data.length === 0 ? (
            <span className="mono-label">No revenue data for this period.</span>
          ) : (
            <div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 120, overflowX: "auto" }}>
                {data.map((row) => (
                  <div
                    key={row.date}
                    title={`${row.date}: $${(row.revenue_cents / 100).toFixed(2)}`}
                    style={{
                      flex: "0 0 auto",
                      width: Math.max(6, Math.floor(600 / data.length)),
                      height: `${Math.max(2, (row.revenue_cents / max) * 120)}px`,
                      background: row.revenue_cents > 0 ? "var(--debit)" : "var(--ink-10)",
                      borderRadius: "2px 2px 0 0",
                      cursor: "default",
                      transition: "opacity 0.1s",
                    }}
                  />
                ))}
              </div>
              {/* X axis labels — first + last */}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                <span className="mono-label">{data[0]?.date}</span>
                <span className="mono-label">{data[data.length - 1]?.date}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Table */}
      {!loading && data.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Daily Breakdown</CardTitle></CardHeader>
          <CardContent style={{ paddingTop: 0 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ink-10)" }}>
                  {["Date", "Revenue"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-55)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((row) => (
                  <tr key={row.date} style={{ borderBottom: "1px solid var(--ink-10)" }}>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, color: "var(--ink-55)" }}>{row.date}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 13, color: row.revenue_cents > 0 ? "var(--ink)" : "var(--ink-30)" }}>
                      ${(row.revenue_cents / 100).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--ink-10)", background: "var(--paper-deep)", color: "var(--ink)", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, padding: "6px 10px", borderRadius: 6, outline: "none",
};
