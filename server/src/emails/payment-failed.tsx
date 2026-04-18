/**
 * payment-failed.tsx — Sent on invoice.payment_failed.
 *
 * Subject: "ashlr Pro — payment failed, we'll retry"
 * Props: { email, gracePeriodEnd }
 */

import { Link, Section, Text, Button, Hr } from "@react-email/components";
import * as React from "react";
import { EmailShell, EmailContainer, EmailHeader, EmailBody, EmailFooter, colors, fonts } from "./shared.js";

export interface PaymentFailedEmailProps {
  email:          string;
  /** ISO date string — 7 days from failure */
  gracePeriodEnd: string;
}

export const subject = "ashlr Pro \u2014 payment failed, we'll retry";

export default function PaymentFailedEmail({
  email,
  gracePeriodEnd,
}: PaymentFailedEmailProps): React.JSX.Element {
  const handle = email.split("@")[0] ?? email;
  const graceDate = new Date(gracePeriodEnd).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <EmailShell previewText={`Heads up: your payment didn't go through. We'll retry automatically until ${graceDate}.`}>
      <EmailContainer>
        <EmailHeader />
        <EmailBody>
          <Text
            role="heading"
            aria-level={1}
            style={{
              fontFamily: fonts.heading,
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: "28px",
              color: colors.accent,
              margin: "0 0 8px",
              lineHeight: "1.2",
            }}
          >
            Payment failed
          </Text>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "15px",
              color: colors.ink,
              margin: "0 0 16px",
              lineHeight: "1.6",
            }}
          >
            Hi {handle}, we weren't able to charge your payment method for your ashlr Pro
            subscription. No worries — we'll retry automatically over the next 7 days.
          </Text>

          {/* Grace period callout */}
          <Section
            style={{
              backgroundColor: "#fdf3ef",
              borderLeft: `4px solid ${colors.accent}`,
              borderRadius: "0 6px 6px 0",
              padding: "16px 20px",
              marginBottom: "24px",
            }}
          >
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: "14px",
                color: colors.ink,
                margin: "0",
                lineHeight: "1.6",
              }}
            >
              Your access remains active during the grace period.{" "}
              <strong>If payment is not resolved by {graceDate}, your subscription will be paused.</strong>
            </Text>
          </Section>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "15px",
              color: colors.ink,
              margin: "0 0 24px",
              lineHeight: "1.6",
            }}
          >
            To fix this now, update your payment method in the billing portal:
          </Text>

          <Section style={{ marginBottom: "24px" }}>
            <Button
              href="https://plugin.ashlr.ai/billing"
              style={{
                backgroundColor: colors.accent,
                color: colors.paper,
                fontFamily: fonts.body,
                fontSize: "15px",
                fontWeight: "600",
                padding: "14px 28px",
                borderRadius: "6px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Update payment method
            </Button>
          </Section>

          <Hr style={{ borderColor: colors.border, margin: "0 0 16px" }} />

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "13px",
              color: colors.muted,
              margin: "0",
              lineHeight: "1.6",
            }}
          >
            If you have questions, reply to this email or contact{" "}
            <Link href="mailto:support@ashlr.ai" style={{ color: colors.accent }}>support@ashlr.ai</Link>.
          </Text>
        </EmailBody>
        <EmailFooter />
      </EmailContainer>
    </EmailShell>
  );
}

export function plainText({ email, gracePeriodEnd }: PaymentFailedEmailProps): string {
  const handle = email.split("@")[0] ?? email;
  const graceDate = new Date(gracePeriodEnd).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  return [
    `Hi ${handle},`,
    ``,
    `We weren't able to charge your payment method for your ashlr Pro subscription.`,
    `We'll retry automatically over the next 7 days.`,
    ``,
    `Your access remains active during the grace period.`,
    `If payment is not resolved by ${graceDate}, your subscription will be paused.`,
    ``,
    `To fix this now, update your payment method:`,
    `https://plugin.ashlr.ai/billing`,
    ``,
    `Questions? Reply to this email or contact support@ashlr.ai`,
    ``,
    `--`,
    `ashlr · MIT-licensed plugin + proprietary hosted backend.`,
    `Manage preferences: https://plugin.ashlr.ai/preferences`,
  ].join("\n");
}
