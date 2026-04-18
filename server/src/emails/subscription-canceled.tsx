/**
 * subscription-canceled.tsx — Sent on customer.subscription.deleted.
 *
 * Subject: "ashlr Pro — your subscription has ended"
 * Props: { email }
 */

import { Link, Section, Text, Button, Hr } from "@react-email/components";
import * as React from "react";
import { EmailShell, EmailContainer, EmailHeader, EmailBody, EmailFooter, colors, fonts } from "./shared.js";

export interface SubscriptionCanceledEmailProps {
  email: string;
}

export const subject = "ashlr Pro \u2014 your subscription has ended";

export default function SubscriptionCanceledEmail({
  email,
}: SubscriptionCanceledEmailProps): React.JSX.Element {
  const handle = email.split("@")[0] ?? email;

  return (
    <EmailShell previewText="Your ashlr Pro subscription has ended. Local-first features remain free forever.">
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
            Your subscription has ended
          </Text>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "15px",
              color: colors.ink,
              margin: "0 0 20px",
              lineHeight: "1.6",
            }}
          >
            Hi {handle}, thank you for being an ashlr Pro subscriber. Your subscription has
            been canceled and your account has been moved to the free plan.
          </Text>

          {/* What stays / what's gone */}
          <Section
            style={{
              backgroundColor: colors.paper,
              borderRadius: "6px",
              padding: "20px 24px",
              marginBottom: "24px",
              border: `1px solid ${colors.border}`,
            }}
          >
            <Text
              role="heading"
              aria-level={2}
              style={{
                fontFamily: fonts.heading,
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "16px",
                color: colors.ink,
                margin: "0 0 12px",
              }}
            >
              What stays free
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: "14px",
                color: colors.ink,
                margin: "0 0 4px",
                lineHeight: "1.6",
              }}
            >
              Local-first features stay free forever: genome init, local token savings,
              all slash commands, and the full ashlr CLI.
            </Text>

            <Hr style={{ borderColor: colors.border, margin: "16px 0" }} />

            <Text
              role="heading"
              aria-level={2}
              style={{
                fontFamily: fonts.heading,
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "16px",
                color: colors.muted,
                margin: "0 0 12px",
              }}
            >
              What's now disabled
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: "14px",
                color: colors.muted,
                margin: "0",
                lineHeight: "1.6",
              }}
            >
              Genome sync across machines and cloud LLM summarization are Pro-only features
              and have been disabled on your account.
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
            Want to resubscribe? You can rejoin at any time — all your data is still here.
          </Text>

          <Section style={{ marginBottom: "24px" }}>
            <Button
              href="https://plugin.ashlr.ai/pricing"
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
              View plans
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
            Questions? Contact{" "}
            <Link href="mailto:support@ashlr.ai" style={{ color: colors.accent }}>support@ashlr.ai</Link>.
          </Text>
        </EmailBody>
        <EmailFooter />
      </EmailContainer>
    </EmailShell>
  );
}

export function plainText({ email }: SubscriptionCanceledEmailProps): string {
  const handle = email.split("@")[0] ?? email;
  return [
    `Hi ${handle},`,
    ``,
    `Thank you for being an ashlr Pro subscriber. Your subscription has been canceled`,
    `and your account has been moved to the free plan.`,
    ``,
    `What stays free forever:`,
    `- Local-first features: genome init, local token savings, all slash commands, full CLI`,
    ``,
    `What is now disabled:`,
    `- Genome sync across machines`,
    `- Cloud LLM summarization`,
    ``,
    `Local-first features stay free forever.`,
    ``,
    `Want to resubscribe? View plans: https://plugin.ashlr.ai/pricing`,
    ``,
    `Questions? Contact support@ashlr.ai`,
    ``,
    `--`,
    `ashlr · MIT-licensed plugin + proprietary hosted backend.`,
    `Manage preferences: https://plugin.ashlr.ai/preferences`,
  ].join("\n");
}
