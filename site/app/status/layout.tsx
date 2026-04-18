/**
 * status/layout.tsx — Minimal layout for the status subdomain.
 *
 * Skips the main site Nav/Footer. Renders a compact header with the ashlr
 * wordmark linked back to plugin.ashlr.ai and a simple footer.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  metadataBase: new URL("https://status.ashlr.ai"),
  title: {
    default: "ashlr Status",
    template: "%s · ashlr Status",
  },
  description: "Real-time service status for ashlr — plugin registry, API, LLM summarizer, billing, email, and docs.",
};

export default function StatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Minimal nav */}
      <header
        style={{
          borderBottom: "1px solid var(--ink-10)",
          background: "var(--paper-deep)",
          padding: "14px 0",
        }}
      >
        <div
          className="wrap"
          style={{
            maxWidth: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <a
            href="https://plugin.ashlr.ai"
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontWeight: 300,
              fontSize: 18,
              letterSpacing: "-0.01em",
              fontVariationSettings: '"SOFT" 30, "opsz" 30',
              color: "var(--ink)",
              textDecoration: "none",
            }}
          >
            ashlr
          </a>

          <nav
            style={{ display: "flex", gap: 20, alignItems: "center" }}
            aria-label="Status navigation"
          >
            <Link
              href="/status"
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ink-55)",
                textDecoration: "none",
              }}
            >
              Status
            </Link>
            <a
              href="/status/rss.xml"
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--ink-55)",
                textDecoration: "none",
              }}
              title="RSS feed"
            >
              RSS
            </a>
          </nav>
        </div>
      </header>

      {children}

      {/* Minimal footer */}
      <footer
        style={{
          borderTop: "1px solid var(--ink-10)",
          padding: "24px 0",
          background: "var(--paper-deep)",
        }}
      >
        <div
          className="wrap"
          style={{
            maxWidth: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-jetbrains), monospace",
              fontSize: 11,
              color: "var(--ink-30)",
            }}
          >
            &copy; {new Date().getFullYear()} Mason Wyatt &mdash; ashlr
          </span>
          <div style={{ display: "flex", gap: 16 }}>
            <a
              href="https://plugin.ashlr.ai"
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                color: "var(--ink-30)",
                textDecoration: "none",
              }}
            >
              plugin.ashlr.ai
            </a>
            <a
              href="https://plugin.ashlr.ai/privacy"
              style={{
                fontFamily: "var(--font-jetbrains), monospace",
                fontSize: 11,
                color: "var(--ink-30)",
                textDecoration: "none",
              }}
            >
              Privacy
            </a>
          </div>
        </div>
      </footer>
    </>
  );
}
