/**
 * sentry.ts — Sentry error-tracking integration.
 *
 * - No-op when SENTRY_DSN is unset (local dev).
 * - Scrubs PII from events before send.
 * - Exposes `captureException` and `sentryErrorHandler` Hono middleware.
 */

import type { Context, Next } from "hono";

// Lazily typed — only import when DSN is present to avoid side-effects in tests.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Sentry: any = null;

/** Call once at process start. Safe to call when DSN is absent. */
export function initSentry(release?: string): void {
  const dsn = process.env["SENTRY_DSN"];
  if (!dsn) return; // no-op in local dev / tests

  // Dynamic import so the module is never evaluated in DSN-less environments.
  import("@sentry/bun").then((mod) => {
    Sentry = mod;
    Sentry.init({
      dsn,
      release,
      tracesSampleRate: 0.1,
      beforeSend(event: Record<string, unknown>) {
        return scrubEvent(event);
      },
    });
  });
}

/** Manually capture an exception. No-op if Sentry is not initialised. */
export function captureException(
  err: unknown,
  extras?: Record<string, unknown>,
): void {
  if (!Sentry) return;
  Sentry.withScope((scope: { setExtras: (e: Record<string, unknown>) => void }) => {
    if (extras) scope.setExtras(extras);
    Sentry.captureException(err);
  });
}

/**
 * Hono error middleware. Mount AFTER all routes so it catches thrown errors.
 * Re-throws after capture so Hono's built-in error handler still responds.
 */
export async function sentryErrorHandler(
  err: Error,
  c: Context,
): Promise<Response> {
  const user = c.get("user" as never) as { id?: string } | undefined;
  captureException(err, {
    requestId: c.req.header("x-request-id"),
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    user_id: user?.id,
  });
  return c.json({ error: "Internal server error" }, 500);
}

// ---------------------------------------------------------------------------
// PII scrubber
// ---------------------------------------------------------------------------

const PII_KEYS = new Set(["text", "systemPrompt", "email", "authorization", "cookie", "password"]);

function scrubEvent(event: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(event, (_key, value) => {
    if (PII_KEYS.has(_key) && typeof value === "string") return "[REDACTED]";
    return value;
  }));
}
