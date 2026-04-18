/**
 * welcome.tsx — Sent immediately after a user's first magic-link verify.
 *
 * Subject: "Welcome to ashlr · your first steps"
 * Props: { email }
 */

import { Link, Section, Text, Hr } from "@react-email/components";
import * as React from "react";
import { EmailShell, EmailContainer, EmailHeader, EmailBody, EmailFooter, colors, fonts } from "./shared.js";

export interface WelcomeEmailProps {
  email: string;
}

export const subject = "Welcome to ashlr \xb7 your first steps";

export default function WelcomeEmail({ email }: WelcomeEmailProps): React.JSX.Element {
  const handle = email.split("@")[0] ?? email;

  return (
    <EmailShell previewText="You're in. Run /ashlr-tour for a 60-second walkthrough and set up your first sync.">
      <EmailContainer>
        <EmailHeader />
        <EmailBody>
          {/* Heading */}
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
            Here's what to do next:
          </Text>

          {/* Step 1 */}
          <Section style={{ marginBottom: "16px" }}>
            <Text
              role="heading"
              aria-level={2}
              style={{
                fontFamily: fonts.heading,
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "18px",
                color: colors.accent,
                margin: "0 0 4px",
              }}
            >
              1. Take the tour
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: "14px",
                color: colors.ink,
                margin: "0",
                lineHeight: "1.6",
              }}
            >
              Run <code style={{ fontFamily: "Courier New, monospace", backgroundColor: "#f0e8d8", padding: "1px 4px", borderRadius: "3px" }}>/ashlr-tour</code>{" "}
              in your Claude Code session for a 60-second walkthrough of every feature.
            </Text>
          </Section>

          <Hr style={{ borderColor: colors.border, margin: "12px 0" }} />

          {/* Step 2 */}
          <Section style={{ marginBottom: "16px" }}>
            <Text
              role="heading"
              aria-level={2}
              style={{
                fontFamily: fonts.heading,
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "18px",
                color: colors.accent,
                margin: "0 0 4px",
              }}
            >
              2. Enable cloud sync
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: "14px",
                color: colors.ink,
                margin: "0",
                lineHeight: "1.6",
              }}
            >
              Set <code style={{ fontFamily: "Courier New, monospace", backgroundColor: "#f0e8d8", padding: "1px 4px", borderRadius: "3px" }}>ASHLR_PRO_TOKEN</code>{" "}
              in your environment to start syncing your genome across machines.{" "}
              <Link href="https://plugin.ashlr.ai/docs/cloud-sync" style={{ color: colors.accent }}>
                Setup guide
              </Link>
              .
            </Text>
          </Section>

          <Hr style={{ borderColor: colors.border, margin: "12px 0" }} />

          {/* Step 3 */}
          <Section style={{ marginBottom: "28px" }}>
            <Text
              role="heading"
              aria-level={2}
              style={{
                fontFamily: fonts.heading,
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: "18px",
                color: colors.accent,
                margin: "0 0 4px",
              }}
            >
              3. Open the live dashboard
            </Text>
            <Text
              style={{
                fontFamily: fonts.body,
                fontSize: "14px",
                color: colors.ink,
                margin: "0",
                lineHeight: "1.6",
              }}
            >
              Drop <code style={{ fontFamily: "Courier New, monospace", backgroundColor: "#f0e8d8", padding: "1px 4px", borderRadius: "3px" }}>/ashlr-dashboard</code>{" "}
              to see token savings, usage charts, and your genome health in real time.
            </Text>
          </Section>

          {/* Footer links */}
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "13px",
              color: colors.muted,
              margin: "0",
              lineHeight: "1.8",
            }}
          >
            <Link href="https://plugin.ashlr.ai/docs" style={{ color: colors.accent }}>Docs</Link>
            {" \xb7 "}
            <Link href="https://github.com/ashlr-ai/ashlr-plugin" style={{ color: colors.accent }}>GitHub</Link>
            {" \xb7 "}
            <Link href="https://plugin.ashlr.ai/pricing" style={{ color: colors.accent }}>Pricing</Link>
          </Text>
        </EmailBody>
        <EmailFooter />
      </EmailContainer>
    </EmailShell>
  );
}

export function plainText({ email }: WelcomeEmailProps): string {
  const handle = email.split("@")[0] ?? email;
  return [
    `Hi ${handle}, you're in.`,
    ``,
    `Here's what to do next:`,
    ``,
    `1. Take the tour`,
    `   Run /ashlr-tour in your Claude Code session for a 60-second walkthrough.`,
    ``,
    `2. Enable cloud sync`,
    `   Set ASHLR_PRO_TOKEN in your environment to start syncing your genome.`,
    `   Setup guide: https://plugin.ashlr.ai/docs/cloud-sync`,
    ``,
    `3. Open the live dashboard`,
    `   Drop /ashlr-dashboard to see token savings and usage in real time.`,
    ``,
    `Docs: https://plugin.ashlr.ai/docs`,
    `GitHub: https://github.com/ashlr-ai/ashlr-plugin`,
    `Pricing: https://plugin.ashlr.ai/pricing`,
    ``,
    `--`,
    `ashlr · MIT-licensed plugin + proprietary hosted backend.`,
    `Manage preferences: https://plugin.ashlr.ai/preferences`,
  ].join("\n");
}
