/**
 * email.ts — Central email dispatch via react-email + Resend.
 *
 * Usage:
 *   await sendEmail("magic-link", { to: "user@example.com", data: { email, link } });
 *
 * In TESTING=1 or when RESEND_API_KEY is unset the rendered HTML is written to
 * stderr and no real send is attempted.  All errors are caught — this function
 * never throws.
 */

import { render } from "@react-email/render";
import { Resend } from "resend";
import * as React from "react";

// ---------------------------------------------------------------------------
// Lazy Resend client
// ---------------------------------------------------------------------------

let _resend: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env["RESEND_API_KEY"] ?? "";
  if (!key) return null;
  if (!_resend) _resend = new Resend(key);
  return _resend;
}

function isTesting(): boolean {
  return process.env["TESTING"] === "1";
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

import MagicLinkEmail, {
  subject as magicLinkSubject,
  plainText as magicLinkPlain,
  type MagicLinkEmailProps,
} from "../emails/magic-link.js";

import WelcomeEmail, {
  subject as welcomeSubject,
  plainText as welcomePlain,
  type WelcomeEmailProps,
} from "../emails/welcome.js";

import PaymentSuccessEmail, {
  subject as paymentSuccessSubject,
  plainText as paymentSuccessPlain,
  type PaymentSuccessEmailProps,
} from "../emails/payment-success.js";

import PaymentFailedEmail, {
  subject as paymentFailedSubject,
  plainText as paymentFailedPlain,
  type PaymentFailedEmailProps,
} from "../emails/payment-failed.js";

import SubscriptionCanceledEmail, {
  subject as subscriptionCanceledSubject,
  plainText as subscriptionCanceledPlain,
  type SubscriptionCanceledEmailProps,
} from "../emails/subscription-canceled.js";

import DailyCapReachedEmail, {
  subject as dailyCapReachedSubject,
  plainText as dailyCapReachedPlain,
  type DailyCapReachedEmailProps,
} from "../emails/daily-cap-reached.js";

import StatusConfirmEmail, {
  subject as statusConfirmSubject,
  plainText as statusConfirmPlain,
  type StatusConfirmEmailProps,
} from "../emails/status-confirm.js";

import BroadcastEmail, {
  subjectFor as broadcastSubject,
  plainText as broadcastPlain,
  type BroadcastEmailProps,
} from "../emails/broadcast.js";

// ---------------------------------------------------------------------------
// Discriminated union: template name → data type
// ---------------------------------------------------------------------------

export type TemplateMap = {
  "magic-link":            MagicLinkEmailProps;
  "welcome":               WelcomeEmailProps;
  "payment-success":       PaymentSuccessEmailProps;
  "payment-failed":        PaymentFailedEmailProps;
  "subscription-canceled": SubscriptionCanceledEmailProps;
  "daily-cap-reached":     DailyCapReachedEmailProps;
  "status-confirm":        StatusConfirmEmailProps;
  "broadcast":             BroadcastEmailProps;
};

export type TemplateName = keyof TemplateMap;

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

async function renderTemplate<T extends TemplateName>(
  name: T,
  data: TemplateMap[T],
): Promise<{ subject: string; html: string; text: string }> {
  switch (name) {
    case "magic-link": {
      const d = data as MagicLinkEmailProps;
      const html = await render(React.createElement(MagicLinkEmail, d));
      return { subject: magicLinkSubject, html, text: magicLinkPlain(d) };
    }
    case "welcome": {
      const d = data as WelcomeEmailProps;
      const html = await render(React.createElement(WelcomeEmail, d));
      return { subject: welcomeSubject, html, text: welcomePlain(d) };
    }
    case "payment-success": {
      const d = data as PaymentSuccessEmailProps;
      const html = await render(React.createElement(PaymentSuccessEmail, d));
      return { subject: paymentSuccessSubject, html, text: paymentSuccessPlain(d) };
    }
    case "payment-failed": {
      const d = data as PaymentFailedEmailProps;
      const html = await render(React.createElement(PaymentFailedEmail, d));
      return { subject: paymentFailedSubject, html, text: paymentFailedPlain(d) };
    }
    case "subscription-canceled": {
      const d = data as SubscriptionCanceledEmailProps;
      const html = await render(React.createElement(SubscriptionCanceledEmail, d));
      return { subject: subscriptionCanceledSubject, html, text: subscriptionCanceledPlain(d) };
    }
    case "daily-cap-reached": {
      const d = data as DailyCapReachedEmailProps;
      const html = await render(React.createElement(DailyCapReachedEmail, d));
      return { subject: dailyCapReachedSubject, html, text: dailyCapReachedPlain(d) };
    }
    case "status-confirm": {
      const d = data as StatusConfirmEmailProps;
      const html = await render(React.createElement(StatusConfirmEmail, d));
      return { subject: statusConfirmSubject, html, text: statusConfirmPlain(d) };
    }
    case "broadcast": {
      const d = data as BroadcastEmailProps;
      const html = await render(React.createElement(BroadcastEmail, d));
      return { subject: broadcastSubject(d), html, text: broadcastPlain(d) };
    }
    default:
      throw new Error(`Unknown email template: ${String(name)}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SendEmailOptions<T extends TemplateName> {
  to:   string;
  data: TemplateMap[T];
  /** Override the from address — defaults to noreply@ashlr.ai */
  from?: string;
}

/**
 * Render a React email template and send it via Resend.
 *
 * Falls back to logging rendered HTML to stderr if:
 *   - RESEND_API_KEY is unset, OR
 *   - TESTING=1
 *
 * Never throws — all errors are caught and logged.
 */
export async function sendEmail<T extends TemplateName>(
  template: T,
  { to, data, from = "ashlr <noreply@ashlr.ai>" }: SendEmailOptions<T>,
): Promise<void> {
  try {
    const rendered = await renderTemplate(template, data);

    if (isTesting() || !process.env["RESEND_API_KEY"]) {
      process.stderr.write(
        `[ashlr-email] TESTING send to=${to} subject="${rendered.subject}"\n` +
        `[ashlr-email] html length=${rendered.html.length}\n` +
        `[ashlr-email] text:\n${rendered.text}\n`,
      );
      return;
    }

    const resend = getResend()!;
    const result = await resend.emails.send({
      from,
      to,
      subject: rendered.subject,
      html:    rendered.html,
      text:    rendered.text,
    });

    if (result.error) {
      process.stderr.write(
        `[ashlr-email] Resend error for template=${template} to=${to}: ${JSON.stringify(result.error)}\n`,
      );
    }
  } catch (err) {
    process.stderr.write(
      `[ashlr-email] unexpected error for template=${template} to=${to}: ${String(err)}\n`,
    );
  }
}
