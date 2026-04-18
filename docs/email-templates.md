# ashlr email templates

React-email templates for all transactional emails sent by the ashlr backend.

## Preview server

Start a local preview server on port 3333:

```
bun run server/src/emails/preview.ts
```

Then open http://localhost:3333 to browse all templates. Each template is rendered with realistic sample data. The preview server does not require `RESEND_API_KEY`.

Individual template URLs:

| Template | URL |
|---|---|
| magic-link | http://localhost:3333/preview/magic-link |
| welcome | http://localhost:3333/preview/welcome |
| payment-success | http://localhost:3333/preview/payment-success |
| payment-failed | http://localhost:3333/preview/payment-failed |
| subscription-canceled | http://localhost:3333/preview/subscription-canceled |
| daily-cap-reached | http://localhost:3333/preview/daily-cap-reached |

Or via the npm script alias:

```
cd server && bun run email:preview
```

## Templates

### magic-link

**Subject:** Your ashlr sign-in link  
**Trigger:** `POST /auth/send`  
**Props:** `{ email: string, link: string }`

Sign-in magic link. Greets the user by the local part of their email address, provides a prominent CTA button, includes the raw link in plain text below the button for accessibility, and notes the 15-minute expiration. Security notice at the bottom.

### welcome

**Subject:** Welcome to ashlr · your first steps  
**Trigger:** `checkout.session.completed` (sent alongside payment-success)  
**Props:** `{ email: string }`

Onboarding email. Three numbered steps: run `/ashlr-tour`, set up `ASHLR_PRO_TOKEN`, open `/ashlr-dashboard`. Links to docs, GitHub, and pricing.

### payment-success

**Subject:** ashlr Pro — you're in  
**Trigger:** `checkout.session.completed`  
**Props:** `{ email: string, amount: number, tier: string, renewsOn: string }`

Subscription confirmation. Receipt table with plan, amount charged (formatted as `$X.XX`), and renewal date. Links to dashboard and billing portal.

### payment-failed

**Subject:** ashlr Pro — payment failed, we'll retry  
**Trigger:** `invoice.payment_failed`  
**Props:** `{ email: string, gracePeriodEnd: string }`

Payment failure notice. Explains the 7-day grace period, shows the exact date access expires if unresolved, provides a CTA to update the payment method in the Stripe billing portal.

### subscription-canceled

**Subject:** ashlr Pro — your subscription has ended  
**Trigger:** `customer.subscription.deleted`  
**Props:** `{ email: string }`

Cancellation confirmation. Clearly states that local-first features (genome init, token savings, slash commands, full CLI) remain free forever. Lists the Pro-only features that have been disabled: genome sync across machines and cloud LLM summarization. CTA to resubscribe.

### daily-cap-reached

**Subject:** ashlr Pro — daily LLM cap reached  
**Trigger:** first `POST /llm/summarize` that returns 429 for a given user on a given UTC day  
**Props:** `{ email: string }`

Throttled notification (once per user per day via `daily_cap_notifications` table). Shows the 1,000-call / $1.00 cap, the midnight UTC reset time, and a link to Enterprise pricing for higher limits. Local features are explicitly noted as unaffected.

## Design system

| Token | Value |
|---|---|
| Paper (background) | `#F3EADB` |
| Ink (text) | `#121212` |
| Accent (CTA, links) | `#8B2E1A` |
| Muted (secondary text) | `#6B5B4E` |
| Border | `#D9CEBD` |

Fonts: Fraunces italic (headings, loaded via Google Fonts woff2), IBM Plex Sans (body). Web-safe fallbacks: Georgia, Helvetica, Arial.

Container: 600px centered, white background, 8px border-radius, parchment outer background. Mobile-responsive via `maxWidth: 600px`.

## Sending integration

All sends go through `server/src/lib/email.ts`:

```ts
await sendEmail("magic-link", { to: email, data: { email, link } });
```

The function renders the React template to HTML + plain text, then calls Resend. If `RESEND_API_KEY` is unset or `TESTING=1`, it logs the rendered output to stderr instead.

## Email client compatibility notes

- **Gmail**: strips `<style>` blocks in `<head>`. All styles are inline via react-email's built-in inline style props, so Gmail renders correctly.
- **Outlook (Windows)**: does not support border-radius, box-shadow, or `display: inline-block` on buttons reliably. The CTA button degrades to a plain rectangular block — still functional. The plain-text link below the button ensures access regardless.
- **Outlook (Windows)**: does not render SVG in `<img>` tags. The logo SVG is embedded inline (not via `<img src="...svg">`), which renders correctly in Gmail and Apple Mail. In Outlook on Windows the inline SVG is ignored; the `aria-label="ashlr"` on the SVG provides accessible fallback text.
- **Apple Mail**: full support for inline SVG, web fonts, and CSS. All templates render as designed.
- **Dark mode**: templates use a white card on parchment background. Email clients that invert colors in dark mode (Apple Mail, some Android clients) may adjust the outer background; the inner card remains readable due to explicit background-color declarations on all sections.
- **Plain-text fallback**: every template exports a `plainText()` function. The Resend send includes both `html` and `text` fields, so clients that strip HTML receive the plain-text version.
