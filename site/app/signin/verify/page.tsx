"use client";

/**
 * /signin/verify — Magic-link verification page.
 * Reads ?token= from URL, POSTs to /auth/verify, stores credentials, redirects.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

const API = process.env.NEXT_PUBLIC_ASHLR_API_URL ?? "https://api.ashlr.ai";

function VerifyContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setStatus("error");
      return;
    }

    fetch(`${API}/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const body = await res.json() as { apiToken: string; userId: string; email: string };
        if (typeof window !== "undefined") {
          localStorage.setItem("ashlrToken",  body.apiToken);
          localStorage.setItem("ashlrUserId", body.userId);
        }
        setStatus("success");
        router.replace("/dashboard");
      })
      .catch(() => {
        setStatus("error");
      });
  }, [searchParams, router]);

  if (status === "verifying") {
    return (
      <p
        role="status"
        aria-live="polite"
        className="font-mono text-[13px]"
        style={{ color: "var(--ink-55)" }}
      >
        Verifying your link...
      </p>
    );
  }

  if (status === "success") {
    return (
      <p
        role="status"
        aria-live="polite"
        className="font-mono text-[13px]"
        style={{ color: "var(--credit)" }}
      >
        Signed in. Redirecting...
      </p>
    );
  }

  // Error state
  return (
    <div role="alert" aria-live="assertive">
      <div
        className="mono-label mb-4"
        style={{ color: "var(--debit)" }}
      >
        Link expired
      </div>
      <p
        className="font-mono text-[13px] leading-relaxed mb-6"
        style={{ color: "var(--ink-80)" }}
      >
        This link is invalid or expired. Request a new one.
      </p>
      <Link
        href="/signin"
        className="btn"
        style={{ display: "inline-flex" }}
      >
        Back to sign in
      </Link>
    </div>
  );
}

export default function VerifyPage() {
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
          <Suspense
            fallback={
              <p className="font-mono text-[13px]" style={{ color: "var(--ink-55)" }}>
                Loading...
              </p>
            }
          >
            <VerifyContent />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
