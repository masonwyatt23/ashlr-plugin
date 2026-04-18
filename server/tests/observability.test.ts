/**
 * observability.test.ts — verifies that observability features are properly
 * isolated from production logic when env vars are absent.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import app from "../src/index.js";
import { _setDb, _resetDb } from "../src/db.js";

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      api_token TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      tier TEXT NOT NULL DEFAULT 'free'
    );
    CREATE TABLE IF NOT EXISTS api_tokens (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_used_at TEXT
    );
    CREATE TABLE IF NOT EXISTS stats_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      lifetime_calls INTEGER NOT NULL DEFAULT 0,
      lifetime_tokens_saved INTEGER NOT NULL DEFAULT 0,
      by_tool_json TEXT NOT NULL DEFAULT '{}',
      by_day_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      summarize_calls INTEGER NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0.0,
      PRIMARY KEY (user_id, date)
    );
    CREATE TABLE IF NOT EXISTS llm_calls (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      tool_name TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost REAL NOT NULL DEFAULT 0.0,
      cached INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      stripe_customer_id TEXT NOT NULL,
      tier TEXT NOT NULL DEFAULT 'pro',
      status TEXT NOT NULL DEFAULT 'active',
      seats INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      current_period_end TEXT,
      cancel_at TEXT
    );
    CREATE TABLE IF NOT EXISTS stripe_events (
      event_id TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );
    CREATE TABLE IF NOT EXISTS magic_tokens (
      token TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      expires_at TEXT NOT NULL,
      used_at TEXT
    );
  `);
  return db;
}

describe("Sentry no-op (SENTRY_DSN unset)", () => {
  beforeEach(() => {
    _setDb(makeTestDb());
    // Guarantee DSN is absent for this test suite
    delete process.env["SENTRY_DSN"];
  });

  afterEach(() => {
    _resetDb();
  });

  it("health check returns 200 without SENTRY_DSN", async () => {
    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("/healthz returns status ok and version without SENTRY_DSN", async () => {
    const res = await app.fetch(new Request("http://localhost/healthz"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; uptimeSeconds: number };
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeSeconds).toBe("number");
  });

  it("/readyz returns db ok when SQLite is reachable", async () => {
    const res = await app.fetch(new Request("http://localhost/readyz"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { db: string };
    expect(body.db).toBe("ok");
  });

  it("request ID is echoed back in response header", async () => {
    const res = await app.fetch(
      new Request("http://localhost/", {
        headers: { "x-request-id": "test-req-id-123" },
      }),
    );
    expect(res.headers.get("x-request-id")).toBe("test-req-id-123");
  });

  it("request ID is generated when absent", async () => {
    const res = await app.fetch(new Request("http://localhost/"));
    const id = res.headers.get("x-request-id");
    expect(typeof id).toBe("string");
    expect((id ?? "").length).toBeGreaterThan(0);
  });
});

describe("/metrics endpoint", () => {
  beforeEach(() => { _setDb(makeTestDb()); });
  afterEach(() => { _resetDb(); });

  it("returns 403 without credentials", async () => {
    delete process.env["METRICS_ALLOWED_IPS"];
    delete process.env["METRICS_USER"];
    delete process.env["METRICS_PASS"];
    const res = await app.fetch(new Request("http://localhost/metrics"));
    expect(res.status).toBe(403);
  });

  it("returns 200 with valid Basic Auth", async () => {
    process.env["METRICS_USER"] = "prometheus";
    process.env["METRICS_PASS"] = "secret";
    const creds = Buffer.from("prometheus:secret").toString("base64");
    const res = await app.fetch(
      new Request("http://localhost/metrics", {
        headers: { authorization: `Basic ${creds}` },
      }),
    );
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("ashlr_http_requests_total");
    delete process.env["METRICS_USER"];
    delete process.env["METRICS_PASS"];
  });
});
