/**
 * audit.ts — Audit log endpoints (Phase 4).
 *
 * POST /audit/event    — ingest a tool invocation event (team+ tier)
 * GET  /audit/events   — query events with filters (org admin only)
 * GET  /audit/export   — stream org audit log as NDJSON (org admin only)
 *
 * Immutable append-only guarantee: no UPDATE or DELETE is ever issued against
 * audit_events except via a separate admin purge path (not exposed here).
 *
 * Path redaction: callers supply raw args; this layer fingerprints any path
 * values with SHA-256 before writing. File contents are never stored.
 */

import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, requireTier } from "../lib/auth.js";
import { appendAuditEvent, queryAuditEvents, streamAuditEvents, getUserByToken } from "../db.js";
import { getDb } from "../db.js";

// ---------------------------------------------------------------------------
// Org / role helpers (mirrors policy.ts)
// ---------------------------------------------------------------------------

function getUserOrgId(userId: string): string | null {
  const row = getDb()
    .query<{ org_id: string | null }, [string]>(
      `SELECT org_id FROM users WHERE id = ?`,
    )
    .get(userId);
  return row?.org_id ?? null;
}

function getUserOrgRole(userId: string): string | null {
  const row = getDb()
    .query<{ org_role: string | null }, [string]>(
      `SELECT org_role FROM users WHERE id = ?`,
    )
    .get(userId);
  return row?.org_role ?? null;
}

// ---------------------------------------------------------------------------
// Path fingerprinting
// ---------------------------------------------------------------------------

/**
 * Fingerprint a string value (typically a file path or cwd) with SHA-256.
 * Returns a 16-char hex prefix — enough for correlation without leaking paths.
 */
async function fingerprint(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

/**
 * Redact an args object: replace any string value that looks like a path
 * (starts with / or ~/ or ./) with its SHA-256 fingerprint. Never store
 * file content (values longer than 512 chars are replaced with a fixed token).
 */
async function redactArgs(args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") {
      if (v.length > 512) {
        out[k] = "[redacted:large]";
      } else if (/^[/~.]/.test(v)) {
        out[k] = "fp:" + (await fingerprint(v));
      } else {
        out[k] = v;
      }
    } else if (v !== null && typeof v === "object") {
      // Shallow redaction for nested objects
      out[k] = await redactArgs(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const eventSchema = z.object({
  tool: z.string().min(1).max(128),
  args: z.record(z.unknown()).default({}),
  userId: z.string().min(1),
  cwd: z.string().default(""),
  gitCommit: z.string().default(""),
  timestamp: z.string().datetime().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const audit = new Hono();

// ---------------------------------------------------------------------------
// POST /audit/event
// ---------------------------------------------------------------------------

audit.post("/audit/event", authMiddleware, async (c) => {
  const user = c.get("user");

  const tierDeny = requireTier(c, user, "team");
  if (tierDeny) return tierDeny;

  const orgId = getUserOrgId(user.id);
  if (!orgId) {
    return c.json({ error: "You are not a member of any organisation." }, 400);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = eventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  const { tool, args, cwd, gitCommit, timestamp } = parsed.data;

  // Redact paths in args; fingerprint cwd
  const [redactedArgs, cwdFp] = await Promise.all([
    redactArgs(args as Record<string, unknown>),
    cwd ? fingerprint(cwd) : Promise.resolve(""),
  ]);

  const eventId = appendAuditEvent({
    orgId,
    userId: user.id,
    tool,
    argsJson: JSON.stringify(redactedArgs),
    cwdFingerprint: cwdFp,
    gitCommit: gitCommit.slice(0, 40), // trim to SHA length
    at: timestamp,
  });

  return c.json({ eventId, committedAt: new Date().toISOString() }, 201);
});

// ---------------------------------------------------------------------------
// GET /audit/events
// ---------------------------------------------------------------------------

audit.get("/audit/events", authMiddleware, (c) => {
  const user = c.get("user");

  const tierDeny = requireTier(c, user, "team");
  if (tierDeny) return tierDeny;

  const role = getUserOrgRole(user.id);
  if (role !== "admin") {
    return c.json({ error: "Only org admins can query the audit log." }, 403);
  }

  const q = c.req.query();
  const orgId = q["orgId"] ?? getUserOrgId(user.id);
  if (!orgId) {
    return c.json({ error: "orgId is required." }, 400);
  }

  // Verify caller belongs to this org
  const callerOrgId = getUserOrgId(user.id);
  if (callerOrgId !== orgId) {
    return c.json({ error: "orgId does not match your organisation." }, 403);
  }

  const limit  = Math.min(Number(q["limit"] ?? 100), 1000);
  const offset = Number(q["offset"] ?? 0);

  const events = queryAuditEvents({
    orgId,
    from:   q["from"],
    to:     q["to"],
    userId: q["user"],
    tool:   q["tool"],
    limit,
    offset,
  });

  return c.json({ events, count: events.length, limit, offset });
});

// ---------------------------------------------------------------------------
// GET /audit/export
// ---------------------------------------------------------------------------

audit.get("/audit/export", authMiddleware, (c) => {
  const user = c.get("user");

  const tierDeny = requireTier(c, user, "team");
  if (tierDeny) return tierDeny;

  const role = getUserOrgRole(user.id);
  if (role !== "admin") {
    return c.json({ error: "Only org admins can export the audit log." }, 403);
  }

  const orgId = getUserOrgId(user.id);
  if (!orgId) {
    return c.json({ error: "You are not a member of any organisation." }, 400);
  }

  const events = streamAuditEvents(orgId);

  // Stream as NDJSON
  const ndjson = events.map((e) => JSON.stringify(e)).join("\n");

  return new Response(ndjson, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson",
      "Content-Disposition": `attachment; filename="audit-${orgId}-${new Date().toISOString().slice(0, 10)}.ndjson"`,
    },
  });
});

export default audit;
