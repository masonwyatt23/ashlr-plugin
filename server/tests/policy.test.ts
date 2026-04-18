/**
 * policy.test.ts — Tests for policy pack endpoints (Phase 4).
 *
 * Tests:
 *  1. POST /policy/upload  — admin team user creates a pack, gets packId + version
 *  2. POST /policy/upload  — non-admin gets 403
 *  3. POST /policy/upload  — free-tier user gets 403 (tier gate)
 *  4. POST /policy/upload  — invalid body gets 400
 *  5. GET  /policy/current — returns current pack after upload
 *  6. GET  /policy/current — 404 when no pack exists
 *  7. GET  /policy/history — returns version list
 *  8. POST /policy/rollback — admin rolls back to earlier version
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import app from "../src/index.js";
import { _setDb, _resetDb, createUser, setUserTier } from "../src/db.js";

process.env["TESTING"] = "1";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testDb: Database;

beforeEach(() => {
  testDb = new Database(":memory:");
  _setDb(testDb);
});

afterEach(() => {
  _resetDb();
  testDb.close();
});

function makeTeamAdmin(email = "admin@org.com") {
  const user = createUser(email, "tok-" + Math.random().toString(36).slice(2));
  setUserTier(user.id, "team");
  testDb.run(`UPDATE users SET org_id = 'org-1', org_role = 'admin' WHERE id = ?`, [user.id]);
  return user;
}

function makeTeamMember(email = "member@org.com") {
  const user = createUser(email, "tok-" + Math.random().toString(36).slice(2));
  setUserTier(user.id, "team");
  testDb.run(`UPDATE users SET org_id = 'org-1', org_role = 'member' WHERE id = ?`, [user.id]);
  return user;
}

function makeFreeUser(email = "free@example.com") {
  return createUser(email, "tok-" + Math.random().toString(36).slice(2));
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const sampleRules = {
  allow: [{ match: "mcp__ashlr-*", kind: "tool" }],
  deny:  [{ match: "Bash(rm *)", kind: "shell", reason: "no deletions" }],
  requireConfirm: [{ match: "/etc/*", kind: "path" }],
};

// ---------------------------------------------------------------------------
// 1. Upload — admin team user creates a pack
// ---------------------------------------------------------------------------

describe("POST /policy/upload", () => {
  it("admin creates a pack and receives packId + version", async () => {
    const admin = makeTeamAdmin();

    const res = await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { packId: string; version: number };
    expect(typeof body.packId).toBe("string");
    expect(body.version).toBe(1);
  });

  it("second upload increments version", async () => {
    const admin = makeTeamAdmin();

    await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
    });

    const res = await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { version: number };
    expect(body.version).toBe(2);
  });

  // 2. Non-admin gets 403
  it("non-admin member gets 403", async () => {
    const member = makeTeamMember();

    const res = await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(member.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
    });

    expect(res.status).toBe(403);
  });

  // 3. Free-tier tier gate
  it("free-tier user gets 403 from tier gate", async () => {
    const user = makeFreeUser();

    const res = await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(user.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
    });

    expect(res.status).toBe(403);
  });

  // 4. Invalid body
  it("invalid body returns 400", async () => {
    const admin = makeTeamAdmin();

    const res = await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ orgId: "org-1" /* missing name, rules */ }),
    });

    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 5-6. GET /policy/current
// ---------------------------------------------------------------------------

describe("GET /policy/current", () => {
  it("returns current pack after upload", async () => {
    const admin = makeTeamAdmin();

    await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
    });

    const res = await app.request("/policy/current", {
      headers: authHeaders(admin.api_token),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { version: number; rules: typeof sampleRules };
    expect(body.version).toBe(1);
    expect(body.rules.deny[0]?.reason).toBe("no deletions");
  });

  it("returns 304 when ETag matches", async () => {
    const admin = makeTeamAdmin();

    await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
    });

    const first = await app.request("/policy/current", {
      headers: authHeaders(admin.api_token),
    });
    const etag = first.headers.get("etag") ?? "";

    const cached = await app.request("/policy/current", {
      headers: { ...authHeaders(admin.api_token), "if-none-match": etag },
    });

    expect(cached.status).toBe(304);
  });

  it("returns 404 when no pack exists", async () => {
    const admin = makeTeamAdmin();

    const res = await app.request("/policy/current", {
      headers: authHeaders(admin.api_token),
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 7. GET /policy/history
// ---------------------------------------------------------------------------

describe("GET /policy/history", () => {
  it("lists versions in descending order", async () => {
    const admin = makeTeamAdmin();

    for (let i = 0; i < 3; i++) {
      await app.request("/policy/upload", {
        method: "POST",
        headers: authHeaders(admin.api_token),
        body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
      });
    }

    const res = await app.request("/policy/history", {
      headers: authHeaders(admin.api_token),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as Array<{ version: number }>;
    expect(body.length).toBe(3);
    expect(body[0]!.version).toBe(3);
    expect(body[2]!.version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 8. POST /policy/rollback
// ---------------------------------------------------------------------------

describe("POST /policy/rollback", () => {
  it("admin rolls back to version 1 and current reflects it", async () => {
    const admin = makeTeamAdmin();

    // Upload twice
    const up1 = await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: sampleRules }),
    });
    const { packId: packIdV1 } = await up1.json() as { packId: string };

    await app.request("/policy/upload", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ orgId: "org-1", name: "default", rules: { ...sampleRules, deny: [] } }),
    });

    // Rollback to v1
    const rb = await app.request("/policy/rollback", {
      method: "POST",
      headers: authHeaders(admin.api_token),
      body: JSON.stringify({ packId: packIdV1, toVersion: 1 }),
    });

    expect(rb.status).toBe(200);

    // Current should now be v1
    const cur = await app.request("/policy/current", {
      headers: authHeaders(admin.api_token),
    });
    const body = await cur.json() as { version: number };
    expect(body.version).toBe(1);
  });
});
