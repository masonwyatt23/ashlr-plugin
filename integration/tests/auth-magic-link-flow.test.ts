/**
 * auth-magic-link-flow.test.ts — Full magic-link auth round-trip.
 *
 * - POST /auth/send with email.
 * - Capture the logged magic token from stderr (TESTING=1 mode).
 * - POST /auth/verify with that token.
 * - Assert: response has apiToken, userId, email.
 * - Assert: calling /stats/aggregate with that token fails with 403 (free tier).
 */

import { describe, it, expect, afterEach } from "bun:test";
import { rmSync } from "fs";
import {
  makeTempHome,
  startBackend,
  fetchApi,
  pollUntil,
  sleep,
} from "../lib/harness.ts";

// ---------------------------------------------------------------------------
// Capture magic token from backend stderr
// ---------------------------------------------------------------------------

async function captureAuthToken(
  backendProc: import("bun").Subprocess,
  email: string,
  timeoutMs = 5000,
): Promise<string> {
  const stderrStream = backendProc.stderr as ReadableStream<Uint8Array>;
  const reader = stderrStream.getReader();
  const dec    = new TextDecoder();
  let buf = "";

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value);
    // Pattern from auth.ts: `[ashlr-auth] magic token for <email>: <token>`
    const match = buf.match(/\[ashlr-auth\] magic token for [^:]+: ([0-9a-f]{64})/);
    if (match) {
      reader.releaseLock();
      return match[1]!;
    }
    await sleep(50);
  }
  reader.releaseLock();
  throw new Error(`captureAuthToken: magic token not found in stderr within ${timeoutMs}ms`);
}

describe("auth-magic-link-flow", () => {
  let cleanup: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const fn of cleanup) await fn().catch(() => {});
    cleanup = [];
  });

  it("issues magic link, verifies it, returns apiToken + userId + email", async () => {
    const tempHome = makeTempHome();
    cleanup.push(async () => rmSync(tempHome, { recursive: true, force: true }));

    const backend = await startBackend({ tempHome, env: { TESTING: "1" } });
    cleanup.push(backend.teardown);

    const email = `auth-test-${Date.now()}@example.com`;

    // POST /auth/send — triggers magic token emission to stderr
    const sendRes = await fetchApi(backend.url, "/auth/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    expect(sendRes.status).toBe(200);
    const sendBody = await sendRes.json() as { sent: boolean };
    expect(sendBody.sent).toBe(true);

    // Capture the magic token from stderr
    const magicToken = await captureAuthToken(backend.proc, email, 5000);
    expect(magicToken).toHaveLength(64);
    expect(magicToken).toMatch(/^[0-9a-f]{64}$/);

    // POST /auth/verify
    const verifyRes = await fetchApi(backend.url, "/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: magicToken }),
    });
    expect(verifyRes.status).toBe(200);
    const verifyBody = await verifyRes.json() as {
      apiToken?: string;
      userId?:   string;
      email?:    string;
    };

    expect(verifyBody.apiToken).toBeDefined();
    expect(verifyBody.apiToken).toHaveLength(64);
    expect(verifyBody.userId).toBeDefined();
    expect(verifyBody.email).toBe(email);

    // Calling /stats/aggregate on a free-tier user → 403
    const aggRes = await fetchApi(backend.url, "/stats/aggregate", {
      headers: { Authorization: `Bearer ${verifyBody.apiToken}` },
    });
    expect(aggRes.status).toBe(403);

    // Token must not be reusable (idempotency)
    const reuse = await fetchApi(backend.url, "/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: magicToken }),
    });
    expect(reuse.status).toBe(400);
  }, 30_000);
});
