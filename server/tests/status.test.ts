/**
 * status.test.ts — Tests for /status/* endpoints.
 *
 * 11 tests covering:
 *   1.  GET /status/current returns operational shape when all checks are ok
 *   2.  GET /status/current returns partial_outage when one component is down
 *   3.  GET /status/current returns major_outage when all components are down
 *   4.  GET /status/current returns unknown when no checks exist
 *   5.  GET /status/history?days=N returns correct shape
 *   6.  Rate limit: 31st request in 1 min returns 429
 *   7.  POST /status/subscribe returns { sent: true } for valid email
 *   8.  POST /status/subscribe returns 400 for invalid email
 *   9.  GET  /status/confirm?token= confirms subscriber
 *   10. POST /status/incident is forbidden without admin token
 *   11. POST /status/incident creates incident with admin token; PATCH appends update
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import app from "../src/index.js";
import {
  _setDb,
  _resetDb,
  createUser,
  insertHealthCheck,
} from "../src/db.js";
import { _clearBuckets, _clearSlidingWindows } from "../src/lib/ratelimit.js";
import { getDb } from "../src/db.js";

// ---------------------------------------------------------------------------
// Test DB bootstrap — mirrors the full migration but in-memory
// ---------------------------------------------------------------------------

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  // Let _setDb run migrations via runMigrations
  return db;
}

function setupAdmin(): { token: string } {
  const token = "admin-token-00000000000000000000000000000000";
  const user  = createUser("admin@example.com", token);
  getDb().run(
    `UPDATE users SET org_id = 'org-1', org_role = 'admin' WHERE id = ?`,
    [user.id],
  );
  return { token };
}

async function get(path: string, token?: string): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );
}

async function post(path: string, body: unknown, token?: string): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

async function patch(path: string, body: unknown, token?: string): Promise<Response> {
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /status/current", () => {
  beforeEach(() => {
    process.env["TESTING"] = "1";
    _setDb(makeTestDb());
    _clearBuckets();
    _clearSlidingWindows();
  });
  afterEach(() => { _resetDb(); delete process.env["TESTING"]; });

  // 1. All ok → operational
  it("returns operational when all checks are ok", async () => {
    insertHealthCheck("api", "ok", 42, null);
    insertHealthCheck("plugin-registry", "ok", 30, null);

    const res = await get("/status/current");
    expect(res.status).toBe(200);
    const body = await res.json() as { overall: string; components: unknown[] };
    expect(body.overall).toBe("operational");
    expect(body.components).toHaveLength(2);
  });

  // 2. One down → partial_outage
  it("returns partial_outage when one component is down", async () => {
    insertHealthCheck("api", "ok", 42, null);
    insertHealthCheck("plugin-registry", "down", null, "connection refused");

    const res = await get("/status/current");
    const body = await res.json() as { overall: string };
    expect(body.overall).toBe("partial_outage");
  });

  // 3. All down → major_outage
  it("returns major_outage when all components are down", async () => {
    insertHealthCheck("api", "down", null, "timeout");
    insertHealthCheck("plugin-registry", "down", null, "timeout");

    const res = await get("/status/current");
    const body = await res.json() as { overall: string };
    expect(body.overall).toBe("major_outage");
  });

  // 4. No checks → unknown
  it("returns unknown when no health checks exist", async () => {
    const res = await get("/status/current");
    const body = await res.json() as { overall: string };
    expect(body.overall).toBe("unknown");
  });
});

describe("GET /status/history", () => {
  beforeEach(() => {
    _setDb(makeTestDb());
    _clearBuckets();
    _clearSlidingWindows();
  });
  afterEach(() => { _resetDb(); });

  // 5. history shape
  it("returns correct shape with days param", async () => {
    insertHealthCheck("api", "ok", 20, null);
    const res = await get("/status/history?days=7");
    expect(res.status).toBe(200);
    const body = await res.json() as { days: number; history: Record<string, unknown> };
    expect(body.days).toBe(7);
    expect(typeof body.history).toBe("object");
    expect(Array.isArray(body.history["api"])).toBe(true);
    const entry = (body.history["api"] as Array<{ date: string; uptimePct: number }>)[0];
    expect(entry).toHaveProperty("date");
    expect(entry).toHaveProperty("uptimePct");
  });
});

describe("Rate limit on /status/current", () => {
  beforeEach(() => {
    _setDb(makeTestDb());
    _clearBuckets();
    _clearSlidingWindows();
  });
  afterEach(() => { _resetDb(); });

  // 6. 31st request → 429
  it("returns 429 on 31st request per minute from same IP", async () => {
    // First 30 should be allowed
    for (let i = 0; i < 30; i++) {
      const res = await get("/status/current");
      expect(res.status).toBe(200);
    }
    // 31st is rate-limited
    const res = await get("/status/current");
    expect(res.status).toBe(429);
  });
});

describe("POST /status/subscribe", () => {
  beforeEach(() => {
    process.env["TESTING"] = "1";
    _setDb(makeTestDb());
    _clearBuckets();
    _clearSlidingWindows();
  });
  afterEach(() => { _resetDb(); delete process.env["TESTING"]; });

  // 7. Valid subscribe
  it("returns { sent: true } for a valid email", async () => {
    const res = await post("/status/subscribe", { email: "sub@example.com" });
    expect(res.status).toBe(200);
    const body = await res.json() as { sent: boolean };
    expect(body.sent).toBe(true);
  });

  // 8. Invalid email
  it("returns 400 for an invalid email", async () => {
    const res = await post("/status/subscribe", { email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  // 9. Confirm flow
  it("GET /status/confirm confirms a subscriber", async () => {
    const email = "confirm@example.com";
    await post("/status/subscribe", { email });

    const row = getDb()
      .query<{ confirm_token: string }, [string]>(
        `SELECT confirm_token FROM status_subscribers WHERE email = ?`,
      )
      .get(email);
    expect(row).not.toBeNull();

    const res = await get(`/status/confirm?token=${row!.confirm_token}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { confirmed: boolean };
    expect(body.confirmed).toBe(true);

    const confirmed = getDb()
      .query<{ confirmed_at: string | null }, [string]>(
        `SELECT confirmed_at FROM status_subscribers WHERE email = ?`,
      )
      .get(email);
    expect(confirmed!.confirmed_at).not.toBeNull();
  });
});

describe("Incident CRUD (admin gating)", () => {
  beforeEach(() => {
    _setDb(makeTestDb());
    _clearBuckets();
    _clearSlidingWindows();
  });
  afterEach(() => { _resetDb(); });

  // 10. Forbidden without admin token
  it("POST /status/incident returns 403 without admin token", async () => {
    const res = await post("/status/incident", {
      title: "Test incident",
      status: "investigating",
      affectedComponents: ["api"],
      body: "Looking into it.",
    });
    expect(res.status).toBe(403);
  });

  // 11. Create + update with admin token
  it("creates an incident and appends an update with admin token", async () => {
    const { token } = setupAdmin();

    const createRes = await post(
      "/status/incident",
      {
        title: "API latency spike",
        status: "investigating",
        affectedComponents: ["api"],
        body: "Elevated latency detected.",
      },
      token,
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json() as { id: string; status: string };
    expect(created.status).toBe("investigating");
    expect(typeof created.id).toBe("string");

    const patchRes = await patch(
      `/status/incident/${created.id}`,
      { status: "resolved", body: "Latency returned to normal." },
      token,
    );
    expect(patchRes.status).toBe(200);
    const updated = await patchRes.json() as { status: string };
    expect(updated.status).toBe("resolved");

    // Verify incident is now resolved in DB
    const detail = await get(`/status/incident/${created.id}`);
    const detailBody = await detail.json() as { status: string; resolvedAt: string | null };
    expect(detailBody.status).toBe("resolved");
    expect(detailBody.resolvedAt).not.toBeNull();
  });
});
