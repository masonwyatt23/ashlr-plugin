/**
 * shared.tsx — Design tokens and layout components used across all email templates.
 */

import {
  Body,
  Container,
  Font,
  Head,
  Html,
  Preview,
  Section,
  Text,
  Hr,
  Link,
} from "@react-email/components";
import * as React from "react";

// ---------------------------------------------------------------------------
// Design tokens
// ---------------------------------------------------------------------------

export const colors = {
  paper:  "#F3EADB",
  ink:    "#121212",
  accent: "#8B2E1A",
  muted:  "#6B5B4E",
  border: "#D9CEBD",
  white:  "#FFFFFF",
};

export const fonts = {
  heading: "Fraunces, Georgia, 'Times New Roman', serif",
  body:    "'IBM Plex Sans', Helvetica, Arial, sans-serif",
};

// ---------------------------------------------------------------------------
// Logo — inline SVG as a React element rendered into a <td>
// ---------------------------------------------------------------------------

export function LogoSvg(): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 48"
      fill="none"
      width="120"
      height="29"
      aria-label="ashlr"
      role="img"
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#c2410c" />
          <stop offset="100%" stopColor="#8B2E1A" />
        </linearGradient>
      </defs>
      {/* Icon mark: ledger square */}
      <rect x="0" y="8" width="32" height="32" rx="6" fill="#1a0f0c" />
      <rect x="0.75" y="8.75" width="30.5" height="30.5" rx="5.5" fill="none" stroke="url(#logo-grad)" strokeOpacity="0.3" strokeWidth="1.5" />
      {/* Ledger lines */}
      <line x1="6" y1="18" x2="26" y2="18" stroke="url(#logo-grad)" strokeOpacity="0.4" strokeWidth="1" />
      <line x1="6" y1="24" x2="26" y2="24" stroke="url(#logo-grad)" strokeOpacity="0.55" strokeWidth="1" />
      <line x1="6" y1="30" x2="26" y2="30" stroke="url(#logo-grad)" strokeOpacity="0.7" strokeWidth="1" />
      {/* Brand square */}
      <rect x="6" y="10" width="7" height="7" fill="url(#logo-grad)" />
      {/* Row dots */}
      <circle cx="23" cy="24" r="2" fill="url(#logo-grad)" />
      <circle cx="23" cy="30" r="2" fill="url(#logo-grad)" opacity="0.65" />
      {/* Wordmark */}
      <text
        x="44"
        y="33"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontWeight="300"
        fontSize="28"
        letterSpacing="-0.5"
        fill="#F3EADB"
      >
        ashlr
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared wrappers
// ---------------------------------------------------------------------------

interface EmailShellProps {
  previewText: string;
  children: React.ReactNode;
}

export function EmailShell({ previewText, children }: EmailShellProps): React.JSX.Element {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <Font
          fontFamily="IBM Plex Sans"
          fallbackFontFamily="Helvetica"
          webFont={{
            url: "https://fonts.gstatic.com/s/ibmplexsans/v19/zYX9KVElMYYaJe8bpLHnCwDKjQ76AIFsdA.woff2",
            format: "woff2",
          }}
          fontWeight={400}
          fontStyle="normal"
        />
        <Font
          fontFamily="Fraunces"
          fallbackFontFamily="Georgia"
          webFont={{
            url: "https://fonts.gstatic.com/s/fraunces/v31/6NUh8FyLNQOQZAnv9bYEvDiIdE9Ea92uemAk_WBq8U_9v0c2Bg.woff2",
            format: "woff2",
          }}
          fontWeight={300}
          fontStyle="italic"
        />
      </Head>
      <Preview>{previewText}</Preview>
      <Body style={{ backgroundColor: colors.paper, margin: "0", padding: "0", fontFamily: fonts.body }}>
        {children}
      </Body>
    </Html>
  );
}

export function EmailContainer({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Container
      style={{
        maxWidth: "600px",
        margin: "0 auto",
        backgroundColor: colors.white,
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
      }}
    >
      {children}
    </Container>
  );
}

export function EmailHeader(): React.JSX.Element {
  return (
    <Section
      style={{
        backgroundColor: "#1a0f0c",
        padding: "20px 32px",
      }}
    >
      <LogoSvg />
    </Section>
  );
}

export function EmailFooter(): React.JSX.Element {
  return (
    <>
      <Hr style={{ borderColor: colors.border, margin: "0" }} />
      <Section style={{ padding: "20px 32px", backgroundColor: colors.paper }}>
        <Text
          style={{
            fontFamily: fonts.body,
            fontSize: "11px",
            color: colors.muted,
            margin: "0",
            lineHeight: "1.6",
          }}
        >
          ashlr &middot; MIT-licensed plugin + proprietary hosted backend.{" "}
          <Link
            href="https://plugin.ashlr.ai/preferences"
            style={{ color: colors.muted, textDecoration: "underline" }}
          >
            Manage preferences
          </Link>
        </Text>
      </Section>
    </>
  );
}

export function EmailBody({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <Section style={{ padding: "32px 32px 24px" }}>
      {children}
    </Section>
  );
}
