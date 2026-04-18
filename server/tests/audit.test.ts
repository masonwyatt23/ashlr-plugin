/**
 * audit.test.ts — Tests for audit log endpoints (Phase 4).
 *
 * Tests:
 *  1. POST /audit/event — team user ingests an event, gets eventId
 *  2. POST /audit/event — free-tier user gets 403 (tier gate)
 *  3. POST /audit/event — invalid body gets 400
 *  4. POST /audit/event — paths in args are fingerprinted (not stored raw)
 *  5. GET  /audit/events — admin queries events with filters
 *  6. GET  /audit/events — non-admin gets 403
 *  7. GET  /audit/export — admin gets NDJSON stream
 *  8. GET  /audit/events — user filter works correctly
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

function makeTeamAdmin(email = "audit-admin@org.com") {
  const user = createUser(email, "tok-" + Math.random().toString(36).slice(2));
  setUserTier(user.id, "team");
  testDb.run(`UPDATE users SET org_id = 'org-audit', org_role = 'admin' WHERE id = ?`, [user.id]);
  return user;
}

function makeTeamMember(email = "audit-member@org.com") {
  const user = createUser(email, "tok-" + Math.random().toString(36).slice(2));
  setUserTier(user.id, "team");
  testDb.run(`UPDATE users SET org_id = 'org-audit', org_role = 'member' WHERE id = ?`, [user.id]);
  return user;
}

function makeFreeUser(email = "free-audit@example.com") {
  return createUser(email, "tok-" + Math.random().toString(36).slice(2));
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function ingestEvent(token: string, overrides: Record<string, unknown> = {}) {
  return app.request("/audit/event", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      tool: "Edit",
      args: { file_path: "/home/user/project/src/index.ts", content: "x" },
      userId: "u1",
      cwd: "/home/user/project",
      gitCommit: "abc1234",
      ...overrides,
    }),
  });
}

// ---------------------------------------------------------------------------
// 1. Ingest — team user
// ---------------------------------------------------------------------------

describe("POST /audit/event", () => {
  it("team member can ingest an event and receives eventId", async () => {
    const member = makeTeamMember();

    const res = await ingestEvent(member.api_token);

    expect(res.status).toBe(201);
    const body = await res.json() as { eventId: string; committedAt: string };
    expect(typeof body.eventId).toBe("string");
    expect(typeof body.committedAt).toBe("string");
  });

  // 2. Tier gate
  it("free-tier user gets 403", async () => {
    const user = makeFreeUser();
    const res = await ingestEvent(user.api_token);
    expect(res.status).toBe(403);
  });

  // 3. Invalid body
  it("invalid body (missing tool) gets 400", async () => {
    const member = makeTeamMember();

    const res = await app.request("/audit/event", {
      method: "POST",
      headers: authHeaders(member.api_token),
      body: JSON.stringify({ args: {}, userId: "u1" }),
    });

    expect(res.status).toBe(400);
  });

  // 4. Path redaction
  it("path args are fingerprinted — raw path not stored", async () => {
    const member = makeTeamMember();
    const rawPath = "/home/user/secret/config.ts";

    await ingestEvent(member.api_token, {
      args: { file_path: rawPath },
    });

    const row = testDb.query<{ args_json: string }, []>(
      `SELECT args_json FROM audit_events LIMIT 1`,
    ).get();
    expect(row).not.toBeNull();
    const args = JSON.parse(row!.args_json) as Record<string, string>;
    // Should start with "fp:" not contain the raw path
    expect(args["file_path"]).toMatch(/^fp:/);
    expect(args["file_path"]).not.toContain("secret");
  });
});

// ---------------------------------------------------------------------------
// 5-6. GET /audit/events
// ---------------------------------------------------------------------------

describe("GET /audit/events", () => {
  it("admin can query events", async () => {
    const admin = makeTeamAdmin();
    const member = makeTeamMember();

    // Ingest 3 events
    for (let i = 0; i < 3; i++) {
      await ingestEvent(member.api_token, { tool: "Edit" });
    }

    const res = await app.request(`/audit/events?orgId=org-audit`, {
      headers: authHeaders(admin.api_token),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { events: unknown[]; count: number };
    expect(body.count).toBe(3);
  });

  it("admin can filter by tool", async () => {
    const admin = makeTeamAdmin();
    const member = makeTeamMember();

    await ingestEvent(member.api_token, { tool: "Edit" });
    await ingestEvent(member.api_token, { tool: "Bash" });
    await ingestEvent(member.api_token, { tool: "Write" });

    const res = await app.request(`/audit/events?orgId=org-audit&tool=Bash`, {
      headers: authHeaders(admin.api_token),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { events: Array<{ tool: string }>; count: number };
    expect(body.count).toBe(1);
    expect(body.events[0]!.tool).toBe("Bash");
  });

  // 6. Non-admin blocked
  it("non-admin member gets 403", async () => {
    const member = makeTeamMember();

    const res = await app.request(`/audit/events?orgId=org-audit`, {
      headers: authHeaders(member.api_token),
    });

    expect(res.status).toBe(403);
  });

  // 8. User filter
  it("user filter scopes events to a single user_id", async () => {
    const admin = makeTeamAdmin();
    const m1 = makeTeamMember("m1@org.com");
    const m2 = makeTeamMember("m2@org.com");

    await ingestEvent(m1.api_token);
    await ingestEvent(m2.api_token);

    const res = await app.request(`/audit/events?orgId=org-audit&user=${m1.id}`, {
      headers: authHeaders(admin.api_token),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { events: Array<{ user_id: string }>; count: number };
    expect(body.count).toBe(1);
    expect(body.events[0]!.user_id).toBe(m1.id);
  });
});

// ---------------------------------------------------------------------------
// 7. GET /audit/export
// ---------------------------------------------------------------------------

describe("GET /audit/export", () => {
  it("admin gets NDJSON with all events", async () => {
    const admin = makeTeamAdmin();
    const member = makeTeamMember();

    await ingestEvent(member.api_token);
    await ingestEvent(member.api_token);

    const res = await app.request("/audit/export", {
      headers: authHeaders(admin.api_token),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("ndjson");

    const text = await res.text();
    const lines = text.trim().split("\n").filter(Boolean);
    expect(lines.length).toBe(2);

    // Each line must be valid JSON with an id field
    for (const line of lines) {
      const obj = JSON.parse(line) as { id: string };
      expect(typeof obj.id).toBe("string");
    }
  });
});
