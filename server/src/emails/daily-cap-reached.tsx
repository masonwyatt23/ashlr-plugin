/**
 * daily-cap-reached.tsx — Sent once when a user hits their daily LLM cap.
 *
 * Subject: "ashlr Pro — daily LLM cap reached"
 * Props: { email }
 */

import { Link, Section, Text, Hr } from "@react-email/components";
import * as React from "react";
import { EmailShell, EmailContainer, EmailHeader, EmailBody, EmailFooter, colors, fonts } from "./shared.js";

export interface DailyCapReachedEmailProps {
  email: string;
}

export const subject = "ashlr Pro \u2014 daily LLM cap reached";

export default function DailyCapReachedEmail({
  email,
}: DailyCapReachedEmailProps): React.JSX.Element {
  const handle = email.split("@")[0] ?? email;

  return (
    <EmailShell previewText="Your Pro plan hit the 1000-call / $1 daily cap. Resets at midnight UTC. Enterprise has higher caps.">
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
            Daily cap reached
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
            Hi {handle}, your ashlr Pro plan hit the daily limit of{" "}
            <strong>1,000 cloud LLM calls ($1.00)</strong> for today.
          </Text>

          {/* Cap info callout */}
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
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.muted, padding: "4px 0" }}>Daily cap</td>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.ink, textAlign: "right", padding: "4px 0" }}>1,000 calls / $1.00</td>
                </tr>
                <tr>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.muted, padding: "4px 0" }}>Resets at</td>
                  <td style={{ fontFamily: fonts.body, fontSize: "13px", color: colors.ink, textAlign: "right", padding: "4px 0" }}>Midnight UTC</td>
                </tr>
              </tbody>
            </table>
          </Section>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "15px",
              color: colors.ink,
              margin: "0 0 16px",
              lineHeight: "1.6",
            }}
          >
            Cloud LLM calls will resume automatically when the cap resets. Local features
            (token savings, genome, slash commands) are unaffected and continue working.
          </Text>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "14px",
              color: colors.muted,
              margin: "0 0 24px",
              lineHeight: "1.6",
            }}
          >
            Need higher limits? Enterprise plans include significantly higher daily caps
            and custom rate limits.{" "}
            <Link href="https://plugin.ashlr.ai/pricing" style={{ color: colors.accent }}>
              Compare plans
            </Link>
            .
          </Text>

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
            <Link href="https://plugin.ashlr.ai/dashboard" style={{ color: colors.accent }}>View dashboard</Link>
            {" \xb7 "}
            <Link href="https://plugin.ashlr.ai/pricing" style={{ color: colors.accent }}>View plans</Link>
          </Text>
        </EmailBody>
        <EmailFooter />
      </EmailContainer>
    </EmailShell>
  );
}

export function plainText({ email }: DailyCapReachedEmailProps): string {
  const handle = email.split("@")[0] ?? email;
  return [
    `Hi ${handle},`,
    ``,
    `Your ashlr Pro plan hit the daily limit of 1,000 cloud LLM calls ($1.00) for today.`,
    ``,
    `Daily cap: 1,000 calls / $1.00`,
    `Resets at: Midnight UTC`,
    ``,
    `Cloud LLM calls will resume automatically when the cap resets.`,
    `Local features (token savings, genome, slash commands) continue working.`,
    ``,
    `Need higher limits? Enterprise plans have higher caps.`,
    `Compare plans: https://plugin.ashlr.ai/pricing`,
    ``,
    `Dashboard: https://plugin.ashlr.ai/dashboard`,
    ``,
    `--`,
    `ashlr · MIT-licensed plugin + proprietary hosted backend.`,
    `Manage preferences: https://plugin.ashlr.ai/preferences`,
  ].join("\n");
}
