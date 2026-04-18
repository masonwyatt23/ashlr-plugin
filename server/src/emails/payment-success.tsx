/**
 * payment-success.tsx — Sent on checkout.session.completed.
 *
 * Subject: "ashlr Pro — you're in"
 * Props: { email, amount, tier, renewsOn }
 */

import { Link, Section, Text, Hr } from "@react-email/components";
import * as React from "react";
import { EmailShell, EmailContainer, EmailHeader, EmailBody, EmailFooter, colors, fonts } from "./shared.js";

export interface PaymentSuccessEmailProps {
  email:    string;
  /** Amount in cents, e.g. 1200 for $12.00 */
  amount:   number;
  tier:     string;
  /** ISO date string */
  renewsOn: string;
}

export const subject = "ashlr Pro \u2014 you're in";

/** Format cents to USD string: 1200 → "$12.00" */
export function formatAmount(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PaymentSuccessEmail({
  email,
  amount,
  tier,
  renewsOn,
}: PaymentSuccessEmailProps): React.JSX.Element {
  const handle = email.split("@")[0] ?? email;
  const renewsDate = new Date(renewsOn).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <EmailShell previewText={`Your ashlr ${tierLabel} subscription is active. Receipt enclosed.`}>
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
              color: colors.ink,
              margin: "0 0 8px",
              lineHeight: "1.2",
            }}
          >
            You're in, {handle}.
          </Text>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "15px",
              color: colors.ink,
              margin: "0 0 24px",
              lineHeight: "1.6",
            }}
          >
            Thank you for subscribing to ashlr {tierLabel}. Your account is now active.
          </Text>

          {/* Receipt block */}
          <Section
            style={{
              backgroundColor: colors.paper,
              borderRadius: "6px",
              padding: "20px 24px",
              marginBottom: "24px",
              border: `1px solid ${colors.border}`,
            }}
          >
            <table role="presentation" width="100%" cellPadding="0" cellSpacing="0" style={{ borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.muted, padding: "4px 0" }}>Plan</td>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.ink, textAlign: "right", padding: "4px 0" }}>{tierLabel}</td>
                </tr>
                <tr>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.muted, padding: "4px 0" }}>Amount charged</td>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.ink, textAlign: "right", padding: "4px 0" }}>{formatAmount(amount)}</td>
                </tr>
                <tr>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.muted, padding: "4px 0" }}>Renews on</td>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.ink, textAlign: "right", padding: "4px 0" }}>{renewsDate}</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Hr style={{ borderColor: colors.border, margin: "0 0 20px" }} />

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "13px",
              color: colors.muted,
              margin: "0",
              lineHeight: "1.8",
            }}
          >
            <Link href="https://plugin.ashlr.ai/dashboard" style={{ color: colors.accent }}>Open dashboard</Link>
            {" \xb7 "}
            <Link href="https://plugin.ashlr.ai/billing" style={{ color: colors.accent }}>Manage billing</Link>
          </Text>
        </EmailBody>
        <EmailFooter />
      </EmailContainer>
    </EmailShell>
  );
}

export function plainText({ email, amount, tier, renewsOn }: PaymentSuccessEmailProps): string {
  const handle = email.split("@")[0] ?? email;
  const renewsDate = new Date(renewsOn).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  return [
    `Hi ${handle},`,
    ``,
    `Thank you for subscribing to ashlr ${tierLabel}. Your account is now active.`,
    ``,
    `Plan: ${tierLabel}`,
    `Amount charged: ${formatAmount(amount)}`,
    `Renews on: ${renewsDate}`,
    ``,
    `Dashboard: https://plugin.ashlr.ai/dashboard`,
    `Manage billing: https://plugin.ashlr.ai/billing`,
    ``,
    `--`,
    `ashlr · MIT-licensed plugin + proprietary hosted backend.`,
    `Manage preferences: https://plugin.ashlr.ai/preferences`,
  ].join("\n");
}
