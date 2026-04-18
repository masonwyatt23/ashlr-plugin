/**
 * magic-link.tsx — Sign-in magic link email.
 *
 * Subject: "Your ashlr sign-in link"
 * Props: { email, link }
 */

import { Button, Link, Section, Text, Hr } from "@react-email/components";
import * as React from "react";
import { EmailShell, EmailContainer, EmailHeader, EmailBody, EmailFooter, colors, fonts } from "./shared.js";

export interface MagicLinkEmailProps {
  email: string;
  link:  string;
}

export const subject = "Your ashlr sign-in link";

export default function MagicLinkEmail({ email, link }: MagicLinkEmailProps): React.JSX.Element {
  // Derive first-name hint from the local part before @
  const handle = email.split("@")[0] ?? email;

  return (
    <EmailShell previewText="Your sign-in link is ready — valid for 15 minutes. Click to access ashlr.">
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
            Sign in to ashlr
          </Text>

          {/* Greeting */}
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "15px",
              color: colors.ink,
              margin: "0 0 24px",
              lineHeight: "1.6",
            }}
          >
            Hi {handle}, here is your sign-in link. It expires in{" "}
            <strong>15 minutes</strong>.
          </Text>

          {/* CTA Button */}
          <Section style={{ marginBottom: "24px" }}>
            <Button
              href={link}
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
              Sign in to ashlr
            </Button>
          </Section>

          {/* Plain-text link fallback */}
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "13px",
              color: colors.muted,
              margin: "0 0 8px",
            }}
          >
            If the button does not work, copy and paste this link into your browser:
          </Text>
          <Text
            style={{
              fontFamily: "Courier New, Courier, monospace",
              fontSize: "12px",
              color: colors.accent,
              wordBreak: "break-all",
              margin: "0 0 24px",
            }}
          >
            <Link href={link} style={{ color: colors.accent }}>
              {link}
            </Link>
          </Text>

          <Hr style={{ borderColor: colors.border, margin: "0 0 20px" }} />

          {/* Security notice */}
          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "13px",
              color: colors.muted,
              margin: "0",
              lineHeight: "1.6",
            }}
          >
            If you did not request this link, you can safely ignore this email. No
            account changes will be made.
          </Text>
        </EmailBody>
        <EmailFooter />
      </EmailContainer>
    </EmailShell>
  );
}

// ---------------------------------------------------------------------------
// Plain-text fallback (used by sendEmail)
// ---------------------------------------------------------------------------

export function plainText({ email, link }: MagicLinkEmailProps): string {
  const handle = email.split("@")[0] ?? email;
  return [
    `Hi ${handle},`,
    ``,
    `Here is your ashlr sign-in link:`,
    ``,
    link,
    ``,
    `This link expires in 15 minutes.`,
    ``,
    `If you did not request this, you can safely ignore this email.`,
    ``,
    `--`,
    `ashlr · MIT-licensed plugin + proprietary hosted backend.`,
    `Manage preferences: https://plugin.ashlr.ai/preferences`,
  ].join("\n");
}
