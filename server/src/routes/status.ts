/**
 * status.ts — Public status page endpoints.
 *
 * GET  /status/current          — latest component health + recent incidents
 * GET  /status/history?days=90  — 90-day uptime rollups per component
 * POST /status/incident         — create incident (admin only)
 * PATCH /status/incident/:id    — append update (admin only)
 * POST /status/subscribe        — subscribe to email updates
 * GET  /status/confirm?token=   — confirm subscription via magic link
 * POST /status/unsubscribe      — remove subscription via magic token
 *
 * Public endpoints: rate-limited to 30 req/min/IP.
 * Admin endpoints:  require Bearer token + org_role = 'admin'.
 * Subscribe:        additionally rate-limited to 3 attempts/email/day.
 */

import { Hono } from "hono";
import { z } from "zod";
import {
  getLatestHealthChecks,
  getUptimeHistory,
  getRecentIncidents,
  getIncidentById,
  getIncidentUpdates,
  createIncident,
  appendIncidentUpdate,
  upsertStatusSubscriber,
  confirmStatusSubscriber,
  removeStatusSubscriber,
  countRecentSubscribeAttempts,
  getUserByToken,
  getDb,
} from "../db.js";
import { checkRateLimitBucket } from "../lib/ratelimit.js";
import { sendEmail } from "../lib/email.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STATUS_BASE_URL = process.env["STATUS_BASE_URL"] ?? "https://status.ashlr.ai";
const SUBSCRIBE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const SUBSCRIBE_RATE_WINDOW_MS = 24 * 60 * 60 * 1000; // 1 day
const SUBSCRIBE_RATE_MAX = 3;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive the client IP from the request. */
function clientIp(req: Request): string {
  return (
    (req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown")
  );
}

/** Rate-limit public endpoints: 30 req/min/IP. */
function checkPublicRateLimit(ip: string): boolean {
  return checkRateLimitBucket(`status:ip:${ip}`, 60_000, 30);
}

/** Check admin: Bearer token present, user exists, org_role = 'admin'. */
function isAdmin(req: Request): boolean {
  const header = req.headers.get("Authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  if (!token) return false;
  const user = getUserByToken(token);
  if (!user) return false;
  const row = getDb()
    .query<{ org_role: string | null }, [string]>(
      `SELECT org_role FROM users WHERE id = ?`,
    )
    .get(user.id);
  return row?.org_role === "admin";
}

/** Derive overall health from component list. */
function deriveOverall(
  components: Array<{ status: string }>,
): "operational" | "partial_outage" | "major_outage" | "unknown" {
  if (components.length === 0) return "unknown";
  const statuses = components.map((c) => c.status);
  if (statuses.every((s) => s === "ok")) return "operational";
  if (statuses.every((s) => s === "down")) return "major_outage";
  return "partial_outage";
}

/** Generate a random URL-safe token. */
function makeToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const incidentCreateSchema = z.object({
  title: z.string().min(1).max(200),
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  affectedComponents: z.array(z.string()).default([]),
  body: z.string().default(""),
});

const incidentUpdateSchema = z.object({
  status: z.enum(["investigating", "identified", "monitoring", "resolved"]),
  body: z.string().min(1),
});

const subscribeSchema = z.object({
  email: z.string().email(),
});

const unsubscribeSchema = z.object({
  token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = new Hono();

// ---------------------------------------------------------------------------
// GET /status/current
// ---------------------------------------------------------------------------

router.get("/status/current", (c) => {
  const ip = clientIp(c.req.raw);
  if (!checkPublicRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  const checks = getLatestHealthChecks();
  const components = checks.map((h) => ({
    name: h.component,
    status: h.status,
    lastCheckedAt: h.checked_at,
    latencyMs: h.latency_ms,
  }));

  const recentIncidentsRaw = getRecentIncidents(30);
  const recentIncidents = recentIncidentsRaw.map((inc) => ({
    id: inc.id,
    title: inc.title,
    status: inc.status,
    affectedComponents: JSON.parse(inc.affected_components_json) as string[],
    createdAt: inc.created_at,
    resolvedAt: inc.resolved_at,
    body: inc.body,
  }));

  return c.json({
    overall: deriveOverall(components),
    components,
    recentIncidents,
    generatedAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------
// GET /status/history?days=90
// ---------------------------------------------------------------------------

router.get("/status/history", (c) => {
  const ip = clientIp(c.req.raw);
  if (!checkPublicRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  const daysParam = Number(c.req.query("days") ?? 90);
  const days = Math.min(Math.max(1, isNaN(daysParam) ? 90 : daysParam), 365);

  const rows = getUptimeHistory(days);

  // Group by component
  const byComponent: Record<string, Array<{ date: string; uptimePct: number }>> = {};
  for (const row of rows) {
    if (!byComponent[row.component]) byComponent[row.component] = [];
    byComponent[row.component]!.push({
      date: row.date,
      uptimePct: row.total > 0 ? Math.round((row.ok / row.total) * 10000) / 100 : 100,
    });
  }

  return c.json({ days, history: byComponent });
});

// ---------------------------------------------------------------------------
// POST /status/incident  (admin only)
// ---------------------------------------------------------------------------

router.post("/status/incident", async (c) => {
  if (!isAdmin(c.req.raw)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const parsed = incidentCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const { title, status, affectedComponents, body: incBody } = parsed.data;
  const incident = createIncident({
    title,
    status,
    affectedComponentsJson: JSON.stringify(affectedComponents),
    body: incBody,
  });

  return c.json({
    id: incident.id,
    title: incident.title,
    status: incident.status,
    affectedComponents,
    createdAt: incident.created_at,
    body: incident.body,
  }, 201);
});

// ---------------------------------------------------------------------------
// PATCH /status/incident/:id  (admin only)
// ---------------------------------------------------------------------------

router.patch("/status/incident/:id", async (c) => {
  if (!isAdmin(c.req.raw)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const id = c.req.param("id");
  const existing = getIncidentById(id);
  if (!existing) {
    return c.json({ error: "Incident not found" }, 404);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const parsed = incidentUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request", details: parsed.error.flatten() }, 400);
  }

  const update = appendIncidentUpdate({
    incidentId: id,
    status: parsed.data.status,
    body: parsed.data.body,
  });

  return c.json({
    incidentId: id,
    updateId: update.id,
    status: update.status,
    body: update.body,
    postedAt: update.posted_at,
  });
});

// ---------------------------------------------------------------------------
// POST /status/subscribe
// ---------------------------------------------------------------------------

router.post("/status/subscribe", async (c) => {
  const ip = clientIp(c.req.raw);
  // 30 req/min/IP for general endpoint
  if (!checkPublicRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid email address" }, 400);
  }

  const { email } = parsed.data;

  // Per-email rate limit: 3 per day
  const recentCount = countRecentSubscribeAttempts(email, SUBSCRIBE_RATE_WINDOW_MS);
  if (recentCount >= SUBSCRIBE_RATE_MAX) {
    return c.json({ error: "Too many subscribe requests for this email. Try again tomorrow." }, 429);
  }

  const token = makeToken();
  const expiresAt = new Date(Date.now() + SUBSCRIBE_TOKEN_TTL_MS).toISOString();
  upsertStatusSubscriber(email, token, expiresAt);

  const confirmLink = `${STATUS_BASE_URL}/confirm?token=${token}`;
  const unsubscribeLink = `${STATUS_BASE_URL}/unsubscribe?token=${token}`;

  // Fire-and-forget, never throw
  try {
    await sendEmail("status-confirm", {
      to: email,
      data: { confirmLink, unsubscribeLink },
    });
  } catch (err) {
    process.stderr.write(`[status] confirm email failed for ${email}: ${String(err)}\n`);
  }

  return c.json({ sent: true });
});

// ---------------------------------------------------------------------------
// GET /status/confirm?token=   (called from email link)
// ---------------------------------------------------------------------------

router.get("/status/confirm", (c) => {
  const ip = clientIp(c.req.raw);
  if (!checkPublicRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  const token = c.req.query("token") ?? "";
  if (!token) {
    return c.json({ error: "Missing token" }, 400);
  }

  const ok = confirmStatusSubscriber(token);
  if (!ok) {
    return c.json({ error: "Invalid or expired confirmation token" }, 400);
  }

  return c.json({ confirmed: true });
});

// ---------------------------------------------------------------------------
// POST /status/unsubscribe
// ---------------------------------------------------------------------------

router.post("/status/unsubscribe", async (c) => {
  const ip = clientIp(c.req.raw);
  if (!checkPublicRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  let body: unknown;
  try { body = await c.req.json(); } catch { return c.json({ error: "Invalid JSON" }, 400); }

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request" }, 400);
  }

  // Always return success — prevents enumeration of subscribers
  removeStatusSubscriber(parsed.data.token);
  return c.json({ unsubscribed: true });
});

// ---------------------------------------------------------------------------
// GET /status/incident/:id  (public detail — used by RSS + site)
// ---------------------------------------------------------------------------

router.get("/status/incident/:id", (c) => {
  const ip = clientIp(c.req.raw);
  if (!checkPublicRateLimit(ip)) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  const id = c.req.param("id");
  const incident = getIncidentById(id);
  if (!incident) {
    return c.json({ error: "Not found" }, 404);
  }

  const updates = getIncidentUpdates(id);

  return c.json({
    id: incident.id,
    title: incident.title,
    status: incident.status,
    affectedComponents: JSON.parse(incident.affected_components_json) as string[],
    createdAt: incident.created_at,
    resolvedAt: incident.resolved_at,
    body: incident.body,
    updates: updates.map((u) => ({
      id: u.id,
      status: u.status,
      body: u.body,
      postedAt: u.posted_at,
    })),
  });
});

export default router;
