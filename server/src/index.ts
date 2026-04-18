/**
 * index.ts — ashlr pro backend.
 *
 * Services:
 *   - Auth:            POST /auth/send, POST /auth/verify
 *   - Hosted badge:    GET  /u/:userId/badge.svg
 *   - Stats sync:      POST /stats/sync
 *   - Stats agg:       GET  /stats/aggregate
 *   - LLM summarize:   POST /llm/summarize
 *   - Billing:         POST /billing/checkout, GET /billing/portal, etc.
 *   - Health (legacy): GET  /
 *   - Liveness:        GET  /healthz
 *   - Readiness:       GET  /readyz
 *   - Metrics:         GET  /metrics  (gated)
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync } from "fs";
import { join } from "path";

import badgeRouter   from "./routes/badge.js";
import statsRouter   from "./routes/stats.js";
import llmRouter     from "./routes/llm.js";
import billingRouter from "./routes/billing.js";
import authRouter    from "./routes/auth.js";

import { initSentry, sentryErrorHandler } from "./lib/sentry.js";
import { httpLogger, logger } from "./lib/logger.js";
import { metricsHandler, cHttpRequests, hHttpDuration } from "./lib/metrics.js";
import { getDb } from "./db.js";

// ---------------------------------------------------------------------------
// Sentry — initialise before anything else
// ---------------------------------------------------------------------------

let pluginVersion = "unknown";
try {
  const raw = readFileSync(
    join(import.meta.dir, "../../../plugin.json"),
    "utf8",
  );
  pluginVersion = (JSON.parse(raw) as { version?: string }).version ?? "unknown";
} catch { /* plugin.json absent in some deploy contexts */ }

initSentry(`ashlr-server@${pluginVersion}`);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono();

// CORS
app.use(
  "/*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id"],
    exposeHeaders: ["X-Request-Id"],
  }),
);

// Request ID + structured logging
app.use("/*", httpLogger);

// Metrics instrumentation (latency recorded after response)
app.use("/*", async (c, next) => {
  const start = Date.now();
  await next();
  const path = new URL(c.req.url).pathname;
  const method = c.req.method;
  const status = String(c.res.status);
  const latency = (Date.now() - start) / 1000;
  cHttpRequests.inc({ method, path, status });
  hHttpDuration.observe({ method, path }, latency);
});

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

const SERVER_START = Date.now();

// Legacy — kept for backwards compat
app.get("/", (c) => c.json({ ok: true, service: "ashlr-server", phase: 1 }));

// Liveness — process is alive
app.get("/healthz", (c) =>
  c.json({
    status: "ok",
    version: pluginVersion,
    uptimeSeconds: Math.floor((Date.now() - SERVER_START) / 1000),
  }),
);

// Readiness — SQLite reachable
app.get("/readyz", (c) => {
  let dbStatus: "ok" | "error" = "ok";
  try {
    getDb().query("SELECT 1").get();
  } catch {
    dbStatus = "error";
  }
  const ok = dbStatus === "ok";
  return c.json(
    { db: dbStatus, checks: { sqlite: dbStatus } },
    ok ? 200 : 503,
  );
});

// Metrics
app.get("/metrics", metricsHandler);

// ---------------------------------------------------------------------------
// Feature routers
// ---------------------------------------------------------------------------

app.route("/", authRouter);
app.route("/", badgeRouter);
app.route("/", statsRouter);
app.route("/", llmRouter);
app.route("/", billingRouter);

// 404 fallback
app.notFound((c) => c.json({ error: "Not found" }, 404));

// Sentry error handler (must be last)
app.onError(sentryErrorHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = Number(process.env["PORT"] ?? 3001);

export default app;

if (import.meta.main) {
  Bun.serve({ fetch: app.fetch, port: PORT });
  logger.info({ port: PORT, version: pluginVersion }, "ashlr-server started");
}
