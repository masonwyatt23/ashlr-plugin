"use client";

import { useEffect, useState } from "react";
import { fetchAdminErrors, type SentryIssue } from "@/lib/admin-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return document.querySelector("[data-admin-token]")?.getAttribute("data-admin-token")
    ?? localStorage.getItem("ashlr_token") ?? "";
}

export default function AdminErrorsPage() {
  const [issues, setIssues]   = useState<SentryIssue[] | null>(null);
  const [noSentry, setNoSentry] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetchAdminErrors(token, 50)
      .then((data) => {
        if (data === null) {
          setNoSentry(true);
        } else {
          setIssues(data.issues);
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 28, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
        Errors
      </h1>

      {loading && <p className="mono-label">Loading…</p>}
      {error   && <p style={{ color: "var(--debit)" }}>{error}</p>}

      {noSentry && (
        <Card>
          <CardContent>
            <p className="mono-label" style={{ color: "var(--ink-55)", padding: "16px 0" }}>
              Sentry integration not configured. Set SENTRY_INTERNAL_TOKEN on the server to enable error tracking.
            </p>
          </CardContent>
        </Card>
      )}

      {issues && (
        <Card>
          <CardHeader>
            <CardTitle>Unresolved Issues ({issues.length})</CardTitle>
          </CardHeader>
          <CardContent style={{ paddingTop: 0 }}>
            {issues.length === 0 ? (
              <span className="mono-label" style={{ color: "var(--credit)" }}>No unresolved issues.</span>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--ink-10)" }}>
                    {["Title", "Culprit", "Count", "First Seen", "Last Seen"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "4px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-55)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id} style={{ borderBottom: "1px solid var(--ink-10)" }}>
                      <td style={{ padding: "10px 12px 10px 0", maxWidth: 260 }}>
                        <a
                          href={issue.permalink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, color: "var(--debit)", textDecoration: "none" }}
                        >
                          {issue.title}
                        </a>
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {issue.culprit}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12 }}>
                        {Number(issue.count).toLocaleString()}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>
                        {formatDate(issue.firstSeen)}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>
                        {formatDate(issue.lastSeen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return iso; }
}
