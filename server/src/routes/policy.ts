/**
 * policy.ts — Policy pack endpoints (Phase 4).
 *
 * POST /policy/upload   — create/update a policy pack (admin only, team+ tier)
 * GET  /policy/current  — fetch current pack for the authed user's org
 * GET  /policy/history  — list recent versions with audit metadata
 * POST /policy/rollback — revert to an earlier version
 *
 * All endpoints require Authorization: Bearer <token> and team+ tier.
 * Only users with role "admin" in their org can call /policy/upload and /policy/rollback.
 *
 * Org membership is tracked via a simple convention: the org_id is stored on
 * the user record. For Phase 4 we store org_id in a users.org_id column added
 * via migration and role in users.org_role. Callers without an org get 400.
 */

import { Hono } from "hono";
import { z } from "zod";
import { authMiddleware, requireTier } from "../lib/auth.js";
import {
  createPolicyPack,
  getCurrentPolicyPack,
  getPolicyPackById,
  getPolicyPackByVersion,
  getPolicyPackHistory,
  setCurrentPolicyPack,
  type PolicyRules,
} from "../db.js";
import { getDb } from "../db.js";

// ---------------------------------------------------------------------------
// Org / role helpers
// ---------------------------------------------------------------------------

/** Return the org_id for a user, or null if they have none. */
function getUserOrgId(userId: string): string | null {
  const row = getDb()
    .query<{ org_id: string | null }, [string]>(
      `SELECT org_id FROM users WHERE id = ?`,
    )
    .get(userId);
  return row?.org_id ?? null;
}

/** Return the org_role for a user ("admin" | "member" | null). */
function getUserOrgRole(userId: string): string | null {
  const row = getDb()
    .query<{ org_role: string | null }, [string]>(
      `SELECT org_role FROM users WHERE id = ?`,
    )
    .get(userId);
  return row?.org_role ?? null;
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ruleSchema = z.object({
  match: z.string().min(1),
  kind: z.enum(["tool", "path", "shell"]),
  reason: z.string().optional(),
});

const rulesSchema = z.object({
  allow: z.array(ruleSchema).default([]),
  deny: z.array(ruleSchema).default([]),
  requireConfirm: z.array(ruleSchema).default([]),
});

const uploadSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(128),
  rules: rulesSchema,
});

const rollbackSchema = z.object({
  packId: z.string().min(1),
  toVersion: z.number().int().min(1),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const policy = new Hono();

// ---------------------------------------------------------------------------
// POST /policy/upload
// ---------------------------------------------------------------------------

policy.post("/policy/upload", authMiddleware, async (c) => {
  const user = c.get("user");

  const tierDeny = requireTier(c, user, "team");
  if (tierDeny) return tierDeny;

  const role = getUserOrgRole(user.id);
  if (role !== "admin") {
    return c.json({ error: "Only org admins can upload policy packs." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = uploadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  const { orgId, name, rules } = parsed.data;

  // Verify the caller belongs to the claimed org
  const callerOrgId = getUserOrgId(user.id);
  if (callerOrgId !== orgId) {
    return c.json({ error: "orgId does not match your organisation." }, 403);
  }

  const pack = createPolicyPack(orgId, name, rules as PolicyRules, user.email);

  return c.json({ packId: pack.id, version: pack.version }, 201);
});

// ---------------------------------------------------------------------------
// GET /policy/current
// ---------------------------------------------------------------------------

policy.get("/policy/current", authMiddleware, (c) => {
  const user = c.get("user");

  const tierDeny = requireTier(c, user, "team");
  if (tierDeny) return tierDeny;

  const orgId = getUserOrgId(user.id);
  if (!orgId) {
    return c.json({ error: "You are not a member of any organisation." }, 400);
  }

  const pack = getCurrentPolicyPack(orgId);
  if (!pack) {
    return c.json({ error: "No policy pack found for your organisation." }, 404);
  }

  // ETag for client-side 5-min cache
  const etag = `"${pack.id}-${pack.version}"`;
  const ifNoneMatch = c.req.header("if-none-match");
  if (ifNoneMatch === etag) {
    return new Response(null, { status: 304 });
  }

  let rules: PolicyRules;
  try {
    rules = JSON.parse(pack.rules_json) as PolicyRules;
  } catch {
    rules = { allow: [], deny: [], requireConfirm: [] };
  }

  return c.json(
    {
      packId: pack.id,
      orgId: pack.org_id,
      name: pack.name,
      version: pack.version,
      rules,
      author: pack.author,
      createdAt: pack.created_at,
    },
    200,
    { ETag: etag, "Cache-Control": "private, max-age=300" },
  );
});

// ---------------------------------------------------------------------------
// GET /policy/history
// ---------------------------------------------------------------------------

policy.get("/policy/history", authMiddleware, (c) => {
  const user = c.get("user");

  const tierDeny = requireTier(c, user, "team");
  if (tierDeny) return tierDeny;

  const orgId = getUserOrgId(user.id);
  if (!orgId) {
    return c.json({ error: "You are not a member of any organisation." }, 400);
  }

  const packs = getPolicyPackHistory(orgId);

  return c.json(
    packs.map((p) => ({
      packId: p.id,
      name: p.name,
      version: p.version,
      author: p.author,
      createdAt: p.created_at,
    })),
  );
});

// ---------------------------------------------------------------------------
// POST /policy/rollback
// ---------------------------------------------------------------------------

policy.post("/policy/rollback", authMiddleware, async (c) => {
  const user = c.get("user");

  const tierDeny = requireTier(c, user, "team");
  if (tierDeny) return tierDeny;

  const role = getUserOrgRole(user.id);
  if (role !== "admin") {
    return c.json({ error: "Only org admins can roll back policy packs." }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = rollbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid request body", details: parsed.error.flatten() }, 400);
  }

  const { packId, toVersion } = parsed.data;

  // Fetch the target pack
  const target = getPolicyPackById(packId);
  if (!target) {
    return c.json({ error: "Pack not found." }, 404);
  }

  // Verify the caller's org owns this pack
  const callerOrgId = getUserOrgId(user.id);
  if (target.org_id !== callerOrgId) {
    return c.json({ error: "Pack does not belong to your organisation." }, 403);
  }

  // Find the specific version
  const versionedPack = getPolicyPackByVersion(target.org_id, target.name, toVersion);
  if (!versionedPack) {
    return c.json({ error: `Version ${toVersion} not found for pack "${target.name}".` }, 404);
  }

  setCurrentPolicyPack(target.org_id, versionedPack.id);

  return c.json({ packId: versionedPack.id, version: versionedPack.version, rolledBackAt: new Date().toISOString() });
});

export default policy;
