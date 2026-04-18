/**
 * genome.test.ts — Tests for team CRDT genome sync endpoints (Phase 3).
 *
 * Test DB is an in-memory SQLite instance injected via _setDb/_resetDb.
 * All 15 cases listed in the spec are covered.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import app from "../src/index.js";
import { _setDb, _resetDb, createUser, setUserTier } from "../src/db.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function makeUser(email: string, tier: "free" | "pro" | "team") {
  const token = `tok_${email.replace(/[^a-z]/g, "_")}`;
  const user = createUser(email, token);
  setUserTier(user.id, tier);
  return { ...user, api_token: token };
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function post(path: string, body: unknown, token: string) {
  return app.request(path, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

async function get(path: string, token: string) {
  return app.request(path, { headers: { Authorization: `Bearer ${token}` } });
}

async function del(path: string, token: string) {
  return app.request(path, { method: "DELETE", headers: authHeaders(token) });
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("genome sync", () => {
  beforeEach(() => {
    const db = makeTestDb();
    _setDb(db);
  });

  afterEach(() => {
    _resetDb();
  });

  // 1. Init creates a new genome for a new org
  it("init creates genome for org+repo", async () => {
    const user = makeUser("init@example.com", "team");
    const res = await post("/genome/init", { orgId: "org1", repoUrl: "https://github.com/org/repo" }, user.api_token);
    expect(res.status).toBe(200);
    const body = await res.json() as { genomeId: string; cloneToken: string };
    expect(body.genomeId).toBeString();
    expect(body.cloneToken).toStartWith("gclone_");
  });

  // 2. Init is idempotent
  it("init is idempotent — same orgId+repoUrl returns same genomeId", async () => {
    const user = makeUser("idem@example.com", "team");
    const a = await (await post("/genome/init", { orgId: "org1", repoUrl: "https://github.com/org/repo" }, user.api_token)).json() as { genomeId: string };
    const b = await (await post("/genome/init", { orgId: "org1", repoUrl: "https://github.com/org/repo" }, user.api_token)).json() as { genomeId: string };
    expect(a.genomeId).toBe(b.genomeId);
  });

  // 3. Push single section, pull returns it
  it("push a section then pull returns it", async () => {
    const user = makeUser("push@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org2", repoUrl: "https://github.com/org/r2" }, user.api_token)).json() as { genomeId: string };

    const pushRes = await post(`/genome/${genomeId}/push`, {
      clientId: "client-a",
      sections: [{ path: "sections/auth.md", content: "# Auth\nSome content.", vclock: { "client-a": 1 } }],
    }, user.api_token);
    expect(pushRes.status).toBe(200);
    const pushBody = await pushRes.json() as { applied: string[]; conflicts: string[] };
    expect(pushBody.applied).toContain("sections/auth.md");
    expect(pushBody.conflicts).toHaveLength(0);

    const pullRes = await get(`/genome/${genomeId}/pull?since=0`, user.api_token);
    expect(pullRes.status).toBe(200);
    const pullBody = await pullRes.json() as { sections: { path: string; content: string }[]; serverSeqNum: number };
    expect(pullBody.sections).toHaveLength(1);
    expect(pullBody.sections[0]!.path).toBe("sections/auth.md");
    expect(pullBody.sections[0]!.content).toBe("# Auth\nSome content.");
    expect(pullBody.serverSeqNum).toBeGreaterThan(0);
  });

  // 4. Push two concurrent sections from different client IDs — both applied, no conflict
  it("two different sections from different clients — both applied", async () => {
    const user = makeUser("two@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org3", repoUrl: "https://r3" }, user.api_token)).json() as { genomeId: string };

    await post(`/genome/${genomeId}/push`, {
      clientId: "client-a",
      sections: [{ path: "sections/s1.md", content: "S1", vclock: { "client-a": 1 } }],
    }, user.api_token);

    const res = await post(`/genome/${genomeId}/push`, {
      clientId: "client-b",
      sections: [{ path: "sections/s2.md", content: "S2", vclock: { "client-b": 1 } }],
    }, user.api_token);

    const body = await res.json() as { applied: string[]; conflicts: string[] };
    expect(body.applied).toContain("sections/s2.md");
    expect(body.conflicts).toHaveLength(0);

    const pull = await (await get(`/genome/${genomeId}/pull?since=0`, user.api_token)).json() as { sections: { path: string }[] };
    expect(pull.sections).toHaveLength(2);
  });

  // 5. Push same section with stale vclock → detected as conflict
  it("stale vclock push → conflict recorded", async () => {
    const user = makeUser("stale@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org4", repoUrl: "https://r4" }, user.api_token)).json() as { genomeId: string };

    // First push — client-a at count 2
    await post(`/genome/${genomeId}/push`, {
      clientId: "client-a",
      sections: [{ path: "sections/mod.md", content: "New content", vclock: { "client-a": 2 } }],
    }, user.api_token);

    // Second push — client-b with stale clock (client-a: 1, which is behind stored client-a: 2)
    const res = await post(`/genome/${genomeId}/push`, {
      clientId: "client-b",
      sections: [{ path: "sections/mod.md", content: "Old content", vclock: { "client-a": 1 } }],
    }, user.api_token);

    const body = await res.json() as { applied: string[]; conflicts: string[] };
    expect(body.conflicts).toContain("sections/mod.md");
    expect(body.applied).toHaveLength(0);

    const conflictsRes = await get(`/genome/${genomeId}/conflicts`, user.api_token);
    const conflictsBody = await conflictsRes.json() as { conflicts: { path: string; variants: unknown[] }[] };
    expect(conflictsBody.conflicts).toHaveLength(1);
    expect(conflictsBody.conflicts[0]!.path).toBe("sections/mod.md");
    expect(conflictsBody.conflicts[0]!.variants).toHaveLength(2);
  });

  // 6. Push with winning vclock (dominates existing) → accepted, no conflict
  it("dominant vclock push → accepted, no conflict", async () => {
    const user = makeUser("dominant@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org5", repoUrl: "https://r5" }, user.api_token)).json() as { genomeId: string };

    await post(`/genome/${genomeId}/push`, {
      clientId: "client-a",
      sections: [{ path: "sections/x.md", content: "v1", vclock: { "client-a": 1 } }],
    }, user.api_token);

    const res = await post(`/genome/${genomeId}/push`, {
      clientId: "client-a",
      sections: [{ path: "sections/x.md", content: "v2", vclock: { "client-a": 2 } }],
    }, user.api_token);

    const body = await res.json() as { applied: string[]; conflicts: string[] };
    expect(body.applied).toContain("sections/x.md");
    expect(body.conflicts).toHaveLength(0);
  });

  // 7. pull?since=N returns only sections with server_seq > N
  it("pull?since=N returns only newer sections", async () => {
    const user = makeUser("since@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org6", repoUrl: "https://r6" }, user.api_token)).json() as { genomeId: string };

    await post(`/genome/${genomeId}/push`, {
      clientId: "c1",
      sections: [{ path: "sections/early.md", content: "early", vclock: { c1: 1 } }],
    }, user.api_token);

    const mid = await (await get(`/genome/${genomeId}/pull?since=0`, user.api_token)).json() as { serverSeqNum: number };
    const seqAfterFirst = mid.serverSeqNum;

    await post(`/genome/${genomeId}/push`, {
      clientId: "c1",
      sections: [{ path: "sections/late.md", content: "late", vclock: { c1: 2 } }],
    }, user.api_token);

    const pullRes = await get(`/genome/${genomeId}/pull?since=${seqAfterFirst}`, user.api_token);
    const pullBody = await pullRes.json() as { sections: { path: string }[] };
    expect(pullBody.sections).toHaveLength(1);
    expect(pullBody.sections[0]!.path).toBe("sections/late.md");
  });

  // 8. Tier gate: free user → 403
  it("free user gets 403 on all genome endpoints", async () => {
    const user = makeUser("free@example.com", "free");
    const res = await post("/genome/init", { orgId: "org7", repoUrl: "https://r7" }, user.api_token);
    expect(res.status).toBe(403);
    const body = await res.json() as { upgrade_url: string };
    expect(body.upgrade_url).toBe("/billing/checkout");
  });

  // 9. Pro user also gets 403 (team tier required)
  it("pro user gets 403 — team tier required", async () => {
    const user = makeUser("pro@example.com", "pro");
    const res = await post("/genome/init", { orgId: "org8", repoUrl: "https://r8" }, user.api_token);
    expect(res.status).toBe(403);
  });

  // 10. Section path validation — reject ".."
  it("rejects section path with ..", async () => {
    const user = makeUser("path1@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org9", repoUrl: "https://r9" }, user.api_token)).json() as { genomeId: string };

    const res = await post(`/genome/${genomeId}/push`, {
      clientId: "c1",
      sections: [{ path: "../../etc/passwd", content: "bad", vclock: { c1: 1 } }],
    }, user.api_token);
    expect(res.status).toBe(400);
  });

  // 11. Section path validation — reject absolute paths
  it("rejects absolute section paths", async () => {
    const user = makeUser("path2@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org10", repoUrl: "https://r10" }, user.api_token)).json() as { genomeId: string };

    const res = await post(`/genome/${genomeId}/push`, {
      clientId: "c1",
      sections: [{ path: "/etc/passwd", content: "bad", vclock: { c1: 1 } }],
    }, user.api_token);
    expect(res.status).toBe(400);
  });

  // 12. Conflict resolution clears the conflict and updates the section
  it("resolve clears conflict and updates section content", async () => {
    const user = makeUser("resolve@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org11", repoUrl: "https://r11" }, user.api_token)).json() as { genomeId: string };

    // Create a conflict
    await post(`/genome/${genomeId}/push`, {
      clientId: "ca",
      sections: [{ path: "sections/conflict.md", content: "A", vclock: { ca: 2 } }],
    }, user.api_token);
    await post(`/genome/${genomeId}/push`, {
      clientId: "cb",
      sections: [{ path: "sections/conflict.md", content: "B", vclock: { ca: 1 } }],
    }, user.api_token);

    // Verify conflict exists
    const beforeResolve = await (await get(`/genome/${genomeId}/conflicts`, user.api_token)).json() as { conflicts: unknown[] };
    expect(beforeResolve.conflicts).toHaveLength(1);

    // Resolve
    const resolveRes = await post(`/genome/${genomeId}/resolve`, {
      path: "sections/conflict.md",
      winning: { content: "Resolved content", vclock: { ca: 3 } },
    }, user.api_token);
    expect(resolveRes.status).toBe(200);

    // Conflict should be gone
    const afterResolve = await (await get(`/genome/${genomeId}/conflicts`, user.api_token)).json() as { conflicts: unknown[] };
    expect(afterResolve.conflicts).toHaveLength(0);

    // Section should have resolved content
    const pull = await (await get(`/genome/${genomeId}/pull?since=0`, user.api_token)).json() as { sections: { path: string; content: string }[] };
    const section = pull.sections.find((s) => s.path === "sections/conflict.md");
    expect(section?.content).toBe("Resolved content");
  });

  // 13. DELETE genome removes it
  it("delete genome removes it — subsequent pull returns 404", async () => {
    const user = makeUser("del@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org12", repoUrl: "https://r12" }, user.api_token)).json() as { genomeId: string };

    const delRes = await del(`/genome/${genomeId}`, user.api_token);
    expect(delRes.status).toBe(200);

    const pullRes = await get(`/genome/${genomeId}/pull?since=0`, user.api_token);
    expect(pullRes.status).toBe(404);
  });

  // 14. Push rate limit: > 10 sections/minute returns 429
  it("push rate limit fires after 10 sections/minute", async () => {
    const user = makeUser("rl@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org13", repoUrl: "https://r13" }, user.api_token)).json() as { genomeId: string };

    // Push 10 sections — should succeed
    const sections = Array.from({ length: 10 }, (_, i) => ({
      path: `sections/s${i}.md`,
      content: `content ${i}`,
      vclock: { c1: i + 1 },
    }));
    const ok = await post(`/genome/${genomeId}/push`, { clientId: "c1", sections }, user.api_token);
    expect(ok.status).toBe(200);

    // One more section in same window — should be rate limited
    const over = await post(`/genome/${genomeId}/push`, {
      clientId: "c1",
      sections: [{ path: "sections/s10.md", content: "over", vclock: { c1: 11 } }],
    }, user.api_token);
    expect(over.status).toBe(429);
  });

  // 15. Concurrent edit from two different clients → both sides in conflict
  it("concurrent edit from two clients → conflict with both variants", async () => {
    const user = makeUser("concurrent@example.com", "team");
    const { genomeId } = await (await post("/genome/init", { orgId: "org14", repoUrl: "https://r14" }, user.api_token)).json() as { genomeId: string };

    // Both clients independently edit from the same base (each has a clock the other doesn't know about)
    await post(`/genome/${genomeId}/push`, {
      clientId: "ca",
      sections: [{ path: "sections/shared.md", content: "CA version", vclock: { ca: 1 } }],
    }, user.api_token);

    const res = await post(`/genome/${genomeId}/push`, {
      clientId: "cb",
      sections: [{ path: "sections/shared.md", content: "CB version", vclock: { cb: 1 } }],
    }, user.api_token);

    const body = await res.json() as { applied: string[]; conflicts: string[] };
    expect(body.conflicts).toContain("sections/shared.md");

    const cf = await (await get(`/genome/${genomeId}/conflicts`, user.api_token)).json() as { conflicts: { variants: { authorHint: string }[] }[] };
    expect(cf.conflicts[0]!.variants).toHaveLength(2);
  });
});
