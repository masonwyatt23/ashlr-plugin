/**
 * auth.ts — Magic-link email authentication (Phase 4).
 *
 * POST /auth/send   — request a magic-link for an email address
 * POST /auth/verify — exchange a magic token for a permanent API token
 */

import { Hono } from "hono";
import { z } from "zod";
import { Resend } from "resend";
import {
  getDb,
  getOrCreateUserByEmail,
  createMagicToken,
  getMagicToken,
  markMagicTokenUsed,
  countRecentMagicTokens,
  issueApiToken,
  getUserById,
} from "../db.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const FRONTEND_URL   = process.env["FRONTEND_URL"]   ?? "https://plugin.ashlr.ai";
const RESEND_API_KEY = process.env["RESEND_API_KEY"]  ?? "";
const TESTING        = process.env["TESTING"] === "1";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX    = 5;               // requests per email per hour

// ---------------------------------------------------------------------------
// Resend client (lazy — only initialised when a key is present)
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(RESEND_API_KEY);
  return _resend;
}

// ---------------------------------------------------------------------------
// Email sender
// ---------------------------------------------------------------------------

async function sendMagicLinkEmail(email: string, token: string): Promise<void> {
  const link = `${FRONTEND_URL}/signin/verify?token=${token}`;

  if (TESTING || !RESEND_API_KEY) {
    // Dev / test mode: log to stderr, never send real email.
    process.stderr.write(
      `[ashlr-auth] magic token for ${email}: ${token}\n[ashlr-auth] link: ${link}\n`,
    );
    return;
  }

  const resend = getResend()!;
  await resend.emails.send({
    from: "noreply@ashlr.ai",
    to:   email,
    subject: "Sign in to ashlr",
    text: [
      `Here is your sign-in link:`,
      ``,
      link,
      ``,
      `This link expires in 15 minutes.`,
      ``,
      `If you didn't request this, you can ignore it.`,
    ].join("\n"),
  });
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

function generateMagicToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const sendSchema = z.object({
  email: z.string().email(),
});

const verifySchema = z.object({
  token: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const router = new Hono();

/**
 * POST /auth/send
 * Body: { email: string }
 *
 * Creates (or looks up) a user, generates a magic-link token, sends email.
 * Always returns { sent: true } — never reveals whether the email exists.
 * Rate limited: 5 requests per email per hour.
 */
router.post("/auth/send", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "Invalid email address" }, 400);
  }

  const { email } = parsed.data;

  // Rate limit: max 5 sends per email per hour
  const recentCount = countRecentMagicTokens(email, RATE_LIMIT_WINDOW);
  if (recentCount >= RATE_LIMIT_MAX) {
    return c.json(
      { error: "Too many sign-in requests. Please wait before trying again." },
      429,
    );
  }

  // Ensure user exists
  getOrCreateUserByEmail(email);

  // Generate and persist magic token
  const token     = generateMagicToken();
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS).toISOString();
  createMagicToken(email, token, expiresAt);

  // Send email (fire-and-forget errors silently — we never reveal success/failure)
  try {
    await sendMagicLinkEmail(email, token);
  } catch (err) {
    // Log but don't surface to caller — prevents email enumeration via error timing.
    process.stderr.write(`[ashlr-auth] email send failed for ${email}: ${String(err)}\n`);
  }

  return c.json({ sent: true });
});

/**
 * POST /auth/verify
 * Body: { token: string }
 *
 * Validates the magic token and issues a permanent API token.
 * Returns { apiToken, userId, email } on success.
 * Returns 400 for any invalid/used/expired state.
 */
router.post("/auth/verify", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "invalid or expired link" }, 400);
  }

  const { token } = parsed.data;

  const row = getMagicToken(token);

  if (!row) {
    return c.json({ error: "invalid or expired link" }, 400);
  }

  if (row.used_at !== null) {
    return c.json({ error: "invalid or expired link" }, 400);
  }

  if (new Date(row.expires_at) <= new Date()) {
    return c.json({ error: "invalid or expired link" }, 400);
  }

  // Mark token as used before issuing the API token (prevents double-issue on retries)
  markMagicTokenUsed(token);

  // Look up the user created during /auth/send
  const user = getDb().query<{ id: string }, [string]>(
    `SELECT id FROM users WHERE email = ?`,
  ).get(row.email);

  if (!user) {
    // Should not happen — user is created during /auth/send
    return c.json({ error: "invalid or expired link" }, 400);
  }

  const apiToken = issueApiToken(user.id);
  const fullUser = getUserById(user.id)!;

  return c.json({ apiToken, userId: user.id, email: fullUser.email });
});

export default router;
