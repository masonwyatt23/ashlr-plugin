"use client";

/**
 * subscribe-form.tsx — Email subscribe widget.
 *
 * Client component — uses a controlled form with fetch() to POST to the
 * backend /status/subscribe endpoint.
 */

import { useState } from "react";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "https://api.ashlr.ai";

type State = "idle" | "loading" | "sent" | "error";

export default function SubscribeForm() {
  const [email, setEmail]   = useState("");
  const [state, setState]   = useState<State>("idle");
  const [errMsg, setErrMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || state === "loading") return;

    setState("loading");
    setErrMsg("");

    try {
      const res = await fetch(`${API_BASE}/status/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (res.ok) {
        setState("sent");
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string };
        setErrMsg(body.error ?? "Something went wrong. Please try again.");
        setState("error");
      }
    } catch {
      setErrMsg("Network error. Please try again.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 12,
          color: "#4F5B3F",
          padding: "10px 0",
        }}
      >
        Check your inbox — confirmation email sent.
      </div>
    );
  }

  return (
    <form onSubmit={(e) => { void handleSubmit(e); }} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="your@email.com"
        required
        disabled={state === "loading"}
        style={{
          fontFamily: "var(--font-jetbrains), monospace",
          fontSize: 12,
          padding: "9px 12px",
          border: "1px solid var(--ink-30)",
          background: "var(--paper)",
          color: "var(--ink)",
          outline: "none",
          width: 220,
          flexShrink: 0,
        }}
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="btn btn-primary"
        style={{ fontSize: 11 }}
      >
        {state === "loading" ? "Sending..." : "Subscribe"}
      </button>
      {state === "error" && (
        <p
          style={{
            width: "100%",
            fontFamily: "var(--font-jetbrains), monospace",
            fontSize: 11,
            color: "#8B2E1A",
            margin: "4px 0 0",
          }}
        >
          {errMsg}
        </p>
      )}
    </form>
  );
}
