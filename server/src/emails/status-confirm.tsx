/**
 * status-confirm.tsx — Status page subscription confirmation email.
 *
 * Subject: "Confirm your ashlr status updates subscription"
 * Props: { confirmLink, unsubscribeLink }
 */

import { Button, Link, Section, Text, Hr } from "@react-email/components";
import * as React from "react";
import {
  EmailShell,
  EmailContainer,
  EmailHeader,
  EmailBody,
  EmailFooter,
  colors,
  fonts,
} from "./shared.js";

export interface StatusConfirmEmailProps {
  confirmLink: string;
  unsubscribeLink: string;
}

export const subject = "Confirm your ashlr status updates subscription";

export default function StatusConfirmEmail({
  confirmLink,
  unsubscribeLink,
}: StatusConfirmEmailProps): React.JSX.Element {
  return (
    <EmailShell previewText="One click to confirm — you will be notified when ashlr services have an incident.">
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
            Confirm status updates
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
            Click below to confirm your subscription to ashlr service status
            updates. You will receive an email when an incident is opened,
            updated, or resolved.
          </Text>

          <Section style={{ marginBottom: "24px" }}>
            <Button
              href={confirmLink}
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
              Confirm subscription
            </Button>
          </Section>

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "13px",
              color: colors.muted,
              margin: "0 0 8px",
            }}
          >
            If the button does not work, copy and paste this link:
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
            <Link href={confirmLink} style={{ color: colors.accent }}>
              {confirmLink}
            </Link>
          </Text>

          <Hr style={{ borderColor: colors.border, margin: "0 0 20px" }} />

          <Text
            style={{
              fontFamily: fonts.body,
              fontSize: "13px",
              color: colors.muted,
              margin: "0",
              lineHeight: "1.6",
            }}
          >
            Did not request this? You can safely ignore this email. No
            subscription will be created.{" "}
            <Link href={unsubscribeLink} style={{ color: colors.muted }}>
              Unsubscribe immediately.
            </Link>
          </Text>
        </EmailBody>
        <EmailFooter />
      </EmailContainer>
    </EmailShell>
  );
}

export function plainText({
  confirmLink,
  unsubscribeLink,
}: StatusConfirmEmailProps): string {
  return [
    `Confirm your ashlr status updates subscription`,
    ``,
    `Click the link below to confirm. You will be notified when ashlr`,
    `services have an incident.`,
    ``,
    confirmLink,
    ``,
    `Did not request this? Ignore this email or unsubscribe:`,
    unsubscribeLink,
    ``,
    `--`,
    `ashlr status · https://status.ashlr.ai`,
  ].join("\n");
}
