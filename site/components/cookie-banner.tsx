"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "ashlr_cookie_consent";
const CONSENT_TTL_MS = 180 * 24 * 60 * 60 * 1000; // 180 days

function hasValidConsent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const { ts } = JSON.parse(raw) as { ts: number };
    return Date.now() - ts < CONSENT_TTL_MS;
  } catch {
    return false;
  }
}

function recordConsent() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now() }));
  } catch {
    // localStorage unavailable — silently continue
  }
}

/**
 * CookieBanner — renders only on pages that load Stripe
 * (checkout, billing portal). Mount this component only on those pages.
 *
 * Accessibility:
 *   - role="dialog" + aria-live="polite" so screen readers announce it
 *   - Dismissable with Escape key
 *   - Focus is managed: first interactive element receives focus on mount
 */
export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasValidConsent()) {
      setVisible(true);
    }
  }, []);

  useEffect(() => {
    if (!visible) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        dismiss();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function dismiss() {
    recordConsent();
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: "fixed",
        bottom: "clamp(16px, 3vw, 28px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 9999,
        width: "clamp(280px, 90vw, 560px)",
        background: "var(--paper-deep)",
        border: "1px solid var(--ink-10)",
        borderRadius: 4,
        padding: "16px 20px",
        boxShadow: "0 4px 24px rgba(0,0,0,0.10)",
        display: "flex",
        alignItems: "center",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <p
        style={{
          flex: "1 1 200px",
          margin: 0,
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--ink-80)",
          fontFamily: "var(--font-ibm-plex), ui-sans-serif, system-ui",
        }}
      >
        We use cookies on this page for payment processing only.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <a
          href="/privacy#cookies"
          style={{
            fontSize: 12,
            color: "var(--ink-55)",
            fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Learn more &rarr;
        </a>

        <button
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          onClick={dismiss}
          style={{
            cursor: "pointer",
            background: "var(--ink)",
            color: "var(--paper)",
            border: "1px solid var(--ink)",
            borderRadius: 3,
            padding: "6px 16px",
            fontSize: 12,
            fontFamily: "var(--font-jetbrains), ui-monospace, monospace",
            letterSpacing: "0.04em",
            whiteSpace: "nowrap",
          }}
        >
          Accept
        </button>
      </div>
    </div>
  );
}
