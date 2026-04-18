/**
 * db.ts — SQLite schema + helpers (Phase 1).
 *
 * Abstraction goal: all SQL lives here. To swap to Postgres in Phase 3,
 * replace this file only — callers depend on the exported function signatures,
 * not on bun:sqlite directly.
 */

import { Database } from "bun:sqlite";
import { join } from "path";

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

const DB_PATH = process.env["ASHLR_DB_PATH"] ?? join(import.meta.dir, "../../ashlr.db");

let _db: Database | null = null;

export function getDb(): Database {
  if (_db) return _db;
  _db = new Database(DB_PATH, { create: true });
  _db.exec("PRAGMA journal_mode = WAL;");
  _db.exec("PRAGMA foreign_keys = ON;");
  runMigrations(_db);
  addTierColumnIfMissing(_db);
  return _db;
}

/** Inject a test database — call before getDb() in tests. Runs migrations immediately. */
export function _setDb(db: Database): void {
  _db = db;
  runMigrations(db);
  addTierColumnIfMissing(db);
}

/** Reset singleton — for tests only. */
export function _resetDb(): void {
  _db = null;
}

// ---------------------------------------------------------------------------
// Migrations (CREATE TABLE IF NOT EXISTS — idempotent on every boot)
// ---------------------------------------------------------------------------

function addTierColumnIfMissing(db: Database): void {
  // SQLite has no ALTER TABLE ADD COLUMN IF NOT EXISTS — inspect pragma instead.
  const cols = db.query<{ name: string }, []>(`PRAGMA table_info(users)`).all();
  if (!cols.some((c) => c.name === "tier")) {
    db.exec(`ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free'`);
  }
  if (!cols.some((c) => c.name === "org_id")) {
    db.exec(`ALTER TABLE users ADD COLUMN org_id TEXT`);
  }
  if (!cols.some((c) => c.name === "org_role")) {
    db.exec(`ALTER TABLE users ADD COLUMN org_role TEXT`);
  }
}

function runMigrations(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      email      TEXT UNIQUE NOT NULL,
      api_token  TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      token        TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      last_used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS stats_uploads (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      uploaded_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      lifetime_calls       INTEGER NOT NULL DEFAULT 0,
      lifetime_tokens_saved INTEGER NOT NULL DEFAULT 0,
      by_tool_json         TEXT NOT NULL DEFAULT '{}',
      by_day_json          TEXT NOT NULL DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_stats_uploads_user_id ON stats_uploads(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_tokens_user_id    ON api_tokens(user_id);

    CREATE TABLE IF NOT EXISTS daily_usage (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       TEXT NOT NULL,  -- ISO date "YYYY-MM-DD"
      summarize_calls INTEGER NOT NULL DEFAULT 0,
      total_cost REAL    NOT NULL DEFAULT 0.0,
      PRIMARY KEY (user_id, date)
    );

    CREATE TABLE IF NOT EXISTS llm_calls (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      tool_name    TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost         REAL    NOT NULL DEFAULT 0.0,
      cached       INTEGER NOT NULL DEFAULT 0  -- 0=false, 1=true (SQLite boolean)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_usage_user_date ON daily_usage(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_llm_calls_user_at     ON llm_calls(user_id, at);

    -- Phase 3: Stripe billing tables
    -- users.tier column added below via addTierColumnIfMissing() (ALTER TABLE is not idempotent in SQLite).

    CREATE TABLE IF NOT EXISTS subscriptions (
      id                     TEXT PRIMARY KEY,
      user_id                TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      stripe_subscription_id TEXT NOT NULL UNIQUE,
      stripe_customer_id     TEXT NOT NULL,
      tier                   TEXT NOT NULL DEFAULT 'pro',
      status                 TEXT NOT NULL DEFAULT 'active',
      seats                  INTEGER NOT NULL DEFAULT 1,
      created_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      current_period_end     TEXT,
      cancel_at              TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub_id ON subscriptions(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_cust_id ON subscriptions(stripe_customer_id);

    CREATE TABLE IF NOT EXISTS stripe_events (
      event_id     TEXT PRIMARY KEY,
      processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE TABLE IF NOT EXISTS stripe_products (
      key        TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      price_id   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    -- Phase 4: Magic-link auth
    CREATE TABLE IF NOT EXISTS magic_tokens (
      token      TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      expires_at TEXT NOT NULL,
      used_at    TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_magic_tokens_email ON magic_tokens(email);

    -- Phase 3 (genome): team CRDT genome sync
    CREATE TABLE IF NOT EXISTS genomes (
      id         TEXT PRIMARY KEY,
      org_id     TEXT NOT NULL,
      repo_url   TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      server_seq INTEGER NOT NULL DEFAULT 0,
      UNIQUE(org_id, repo_url)
    );

    CREATE TABLE IF NOT EXISTS genome_sections (
      id            TEXT PRIMARY KEY,
      genome_id     TEXT NOT NULL REFERENCES genomes(id) ON DELETE CASCADE,
      path          TEXT NOT NULL,
      content       TEXT NOT NULL DEFAULT '',
      vclock_json   TEXT NOT NULL DEFAULT '{}',
      conflict_flag INTEGER NOT NULL DEFAULT 0,
      server_seq    INTEGER NOT NULL DEFAULT 0,
      updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE(genome_id, path)
    );

    CREATE INDEX IF NOT EXISTS idx_genome_sections_genome_seq ON genome_sections(genome_id, server_seq);

    CREATE TABLE IF NOT EXISTS genome_conflicts (
      id           TEXT PRIMARY KEY,
      genome_id    TEXT NOT NULL REFERENCES genomes(id) ON DELETE CASCADE,
      path         TEXT NOT NULL,
      variants_json TEXT NOT NULL DEFAULT '[]',
      detected_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_genome_conflicts_genome ON genome_conflicts(genome_id);

    CREATE TABLE IF NOT EXISTS genome_push_log (
      id         TEXT PRIMARY KEY,
      genome_id  TEXT NOT NULL,
      client_id  TEXT NOT NULL,
      path       TEXT NOT NULL,
      at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_genome_push_log_genome ON genome_push_log(genome_id, at);

    -- Phase 4: Policy packs
    CREATE TABLE IF NOT EXISTS policy_packs (
      id         TEXT PRIMARY KEY,
      org_id     TEXT NOT NULL,
      name       TEXT NOT NULL,
      version    INTEGER NOT NULL DEFAULT 1,
      rules_json TEXT NOT NULL DEFAULT '{"allow":[],"deny":[],"requireConfirm":[]}',
      author     TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
      UNIQUE (org_id, name, version)
    );

    CREATE TABLE IF NOT EXISTS policy_current (
      org_id  TEXT PRIMARY KEY,
      pack_id TEXT NOT NULL,
      set_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_policy_packs_org ON policy_packs(org_id);

    -- Phase 4: Audit log (append-only; no UPDATE/DELETE except admin purge)
    CREATE TABLE IF NOT EXISTS audit_events (
      id              TEXT PRIMARY KEY,
      org_id          TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      tool            TEXT NOT NULL,
      args_json       TEXT NOT NULL DEFAULT '{}',
      cwd_fingerprint TEXT NOT NULL DEFAULT '',
      git_commit      TEXT NOT NULL DEFAULT '',
      at              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_audit_events_org_at   ON audit_events(org_id, at);
    CREATE INDEX IF NOT EXISTS idx_audit_events_user_at  ON audit_events(user_id, at);
  `);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  email: string;
  api_token: string;
  created_at: string;
  tier: string;     // "free" | "pro" | "team"
  org_id: string | null;
  org_role: string | null; // "admin" | "member" | null
}

// ---------------------------------------------------------------------------
// Billing types
// ---------------------------------------------------------------------------

export interface Subscription {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  tier: string;
  status: string;
  seats: number;
  created_at: string;
  current_period_end: string | null;
  cancel_at: string | null;
}

export interface StripeProduct {
  key: string;
  product_id: string;
  price_id: string;
  created_at: string;
}

export interface StatsUpload {
  id: string;
  user_id: string;
  uploaded_at: string;
  lifetime_calls: number;
  lifetime_tokens_saved: number;
  by_tool_json: string;
  by_day_json: string;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyUsage {
  user_id: string;
  date: string;
  summarize_calls: number;
  total_cost: number;
}

export interface LlmCall {
  id: string;
  user_id: string;
  at: string;
  tool_name: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  cached: number; // 0 or 1
}

// ---------------------------------------------------------------------------
// User helpers
// ---------------------------------------------------------------------------

export function createUser(email: string, apiToken: string): User {
  const db = getDb();
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO users (id, email, api_token) VALUES (?, ?, ?)`,
    [id, email, apiToken],
  );
  // Mirror into api_tokens table for lookup
  db.run(
    `INSERT INTO api_tokens (token, user_id) VALUES (?, ?)`,
    [apiToken, id],
  );
  return getUserById(id)!;
}

export function getUserById(id: string): User | null {
  const db = getDb();
  return db.query<User, [string]>(
    `SELECT id, email, api_token, created_at, tier, org_id, org_role FROM users WHERE id = ?`,
  ).get(id);
}

export function getUserByToken(token: string): User | null {
  const db = getDb();
  const row = db.query<{ user_id: string }, [string]>(
    `SELECT user_id FROM api_tokens WHERE token = ?`,
  ).get(token);
  if (!row) return null;
  // Touch last_used_at
  db.run(
    `UPDATE api_tokens SET last_used_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE token = ?`,
    [token],
  );
  return getUserById(row.user_id);
}

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------

export function upsertStatsUpload(
  userId: string,
  lifetimeCalls: number,
  lifetimeTokensSaved: number,
  byToolJson: string,
  byDayJson: string,
): StatsUpload {
  const db = getDb();
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO stats_uploads
       (id, user_id, lifetime_calls, lifetime_tokens_saved, by_tool_json, by_day_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, lifetimeCalls, lifetimeTokensSaved, byToolJson, byDayJson],
  );
  return getLatestUpload(userId)!;
}

export function getLatestUpload(userId: string): StatsUpload | null {
  const db = getDb();
  return db.query<StatsUpload, [string]>(
    `SELECT * FROM stats_uploads WHERE user_id = ? ORDER BY uploaded_at DESC LIMIT 1`,
  ).get(userId);
}

/**
 * Aggregate all uploads for a user: sum calls, sum tokens, merge by_tool and by_day
 * across every upload row (cross-device aggregate).
 */
export function aggregateUploads(userId: string): {
  lifetime_calls: number;
  lifetime_tokens_saved: number;
  by_tool: Record<string, number>;
  by_day: Record<string, number>;
} {
  const db = getDb();
  const rows = db.query<StatsUpload, [string]>(
    `SELECT * FROM stats_uploads WHERE user_id = ? ORDER BY uploaded_at ASC`,
  ).all(userId);

  let calls = 0;
  let tokens = 0;
  const byTool: Record<string, number> = {};
  const byDay: Record<string, number> = {};

  for (const row of rows) {
    // We keep the max of lifetime fields (they're cumulative per device)
    calls  = Math.max(calls, row.lifetime_calls);
    tokens = Math.max(tokens, row.lifetime_tokens_saved);

    try {
      const tool = JSON.parse(row.by_tool_json) as Record<string, number>;
      for (const [k, v] of Object.entries(tool)) {
        byTool[k] = (byTool[k] ?? 0) + v;
      }
    } catch { /* malformed json — skip */ }

    try {
      const day = JSON.parse(row.by_day_json) as Record<string, number>;
      for (const [k, v] of Object.entries(day)) {
        byDay[k] = (byDay[k] ?? 0) + v;
      }
    } catch { /* malformed json — skip */ }
  }

  return { lifetime_calls: calls, lifetime_tokens_saved: tokens, by_tool: byTool, by_day: byDay };
}

// ---------------------------------------------------------------------------
// Daily usage + cap helpers (Phase 2 — LLM summarizer)
// ---------------------------------------------------------------------------

const DAILY_CAP_CALLS = 1000;
const DAILY_CAP_COST  = 1.00; // $1.00 USD

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function bumpDailyUsage(userId: string, cost: number): void {
  const db   = getDb();
  const date = todayUTC();
  db.run(
    `INSERT INTO daily_usage (user_id, date, summarize_calls, total_cost)
     VALUES (?, ?, 1, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET
       summarize_calls = summarize_calls + 1,
       total_cost      = total_cost + excluded.total_cost`,
    [userId, date, cost],
  );
}

export function checkDailyCap(userId: string): { allowed: boolean; remaining: { calls: number; cost: number } } {
  const db   = getDb();
  const date = todayUTC();
  const row  = db.query<DailyUsage, [string, string]>(
    `SELECT * FROM daily_usage WHERE user_id = ? AND date = ?`,
  ).get(userId, date);

  const calls     = row?.summarize_calls ?? 0;
  const cost      = row?.total_cost      ?? 0;
  const callsLeft = DAILY_CAP_CALLS - calls;
  const costLeft  = DAILY_CAP_COST  - cost;
  const allowed   = callsLeft > 0 && costLeft > 0;

  return { allowed, remaining: { calls: callsLeft, cost: Math.max(0, costLeft) } };
}

export function getDailyUsage(userId: string, date?: string): DailyUsage | null {
  const db  = getDb();
  const day = date ?? todayUTC();
  return db.query<DailyUsage, [string, string]>(
    `SELECT * FROM daily_usage WHERE user_id = ? AND date = ?`,
  ).get(userId, day);
}

// ---------------------------------------------------------------------------
// LLM call log (Phase 2)
// ---------------------------------------------------------------------------

export interface LogLlmCallParams {
  userId: string;
  toolName: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  cached: boolean;
}

export function logLlmCall(params: LogLlmCallParams): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO llm_calls (id, user_id, tool_name, input_tokens, output_tokens, cost, cached)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      params.userId,
      params.toolName,
      params.inputTokens,
      params.outputTokens,
      params.cost,
      params.cached ? 1 : 0,
    ],
  );
}

export function getLlmCallsForUser(userId: string, limit = 100): LlmCall[] {
  const db = getDb();
  return db.query<LlmCall, [string, number]>(
    `SELECT * FROM llm_calls WHERE user_id = ? ORDER BY at DESC LIMIT ?`,
  ).all(userId, limit);
}

// ---------------------------------------------------------------------------
// Billing helpers (Phase 3)
// ---------------------------------------------------------------------------

export function setUserTier(userId: string, tier: string): void {
  getDb().run(`UPDATE users SET tier = ? WHERE id = ?`, [tier, userId]);
}

export function getSubscriptionByUserId(userId: string): Subscription | null {
  return getDb()
    .query<Subscription, [string]>(
      `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(userId);
}

export function getSubscriptionByStripeSubId(stripeSubId: string): Subscription | null {
  return getDb()
    .query<Subscription, [string]>(
      `SELECT * FROM subscriptions WHERE stripe_subscription_id = ?`,
    )
    .get(stripeSubId);
}

export function getSubscriptionByStripeCustomerId(customerId: string): Subscription | null {
  return getDb()
    .query<Subscription, [string]>(
      `SELECT * FROM subscriptions WHERE stripe_customer_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(customerId);
}

export function upsertSubscription(params: {
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  tier: string;
  status: string;
  seats: number;
  currentPeriodEnd: string | null;
  cancelAt: string | null;
}): void {
  const db = getDb();
  const existing = getSubscriptionByStripeSubId(params.stripeSubscriptionId);
  if (existing) {
    db.run(
      `UPDATE subscriptions SET
         tier = ?, status = ?, seats = ?, current_period_end = ?, cancel_at = ?
       WHERE stripe_subscription_id = ?`,
      [
        params.tier,
        params.status,
        params.seats,
        params.currentPeriodEnd,
        params.cancelAt,
        params.stripeSubscriptionId,
      ],
    );
  } else {
    db.run(
      `INSERT INTO subscriptions
         (id, user_id, stripe_subscription_id, stripe_customer_id, tier, status, seats, current_period_end, cancel_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        crypto.randomUUID(),
        params.userId,
        params.stripeSubscriptionId,
        params.stripeCustomerId,
        params.tier,
        params.status,
        params.seats,
        params.currentPeriodEnd,
        params.cancelAt,
      ],
    );
  }
}

export function isStripeEventProcessed(eventId: string): boolean {
  const row = getDb()
    .query<{ event_id: string }, [string]>(
      `SELECT event_id FROM stripe_events WHERE event_id = ?`,
    )
    .get(eventId);
  return row !== null;
}

export function markStripeEventProcessed(eventId: string): void {
  getDb().run(
    `INSERT OR IGNORE INTO stripe_events (event_id) VALUES (?)`,
    [eventId],
  );
}

export function getStripeProduct(key: string): StripeProduct | null {
  return getDb()
    .query<StripeProduct, [string]>(
      `SELECT * FROM stripe_products WHERE key = ?`,
    )
    .get(key);
}

export function upsertStripeProduct(key: string, productId: string, priceId: string): void {
  getDb().run(
    `INSERT INTO stripe_products (key, product_id, price_id)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET product_id = excluded.product_id, price_id = excluded.price_id`,
    [key, productId, priceId],
  );
}

export function getUserByStripeCustomerId(customerId: string): User | null {
  const sub = getSubscriptionByStripeCustomerId(customerId);
  if (!sub) return null;
  return getUserById(sub.user_id);
}

// ---------------------------------------------------------------------------
// Magic-link auth helpers (Phase 4)
// ---------------------------------------------------------------------------

export interface MagicToken {
  token: string;
  email: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export function createMagicToken(email: string, token: string, expiresAt: string): void {
  getDb().run(
    `INSERT INTO magic_tokens (token, email, expires_at) VALUES (?, ?, ?)`,
    [token, email, expiresAt],
  );
}

export function getMagicToken(token: string): MagicToken | null {
  return getDb()
    .query<MagicToken, [string]>(`SELECT * FROM magic_tokens WHERE token = ?`)
    .get(token);
}

export function markMagicTokenUsed(token: string): void {
  getDb().run(
    `UPDATE magic_tokens SET used_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE token = ?`,
    [token],
  );
}

/** Count magic tokens created for an email within the last windowMs milliseconds. */
export function countRecentMagicTokens(email: string, windowMs: number): number {
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = getDb()
    .query<{ n: number }, [string, string]>(
      `SELECT COUNT(*) AS n FROM magic_tokens WHERE email = ? AND created_at >= ?`,
    )
    .get(email, since);
  return row?.n ?? 0;
}

/** Create a user if one does not exist for this email. Returns the user either way. */
export function getOrCreateUserByEmail(email: string): User {
  const db = getDb();
  const existing = db.query<User, [string]>(
    `SELECT id, email, api_token, created_at, tier, org_id, org_role FROM users WHERE email = ?`,
  ).get(email);
  if (existing) return existing;
  // Placeholder api_token — will be replaced when they verify the magic link.
  const placeholder = crypto.randomUUID();
  return createUser(email, placeholder);
}

/** Issue a fresh API token for a user (inserts into api_tokens, returns the token string). */
export function issueApiToken(userId: string): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  getDb().run(
    `INSERT INTO api_tokens (token, user_id) VALUES (?, ?)`,
    [token, userId],
  );
  return token;
}

// ---------------------------------------------------------------------------
// Genome helpers (Phase 3 — team CRDT genome sync)
// ---------------------------------------------------------------------------

export interface Genome {
  id: string;
  org_id: string;
  repo_url: string;
  created_at: string;
  server_seq: number;
}

export interface GenomeSection {
  id: string;
  genome_id: string;
  path: string;
  content: string;
  vclock_json: string;
  conflict_flag: number;
  server_seq: number;
  updated_at: string;
}

export interface GenomeConflict {
  id: string;
  genome_id: string;
  path: string;
  variants_json: string;
  detected_at: string;
}

/** Create or return an existing genome for (orgId, repoUrl). Returns {genome, created}. */
export function upsertGenome(orgId: string, repoUrl: string): { genome: Genome; created: boolean } {
  const db = getDb();
  const existing = db.query<Genome, [string, string]>(
    `SELECT id, org_id, repo_url, created_at, server_seq FROM genomes WHERE org_id = ? AND repo_url = ?`,
  ).get(orgId, repoUrl);
  if (existing) return { genome: existing, created: false };

  const id = crypto.randomUUID();
  db.run(`INSERT INTO genomes (id, org_id, repo_url) VALUES (?, ?, ?)`, [id, orgId, repoUrl]);
  return { genome: db.query<Genome, [string]>(`SELECT * FROM genomes WHERE id = ?`).get(id)!, created: true };
}

export function getGenomeById(id: string): Genome | null {
  return getDb().query<Genome, [string]>(`SELECT * FROM genomes WHERE id = ?`).get(id);
}

export function deleteGenome(id: string): void {
  getDb().run(`DELETE FROM genomes WHERE id = ?`, [id]);
}

/** Atomically bump server_seq on genome and return the new value. */
export function bumpGenomeSeq(genomeId: string): number {
  const db = getDb();
  db.run(`UPDATE genomes SET server_seq = server_seq + 1 WHERE id = ?`, [genomeId]);
  const row = db.query<{ server_seq: number }, [string]>(
    `SELECT server_seq FROM genomes WHERE id = ?`,
  ).get(genomeId);
  return row!.server_seq;
}

/** Upsert a genome section. Returns {section, wasConflict}. */
export function upsertGenomeSection(
  genomeId: string,
  path: string,
  content: string,
  vclockJson: string,
  conflictFlag: boolean,
  serverSeq: number,
): GenomeSection {
  const db = getDb();
  const existing = db.query<GenomeSection, [string, string]>(
    `SELECT * FROM genome_sections WHERE genome_id = ? AND path = ?`,
  ).get(genomeId, path);

  if (existing) {
    db.run(
      `UPDATE genome_sections SET content = ?, vclock_json = ?, conflict_flag = ?, server_seq = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
       WHERE genome_id = ? AND path = ?`,
      [content, vclockJson, conflictFlag ? 1 : 0, serverSeq, genomeId, path],
    );
  } else {
    const id = crypto.randomUUID();
    db.run(
      `INSERT INTO genome_sections (id, genome_id, path, content, vclock_json, conflict_flag, server_seq)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, genomeId, path, content, vclockJson, conflictFlag ? 1 : 0, serverSeq],
    );
  }

  return db.query<GenomeSection, [string, string]>(
    `SELECT * FROM genome_sections WHERE genome_id = ? AND path = ?`,
  ).get(genomeId, path)!;
}

export function getGenomeSectionsSince(genomeId: string, since: number): GenomeSection[] {
  return getDb().query<GenomeSection, [string, number]>(
    `SELECT * FROM genome_sections WHERE genome_id = ? AND server_seq > ? ORDER BY server_seq ASC`,
  ).all(genomeId, since);
}

export function getGenomeSectionByPath(genomeId: string, path: string): GenomeSection | null {
  return getDb().query<GenomeSection, [string, string]>(
    `SELECT * FROM genome_sections WHERE genome_id = ? AND path = ?`,
  ).get(genomeId, path);
}

/** Insert or replace a conflict record for a path (one active conflict per path). */
export function upsertGenomeConflict(
  genomeId: string,
  path: string,
  variantsJson: string,
): void {
  const db = getDb();
  // Remove any existing conflict for this path first
  db.run(`DELETE FROM genome_conflicts WHERE genome_id = ? AND path = ?`, [genomeId, path]);
  db.run(
    `INSERT INTO genome_conflicts (id, genome_id, path, variants_json)
     VALUES (?, ?, ?, ?)`,
    [crypto.randomUUID(), genomeId, path, variantsJson],
  );
}

export function getGenomeConflicts(genomeId: string): GenomeConflict[] {
  return getDb().query<GenomeConflict, [string]>(
    `SELECT * FROM genome_conflicts WHERE genome_id = ? ORDER BY detected_at DESC`,
  ).all(genomeId);
}

export function resolveGenomeConflict(genomeId: string, path: string): void {
  getDb().run(
    `DELETE FROM genome_conflicts WHERE genome_id = ? AND path = ?`,
    [genomeId, path],
  );
}

export function logGenomePush(genomeId: string, clientId: string, path: string): void {
  getDb().run(
    `INSERT INTO genome_push_log (id, genome_id, client_id, path) VALUES (?, ?, ?, ?)`,
    [crypto.randomUUID(), genomeId, clientId, path],
  );
}

/** Count push events for a clientId within the last windowMs milliseconds. */
export function countRecentGenomePushes(genomeId: string, clientId: string, windowMs: number): number {
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = getDb().query<{ n: number }, [string, string, string]>(
    `SELECT COUNT(*) AS n FROM genome_push_log WHERE genome_id = ? AND client_id = ? AND at >= ?`,
  ).get(genomeId, clientId, since);
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------
// Policy pack helpers (Phase 4)
// ---------------------------------------------------------------------------

export interface PolicyRule {
  match: string;
  kind: "tool" | "path" | "shell";
  reason?: string;
}

export interface PolicyRules {
  allow: PolicyRule[];
  deny: PolicyRule[];
  requireConfirm: PolicyRule[];
}

export interface PolicyPack {
  id: string;
  org_id: string;
  name: string;
  version: number;
  rules_json: string;
  author: string;
  created_at: string;
}

export interface PolicyCurrent {
  org_id: string;
  pack_id: string;
  set_at: string;
}

/** Insert a new policy pack version. Returns the new pack. */
export function createPolicyPack(
  orgId: string,
  name: string,
  rules: PolicyRules,
  author: string,
): PolicyPack {
  const db = getDb();
  // Determine next version number for this (org, name) pair.
  const row = db.query<{ max_v: number | null }, [string, string]>(
    `SELECT MAX(version) AS max_v FROM policy_packs WHERE org_id = ? AND name = ?`,
  ).get(orgId, name);
  const version = (row?.max_v ?? 0) + 1;
  const id = crypto.randomUUID();
  db.run(
    `INSERT INTO policy_packs (id, org_id, name, version, rules_json, author)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, orgId, name, version, JSON.stringify(rules), author],
  );
  // Update current pointer
  db.run(
    `INSERT INTO policy_current (org_id, pack_id, set_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(org_id) DO UPDATE SET pack_id = excluded.pack_id, set_at = excluded.set_at`,
    [orgId, id],
  );
  return getPolicyPackById(id)!;
}

export function getPolicyPackById(id: string): PolicyPack | null {
  return getDb()
    .query<PolicyPack, [string]>(`SELECT * FROM policy_packs WHERE id = ?`)
    .get(id);
}

export function getCurrentPolicyPack(orgId: string): PolicyPack | null {
  const db = getDb();
  const cur = db.query<PolicyCurrent, [string]>(
    `SELECT * FROM policy_current WHERE org_id = ?`,
  ).get(orgId);
  if (!cur) return null;
  return getPolicyPackById(cur.pack_id);
}

export function getPolicyPackHistory(orgId: string, limit = 20): PolicyPack[] {
  return getDb()
    .query<PolicyPack, [string, number]>(
      `SELECT * FROM policy_packs WHERE org_id = ? ORDER BY version DESC LIMIT ?`,
    )
    .all(orgId, limit);
}

export function getPolicyPackByVersion(orgId: string, name: string, version: number): PolicyPack | null {
  return getDb()
    .query<PolicyPack, [string, string, number]>(
      `SELECT * FROM policy_packs WHERE org_id = ? AND name = ? AND version = ?`,
    )
    .get(orgId, name, version);
}

/** Set a specific pack as the current one (for rollback). */
export function setCurrentPolicyPack(orgId: string, packId: string): void {
  getDb().run(
    `INSERT INTO policy_current (org_id, pack_id, set_at)
     VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
     ON CONFLICT(org_id) DO UPDATE SET pack_id = excluded.pack_id, set_at = excluded.set_at`,
    [orgId, packId],
  );
}

// ---------------------------------------------------------------------------
// Audit event helpers (Phase 4)
// ---------------------------------------------------------------------------

export interface AuditEvent {
  id: string;
  org_id: string;
  user_id: string;
  tool: string;
  args_json: string;
  cwd_fingerprint: string;
  git_commit: string;
  at: string;
}

export interface AppendAuditEventParams {
  orgId: string;
  userId: string;
  tool: string;
  argsJson: string;
  cwdFingerprint: string;
  gitCommit: string;
  at?: string;
}

/** Append an immutable audit event. Returns the event id. */
export function appendAuditEvent(params: AppendAuditEventParams): string {
  const id = crypto.randomUUID();
  const at = params.at ?? new Date().toISOString();
  getDb().run(
    `INSERT INTO audit_events (id, org_id, user_id, tool, args_json, cwd_fingerprint, git_commit, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, params.orgId, params.userId, params.tool, params.argsJson, params.cwdFingerprint, params.gitCommit, at],
  );
  return id;
}

export interface QueryAuditEventsParams {
  orgId: string;
  from?: string;
  to?: string;
  userId?: string;
  tool?: string;
  limit?: number;
  offset?: number;
}

export function queryAuditEvents(params: QueryAuditEventsParams): AuditEvent[] {
  const db = getDb();
  const conditions: string[] = ["org_id = ?"];
  const bindings: unknown[] = [params.orgId];

  if (params.from) { conditions.push("at >= ?"); bindings.push(params.from); }
  if (params.to)   { conditions.push("at <= ?"); bindings.push(params.to); }
  if (params.userId) { conditions.push("user_id = ?"); bindings.push(params.userId); }
  if (params.tool)   { conditions.push("tool = ?"); bindings.push(params.tool); }

  const limit  = params.limit  ?? 100;
  const offset = params.offset ?? 0;
  bindings.push(limit, offset);

  const sql = `SELECT * FROM audit_events WHERE ${conditions.join(" AND ")} ORDER BY at DESC LIMIT ? OFFSET ?`;
  return db.query<AuditEvent, unknown[]>(sql).all(...bindings);
}

/** Stream all audit events for an org in ascending time order (for NDJSON export). */
export function streamAuditEvents(orgId: string): AuditEvent[] {
  return getDb()
    .query<AuditEvent, [string]>(
      `SELECT * FROM audit_events WHERE org_id = ? ORDER BY at ASC`,
    )
    .all(orgId);
}
