"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchAdminUserDetail, adminCompUser, adminRefundUser, type UserDetail } from "@/lib/admin-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return document.querySelector("[data-admin-token]")?.getAttribute("data-admin-token")
    ?? localStorage.getItem("ashlr_token") ?? "";
}

// ---------------------------------------------------------------------------
// Comp modal
// ---------------------------------------------------------------------------

function CompModal({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const [tier, setTier]       = useState<"pro" | "team">("pro");
  const [days, setDays]       = useState("30");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setErr(null);
    const expiresAt = new Date(Date.now() + Number(days) * 86400000).toISOString();
    try {
      await adminCompUser(getToken(), userId, tier, expiresAt);
      onDone();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 20, fontWeight: 600, margin: "0 0 20px" }}>Grant Comp</h3>
        <label className="mono-label" style={{ display: "block", marginBottom: 6 }}>Tier</label>
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as "pro" | "team")}
          style={inputStyle}
        >
          <option value="pro">pro</option>
          <option value="team">team</option>
        </select>
        <label className="mono-label" style={{ display: "block", margin: "16px 0 6px" }}>Duration (days)</label>
        <input
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          style={inputStyle}
        />
        {err && <p style={{ color: "var(--debit)", fontSize: 12, marginTop: 12 }}>{err}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? "…" : "Grant"}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Refund modal
// ---------------------------------------------------------------------------

function RefundModal({ userId, onClose, onDone }: { userId: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount]   = useState("1000");
  const [reason, setReason]   = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  async function submit() {
    setLoading(true);
    setErr(null);
    try {
      await adminRefundUser(getToken(), userId, Number(amount), reason);
      onDone();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div style={modalStyle}>
        <h3 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 20, fontWeight: 600, margin: "0 0 20px" }}>Issue Refund</h3>
        <label className="mono-label" style={{ display: "block", marginBottom: 6 }}>Amount (cents)</label>
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} />
        <label className="mono-label" style={{ display: "block", margin: "16px 0 6px" }}>Reason</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
        {err && <p style={{ color: "var(--debit)", fontSize: 12, marginTop: 12 }}>{err}</p>}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button className="btn btn-primary" onClick={submit} disabled={loading || !reason}>
            {loading ? "…" : "Refund"}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminUserDetailPage() {
  const params  = useParams<{ id: string }>();
  const router  = useRouter();
  const [data, setData]         = useState<UserDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showComp, setShowComp]     = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [toast, setToast]       = useState<string | null>(null);

  function load() {
    const token = getToken();
    if (!token || !params.id) return;
    setLoading(true);
    fetchAdminUserDetail(token, params.id)
      .then(setData)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(load, [params.id]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  if (loading) return <p className="mono-label">Loading…</p>;
  if (error)   return <p style={{ color: "var(--debit)" }}>{error}</p>;
  if (!data)   return null;

  const { user, subscriptions, stats_uploads, recent_llm_calls, active_genome_ids, audit_event_count } = data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 900 }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, background: "var(--ink)", color: "var(--paper)", padding: "10px 18px", borderRadius: 6, fontFamily: "var(--font-jetbrains), monospace", fontSize: 13, zIndex: 1000 }}>
          {toast}
        </div>
      )}

      {showComp && (
        <CompModal
          userId={user.id}
          onClose={() => setShowComp(false)}
          onDone={() => { load(); showToast("Comp granted."); }}
        />
      )}
      {showRefund && (
        <RefundModal
          userId={user.id}
          onClose={() => setShowRefund(false)}
          onDone={() => showToast("Refund issued.")}
        />
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <button
            onClick={() => router.push("/admin/users")}
            style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, color: "var(--ink-55)", padding: "0 0 8px", display: "block" }}
          >
            ← Users
          </button>
          <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 26, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
            {user.email}
          </h1>
          <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
            <TierBadge tier={user.tier} />
            {user.is_admin === 1 && <span className="mono-label" style={{ color: "var(--debit)" }}>admin</span>}
            {user.comp_expires_at && <span className="mono-label">comp until {formatDate(user.comp_expires_at)}</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => setShowComp(true)}>Grant Comp</button>
          <button className="btn btn-secondary" style={{ color: "var(--debit)", borderColor: "var(--debit)" }} onClick={() => setShowRefund(true)}>Refund</button>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        <StatCard label="User ID" value={user.id.slice(0, 8) + "…"} />
        <StatCard label="Joined" value={formatDate(user.created_at)} />
        <StatCard label="Audit Events" value={String(audit_event_count)} />
        <StatCard label="Active Genomes" value={String(active_genome_ids.length)} />
      </div>

      {/* Subscriptions */}
      <Card>
        <CardHeader><CardTitle>Subscriptions</CardTitle></CardHeader>
        <CardContent style={{ paddingTop: 0 }}>
          {subscriptions.length === 0 ? (
            <span className="mono-label">None</span>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ink-10)" }}>
                  {["Tier", "Status", "Created", "Renews"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-55)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--ink-10)" }}>
                    <td style={{ padding: "8px 12px 8px 0" }}><TierBadge tier={s.tier} /></td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, color: s.status === "active" ? "var(--credit)" : "var(--ink-55)" }}>{s.status}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>{formatDate(s.created_at)}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>{s.current_period_end ? formatDate(s.current_period_end) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Recent LLM calls */}
      <Card>
        <CardHeader><CardTitle>Recent LLM Calls</CardTitle></CardHeader>
        <CardContent style={{ paddingTop: 0 }}>
          {recent_llm_calls.length === 0 ? (
            <span className="mono-label">None</span>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ink-10)" }}>
                  {["Tool", "Date", "In", "Out", "Cost"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-55)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent_llm_calls.map((l) => (
                  <tr key={l.id} style={{ borderBottom: "1px solid var(--ink-10)" }}>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12 }}>{l.tool_name}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>{formatDate(l.at)}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11 }}>{l.input_tokens.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11 }}>{l.output_tokens.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--debit)" }}>${l.cost.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Stats uploads */}
      <Card>
        <CardHeader><CardTitle>Plugin Syncs</CardTitle></CardHeader>
        <CardContent style={{ paddingTop: 0 }}>
          {stats_uploads.length === 0 ? (
            <span className="mono-label">None</span>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--ink-10)" }}>
                  {["Date", "Lifetime Tokens Saved", "Lifetime Calls"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "4px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ink-55)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats_uploads.map((s) => (
                  <tr key={s.id} style={{ borderBottom: "1px solid var(--ink-10)" }}>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 11, color: "var(--ink-55)" }}>{formatDate(s.uploaded_at)}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12 }}>{s.lifetime_tokens_saved.toLocaleString()}</td>
                    <td style={{ padding: "8px 12px 8px 0", fontFamily: "var(--font-jetbrains), monospace", fontSize: 12 }}>{s.lifetime_calls.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--paper-deep)", border: "1px solid var(--ink-10)", borderRadius: 8, padding: "14px 16px" }}>
      <p className="mono-label" style={{ margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: 14, fontWeight: 600, color: "var(--ink)", margin: 0 }}>{value}</p>
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

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
};

const modalStyle: React.CSSProperties = {
  background: "var(--paper)", border: "1px solid var(--ink-10)", borderRadius: 10, padding: "32px 36px", width: 420, maxWidth: "90vw",
};

const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--ink-10)", background: "var(--paper-deep)", color: "var(--ink)", fontFamily: "var(--font-jetbrains), monospace", fontSize: 13, padding: "8px 12px", borderRadius: 6, outline: "none", boxSizing: "border-box",
};
