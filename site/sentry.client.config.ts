/**
 * sentry.client.config.ts — Sentry browser-side initialisation for Next.js.
 *
 * Only active on authenticated pages (/dashboard, /signin/*, /billing/*).
 * Marketing pages are intentionally excluded to reduce noise.
 * PII (email, tokens, cookie values) is scrubbed before sending.
 */

import * as Sentry from "@sentry/nextjs";

const dsn = process.env["NEXT_PUBLIC_SENTRY_DSN"];

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,

    // Only instrument authenticated app pages; skip marketing routes.
    tracePropagationTargets: [/\/dashboard/, /\/signin/, /\/billing/],

    beforeSend(event) {
      return scrubEvent(event);
    },

    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
  });
}

// ---------------------------------------------------------------------------
// PII scrubbers
// ---------------------------------------------------------------------------

const PII_KEYS = new Set(["email", "authorization", "token", "cookie", "password", "text", "systemPrompt"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scrubEvent(event: any): any {
  return JSON.parse(
    JSON.stringify(event, (key, value) => {
      if (PII_KEYS.has(key) && typeof value === "string") return "[REDACTED]";
      return value;
    }),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scrubBreadcrumb(breadcrumb: any): any {
  if (breadcrumb?.data) {
    for (const key of Object.keys(breadcrumb.data)) {
      if (PII_KEYS.has(key)) breadcrumb.data[key] = "[REDACTED]";
    }
  }
  return breadcrumb;
}
