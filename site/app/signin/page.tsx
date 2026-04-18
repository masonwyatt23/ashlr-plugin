"use client";

/**
 * /signin — Magic-link sign-in page.
 * User enters email, we POST to /auth/send, show confirmation.
 */

import { useState, useRef, useEffect, type FormEvent } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_ASHLR_API_URL ?? "https://api.ashlr.ai";

export default function SignInPage() {
  const [email, setEmail]     = useState("");
  const [sent, setSent]       = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API}/auth/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        if (res.status === 429) {
          setError("Too many requests. Please wait a moment before trying again.");
        } else if (res.status === 400) {
          setError("Please enter a valid email address.");
        } else {
          setError(body.error ?? "Something went wrong. Try again.");
        }
        return;
      }

      setSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--paper)",
        padding: "24px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontFamily: "var(--font-fraunces), ui-serif",
            fontSize: 22,
            fontWeight: 300,
            letterSpacing: "-0.01em",
            fontVariationSettings: '"SOFT" 30, "opsz" 30',
            color: "var(--ink)",
            textDecoration: "none",
            marginBottom: 40,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              background: "var(--debit)",
              borderRadius: 1,
            }}
          />
          ashlr
        </Link>

        <div
          className="ledger-card px-8 py-8"
          style={{ background: "var(--paper-deep)" }}
        >
          {sent ? (
            /* Success state */
            <div role="status" aria-live="polite">
              <div
                className="mono-label mb-4"
                style={{ color: "var(--credit)" }}
              >
                Link sent
              </div>
              <p
                className="font-mono text-[13px] leading-relaxed"
                style={{ color: "var(--ink-80)" }}
              >
                Check your email — we sent you a sign-in link.
              </p>
              <p
                className="font-mono text-[12px] mt-3"
                style={{ color: "var(--ink-30)" }}
              >
                The link expires in 15 minutes.
              </p>
              <button
                type="button"
                onClick={() => { setSent(false); setEmail(""); }}
                className="font-mono text-[12px] mt-6 underline"
                style={{ color: "var(--ink-55)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            /* Form state */
            <>
              <div className="mono-label mb-6">Sign in</div>

              <form onSubmit={handleSubmit} noValidate>
                <div style={{ marginBottom: 20 }}>
                  <label
                    htmlFor="email"
                    className="font-mono text-[11px]"
                    style={{
                      display: "block",
                      marginBottom: 8,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--ink-55)",
                    }}
                  >
                    Email address
                  </label>
                  <input
                    ref={inputRef}
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={{
                      width: "100%",
                      background: "var(--paper)",
                      border: "1px solid var(--ink-10)",
                      borderRadius: 4,
                      padding: "10px 12px",
                      fontFamily: "var(--font-jetbrains), ui-monospace",
                      fontSize: 13,
                      color: "var(--ink)",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--ink-55)"; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--ink-10)"; }}
                  />
                </div>

                {/* Error live region */}
                {error && (
                  <p
                    role="alert"
                    aria-live="assertive"
                    className="font-mono text-[12px] mb-4"
                    style={{ color: "var(--debit)" }}
                  >
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="btn btn-primary"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    opacity: loading || !email.trim() ? 0.5 : 1,
                    cursor: loading || !email.trim() ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Sending..." : "Send me a sign-in link"}
                </button>
              </form>
            </>
          )}
        </div>

        <p
          className="font-mono text-[11px] mt-6 text-center"
          style={{ color: "var(--ink-30)" }}
        >
          No password needed.{" "}
          <Link
            href="/docs/pro/setup"
            style={{ color: "var(--ink-55)", textDecoration: "underline" }}
          >
            Learn more
          </Link>
        </p>
      </div>
    </main>
  );
}
