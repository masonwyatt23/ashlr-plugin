"use client";

import { useState } from "react";
import { adminBroadcast } from "@/lib/admin-api";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

function getToken(): string {
  if (typeof window === "undefined") return "";
  return document.querySelector("[data-admin-token]")?.getAttribute("data-admin-token")
    ?? localStorage.getItem("ashlr_token") ?? "";
}

type TierFilter = "" | "free" | "pro" | "team";

export default function AdminBroadcastPage() {
  const [subject, setSubject]     = useState("");
  const [body, setBody]           = useState("");
  const [tier, setTier]           = useState<TierFilter>("");
  const [preview, setPreview]     = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState<{ sent: number; total: number } | null>(null);
  const [error, setError]         = useState<string | null>(null);

  function handlePreview() { setPreview(true); }
  function handleEdit()    { setPreview(false); }

  function handleConfirm() { setConfirming(true); }
  function handleCancel()  { setConfirming(false); }

  async function handleSend() {
    setLoading(true);
    setError(null);
    try {
      const res = await adminBroadcast(getToken(), subject, body, tier || undefined);
      setResult(res);
      setConfirming(false);
      setPreview(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 28, fontWeight: 600, color: "var(--ink)", margin: 0 }}>Broadcast</h1>
        <Card>
          <CardContent>
            <p style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 22, fontWeight: 600, color: "var(--credit)", margin: "16px 0 8px" }}>
              Sent to {result.sent} of {result.total} recipients.
            </p>
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => { setResult(null); setSubject(""); setBody(""); setTier(""); }}>
              New Broadcast
            </button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 680 }}>
      <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 28, fontWeight: 600, color: "var(--ink)", margin: 0 }}>
        Broadcast Email
      </h1>

      {error && <p style={{ color: "var(--debit)", fontFamily: "var(--font-jetbrains), monospace", fontSize: 13 }}>{error}</p>}

      {!preview ? (
        /* Edit form */
        <Card>
          <CardHeader><CardTitle>Compose</CardTitle></CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label className="mono-label" style={{ display: "block", marginBottom: 6 }}>Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Product Hunt launch!"
                style={inputStyle}
              />
            </div>
            <div>
              <label className="mono-label" style={{ display: "block", marginBottom: 6 }}>Body (plain text / markdown)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                placeholder="Write your announcement here…"
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </div>
            <div>
              <label className="mono-label" style={{ display: "block", marginBottom: 6 }}>Recipient Filter</label>
              <select value={tier} onChange={(e) => setTier(e.target.value as TierFilter)} style={{ ...inputStyle, width: "auto" }}>
                <option value="">All users</option>
                <option value="free">Free only</option>
                <option value="pro">Pro only</option>
                <option value="team">Team only</option>
              </select>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-primary" onClick={handlePreview} disabled={!subject.trim() || !body.trim()}>
                Preview →
              </button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Preview */
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <p className="mono-label" style={{ marginBottom: 4 }}>Subject</p>
              <p style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 18, fontWeight: 600, color: "var(--ink)", margin: 0 }}>{subject}</p>
            </div>
            <div>
              <p className="mono-label" style={{ marginBottom: 6 }}>To</p>
              <p style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: 12, color: "var(--ink-80)", margin: 0 }}>
                {tier ? `All ${tier} users` : "All users"}
              </p>
            </div>
            <div style={{ border: "1px solid var(--ink-10)", borderRadius: 6, padding: "20px 24px", background: "var(--paper-deep)" }}>
              <pre style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: 13, color: "var(--ink-80)", margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{body}</pre>
            </div>

            {confirming ? (
              <div style={{ border: "1px solid var(--debit)", borderRadius: 8, padding: "16px 20px", background: "rgba(139,46,26,0.06)" }}>
                <p style={{ fontFamily: "var(--font-jetbrains), monospace", fontSize: 13, color: "var(--debit)", margin: "0 0 14px" }}>
                  This will send a real email to all matching users. This cannot be undone.
                </p>
                <div style={{ display: "flex", gap: 10 }}>
                  <button className="btn btn-primary" style={{ background: "var(--debit)", borderColor: "var(--debit)" }} onClick={handleSend} disabled={loading}>
                    {loading ? "Sending…" : "Confirm Send"}
                  </button>
                  <button className="btn btn-secondary" onClick={handleCancel} disabled={loading}>Cancel</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" onClick={handleConfirm}>Send Broadcast</button>
                <button className="btn btn-secondary" onClick={handleEdit}>← Edit</button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--ink-10)",
  background: "var(--paper-deep)",
  color: "var(--ink)",
  fontFamily: "var(--font-jetbrains), monospace",
  fontSize: 13,
  padding: "8px 12px",
  borderRadius: 6,
  outline: "none",
  boxSizing: "border-box",
};
