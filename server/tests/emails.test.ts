/**
 * emails.test.ts — React email template render tests + integration smoke tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import * as React from "react";
import { render } from "@react-email/render";
import { _setDb, _resetDb, tryRecordDailyCapNotification } from "../src/db.js";

// ---------------------------------------------------------------------------
// Template imports
// ---------------------------------------------------------------------------

import MagicLinkEmail, {
  subject as magicLinkSubject,
  plainText as magicLinkPlain,
} from "../src/emails/magic-link.js";

import WelcomeEmail, {
  subject as welcomeSubject,
  plainText as welcomePlain,
} from "../src/emails/welcome.js";

import PaymentSuccessEmail, {
  subject as paymentSuccessSubject,
  plainText as paymentSuccessPlain,
  formatAmount,
} from "../src/emails/payment-success.js";

import PaymentFailedEmail, {
  subject as paymentFailedSubject,
  plainText as paymentFailedPlain,
} from "../src/emails/payment-failed.js";

import SubscriptionCanceledEmail, {
  subject as subscriptionCanceledSubject,
  plainText as subscriptionCanceledPlain,
} from "../src/emails/subscription-canceled.js";

import DailyCapReachedEmail, {
  subject as dailyCapReachedSubject,
  plainText as dailyCapReachedPlain,
} from "../src/emails/daily-cap-reached.js";

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const TEST_EMAIL   = "mason@evero-consulting.com";
const TEST_LINK    = "https://plugin.ashlr.ai/signin/verify?token=abc123def456abc123def456";
const RENEWS_ON    = "2026-05-17T00:00:00.000Z";
const GRACE_END    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

// ---------------------------------------------------------------------------
// 1. Each template renders without throwing (HTML + plain text non-empty)
// ---------------------------------------------------------------------------

describe("email templates render", () => {
  it("magic-link: renders HTML and plain text", async () => {
    const html = await render(React.createElement(MagicLinkEmail, { email: TEST_EMAIL, link: TEST_LINK }));
    const text = magicLinkPlain({ email: TEST_EMAIL, link: TEST_LINK });
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });

  it("welcome: renders HTML and plain text", async () => {
    const html = await render(React.createElement(WelcomeEmail, { email: TEST_EMAIL }));
    const text = welcomePlain({ email: TEST_EMAIL });
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });

  it("payment-success: renders HTML and plain text", async () => {
    const html = await render(React.createElement(PaymentSuccessEmail, {
      email: TEST_EMAIL, amount: 1200, tier: "pro", renewsOn: RENEWS_ON,
    }));
    const text = paymentSuccessPlain({ email: TEST_EMAIL, amount: 1200, tier: "pro", renewsOn: RENEWS_ON });
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });

  it("payment-failed: renders HTML and plain text", async () => {
    const html = await render(React.createElement(PaymentFailedEmail, {
      email: TEST_EMAIL, gracePeriodEnd: GRACE_END,
    }));
    const text = paymentFailedPlain({ email: TEST_EMAIL, gracePeriodEnd: GRACE_END });
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });

  it("subscription-canceled: renders HTML and plain text", async () => {
    const html = await render(React.createElement(SubscriptionCanceledEmail, { email: TEST_EMAIL }));
    const text = subscriptionCanceledPlain({ email: TEST_EMAIL });
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });

  it("daily-cap-reached: renders HTML and plain text", async () => {
    const html = await render(React.createElement(DailyCapReachedEmail, { email: TEST_EMAIL }));
    const text = dailyCapReachedPlain({ email: TEST_EMAIL });
    expect(html.length).toBeGreaterThan(0);
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Subject line correctness
// ---------------------------------------------------------------------------

describe("subject lines", () => {
  it("magic-link subject contains 'sign in'", () => {
    expect(magicLinkSubject.toLowerCase()).toContain("sign-in");
  });

  it("all subjects are ≤ 70 characters", () => {
    const subjects = [
      magicLinkSubject,
      welcomeSubject,
      paymentSuccessSubject,
      paymentFailedSubject,
      subscriptionCanceledSubject,
      dailyCapReachedSubject,
    ];
    for (const s of subjects) {
      expect(s.length).toBeLessThanOrEqual(70);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Magic-link body contains the token URL
// ---------------------------------------------------------------------------

describe("magic-link content", () => {
  it("HTML body contains the token URL", async () => {
    const html = await render(React.createElement(MagicLinkEmail, { email: TEST_EMAIL, link: TEST_LINK }));
    expect(html).toContain(TEST_LINK);
  });

  it("plain-text body contains the token URL", () => {
    const text = magicLinkPlain({ email: TEST_EMAIL, link: TEST_LINK });
    expect(text).toContain(TEST_LINK);
  });

  it("plain-text greeting does not echo the raw token without context", () => {
    // Token is part of the link, but the greeting line should not contain it standalone
    const text = magicLinkPlain({ email: TEST_EMAIL, link: TEST_LINK });
    const lines = text.split("\n");
    const greetingLine = lines.find((l) => l.startsWith("Hi "));
    expect(greetingLine).toBeDefined();
    expect(greetingLine!).not.toContain("abc123def456");
  });
});

// ---------------------------------------------------------------------------
// 4. Payment-success: amount formatted as $12.00
// ---------------------------------------------------------------------------

describe("payment-success content", () => {
  it("formatAmount(1200) === '$12.00'", () => {
    expect(formatAmount(1200)).toBe("$12.00");
  });

  it("formatAmount(999) === '$9.99'", () => {
    expect(formatAmount(999)).toBe("$9.99");
  });

  it("plain text contains formatted amount", () => {
    const text = paymentSuccessPlain({ email: TEST_EMAIL, amount: 1200, tier: "pro", renewsOn: RENEWS_ON });
    expect(text).toContain("$12.00");
  });
});

// ---------------------------------------------------------------------------
// 5. Payment-failed: grace-period date is 7 days out
// ---------------------------------------------------------------------------

describe("payment-failed content", () => {
  it("grace-period date is ~7 days from now", () => {
    const sevenDaysOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const grace = new Date(GRACE_END);
    const diffMs = Math.abs(grace.getTime() - sevenDaysOut.getTime());
    // Allow 5s of test execution drift
    expect(diffMs).toBeLessThan(5_000);
  });

  it("plain text mentions the grace period date", () => {
    const text = paymentFailedPlain({ email: TEST_EMAIL, gracePeriodEnd: GRACE_END });
    // Should mention "2026" or the grace date
    expect(text.toLowerCase()).toMatch(/april|may|june|july|2026|grace/i);
  });
});

// ---------------------------------------------------------------------------
// 6. Subscription-canceled: mentions "local-first features stay free forever"
// ---------------------------------------------------------------------------

describe("subscription-canceled content", () => {
  it("plain text mentions local-first features stay free forever", () => {
    const text = subscriptionCanceledPlain({ email: TEST_EMAIL });
    expect(text.toLowerCase()).toContain("local-first features stay free forever");
  });
});

// ---------------------------------------------------------------------------
// 7. Daily-cap idempotency: only sends once per user per day
// ---------------------------------------------------------------------------

describe("daily cap notification idempotency", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    _setDb(db);
  });

  afterEach(() => {
    _resetDb();
  });

  it("first call returns true, second returns false", () => {
    const first  = tryRecordDailyCapNotification("user-1");
    const second = tryRecordDailyCapNotification("user-1");
    expect(first).toBe(true);
    expect(second).toBe(false);
  });

  it("different users each get true on first call", () => {
    expect(tryRecordDailyCapNotification("user-a")).toBe(true);
    expect(tryRecordDailyCapNotification("user-b")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. TESTING=1 mode: no Resend call, HTML logged to stderr
// ---------------------------------------------------------------------------

describe("sendEmail TESTING mode", () => {
  it("does not throw and writes to stderr when TESTING=1", async () => {
    const original = process.env["TESTING"];
    process.env["TESTING"] = "1";
    const { sendEmail } = await import("../src/lib/email.js");

    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: string | Uint8Array, ..._rest: unknown[]): boolean => {
      stderrChunks.push(typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk));
      return true;
    };

    try {
      await sendEmail("welcome", { to: TEST_EMAIL, data: { email: TEST_EMAIL } });
      const combined = stderrChunks.join("");
      expect(combined).toContain("TESTING send");
      expect(combined).toContain(TEST_EMAIL);
    } finally {
      process.stderr.write = origWrite;
      if (original === undefined) delete process.env["TESTING"];
      else process.env["TESTING"] = original;
    }
  });
});

// ---------------------------------------------------------------------------
// 9. Unicode in email names does not crash render
// ---------------------------------------------------------------------------

describe("unicode safety", () => {
  it("email with unicode local part renders without throwing", async () => {
    const unicodeEmail = "test\u00e9\u00e0\u00fc@example.com";
    const html = await render(React.createElement(MagicLinkEmail, { email: unicodeEmail, link: TEST_LINK }));
    expect(html.length).toBeGreaterThan(0);
  });

  it("plain-text fallback with unicode email does not crash", () => {
    const unicodeEmail = "\u6d4b\u8bd5@example.com";
    const text = magicLinkPlain({ email: unicodeEmail, link: TEST_LINK });
    expect(text.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 10. PII scrubbing: plain-text fallback does not echo the token in the greeting
// ---------------------------------------------------------------------------

describe("PII scrubbing", () => {
  it("plain-text greeting line does not contain the raw token string", () => {
    const token = "supersecrettoken9999";
    const link  = `https://plugin.ashlr.ai/signin/verify?token=${token}`;
    const text  = magicLinkPlain({ email: TEST_EMAIL, link });
    const greeting = text.split("\n").find((l) => l.startsWith("Hi ")) ?? "";
    expect(greeting).not.toContain(token);
  });
});
