/**
 * sentry.server.config.ts — Sentry server-side (Node.js/Edge) init for Next.js.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
    beforeSend(event) {
      // Strip PII from server-side events
      return JSON.parse(
        JSON.stringify(event, (key, value) => {
          const PII = new Set(["email", "authorization", "token", "cookie", "password"]);
          if (PII.has(key) && typeof value === "string") return "[REDACTED]";
          return value;
        }),
      );
    },
  });
}
