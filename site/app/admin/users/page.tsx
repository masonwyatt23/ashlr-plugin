"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { fetchAdminUsers, type AdminUserRow } from "@/lib/admin-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return document.querySelector("[data-admin-token]")?.getAttribute("data-admin-token")
    ?? localStorage.getItem("ashlr_token") ?? "";
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers]     = useState<AdminUserRow[]>([]);
  const [query, setQuery]     = useState("");
  const [offset, setOffset]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const limit = 50;

  const load = useCallback((q: string, off: number) => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    fetchAdminUsers(token, { q: q || undefined, limit, offset: off })
      .then((data) => setUsers(data.users))
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(query, offset); }, [load, query, offset]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 28, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
          Users
        </h1>
        <input
          type="search"
          placeholder="Search email…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOffset(0); }}
          style={{
            border: "1px solid var(--ink-10)",
            background: "var(--paper-deep)",
            color: "var(--ink)",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 13,
            padding: "8px 14px",
            borderRadius: 6,
            outline: "none",
            width: 260,
          }}
        />
      </div>

      {error && <p style={{ color: "var(--debit)" }}>{error}</p>}

      <Card>
        <CardContent style={{ padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--ink-10)" }}>
                {["Email", "Tier", "Joined", "Last Active", "Tokens Saved", "Admin"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "12px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-55)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center" }}>
                    <span className="mono-label">Loading…</span>
                  </td>
                </tr>
              )}
              {!loading && users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                  style={{
                    borderBottom: "1px solid var(--ink-10)",
                    cursor: "pointer",
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ink-10)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, color: "var(--ink-80)" }}>{u.email}</td>
                  <td style={{ padding: "12px 16px" }}><TierBadge tier={u.tier} /></td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>{formatDate(u.created_at)}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>{u.last_active ? formatDate(u.last_active) : "—"}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, color: "var(--ink)" }}>{fmtNum(u.lifetime_tokens_saved)}</td>
                  <td style={{ padding: "12px 16px", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>{u.is_admin ? "yes" : ""}</td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center" }}>
                    <span className="mono-label">No users found</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Pagination */}
      <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
        <button
          className="btn btn-secondary"
          disabled={offset === 0}
          onClick={() => setOffset(Math.max(0, offset - limit))}
          style={{ opacity: offset === 0 ? 0.4 : 1 }}
        >
          ← Prev
        </button>
        <button
          className="btn btn-secondary"
          disabled={users.length < limit}
          onClick={() => setOffset(offset + limit)}
          style={{ opacity: users.length < limit ? 0.4 : 1 }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = { pro: "var(--debit)", team: "var(--credit)", free: "var(--ink-30)" };
  return (
    <span style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: colors[tier] ?? "var(--ink-55)", border: "1px solid currentColor", borderRadius: 3, padding: "1px 5px" }}>
      {tier}
    </span>
  );
}

function formatDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return iso; }
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
