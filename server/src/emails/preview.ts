/**
 * preview.ts — Local email preview server on :3333.
 *
 * Usage:
 *   bun run server/src/emails/preview.ts
 *
 * Lists all templates at / and renders each at /preview/:name.
 */

import { render } from "@react-email/render";
import * as React from "react";

import MagicLinkEmail       from "./magic-link.js";
import WelcomeEmail         from "./welcome.js";
import PaymentSuccessEmail  from "./payment-success.js";
import PaymentFailedEmail   from "./payment-failed.js";
import SubscriptionCanceledEmail from "./subscription-canceled.js";
import DailyCapReachedEmail from "./daily-cap-reached.js";

const PORT = 3333;

// ---------------------------------------------------------------------------
// Sample data for each template
// ---------------------------------------------------------------------------

const samples: Record<string, () => React.ReactElement> = {
  "magic-link": () =>
    React.createElement(MagicLinkEmail, {
      email: "mason@evero-consulting.com",
      link:  "https://plugin.ashlr.ai/signin/verify?token=abc123def456",
    }),
  "welcome": () =>
    React.createElement(WelcomeEmail, {
      email: "mason@evero-consulting.com",
    }),
  "payment-success": () =>
    React.createElement(PaymentSuccessEmail, {
      email:    "mason@evero-consulting.com",
      amount:   1200,
      tier:     "pro",
      renewsOn: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  "payment-failed": () =>
    React.createElement(PaymentFailedEmail, {
      email:          "mason@evero-consulting.com",
      gracePeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }),
  "subscription-canceled": () =>
    React.createElement(SubscriptionCanceledEmail, {
      email: "mason@evero-consulting.com",
    }),
  "daily-cap-reached": () =>
    React.createElement(DailyCapReachedEmail, {
      email: "mason@evero-consulting.com",
    }),
};

const names = Object.keys(samples);

// ---------------------------------------------------------------------------
// Request handler
// ---------------------------------------------------------------------------

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Index page
  if (url.pathname === "/" || url.pathname === "") {
    const links = names
      .map((n) => `<li><a href="/preview/${n}" style="color:#8B2E1A">${n}</a></li>`)
      .join("\n");
    return new Response(
      `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
      <title>ashlr email preview</title>
      <style>
        body { font-family: 'IBM Plex Sans', Helvetica, sans-serif; background: #F3EADB;
               padding: 40px; color: #121212; }
        h1 { font-family: Georgia, serif; font-style: italic; font-weight: 300; }
        ul { line-height: 2; }
      </style>
      </head><body>
      <h1>ashlr email templates</h1>
      <p>Click a template to preview:</p>
      <ul>${links}</ul>
      </body></html>`,
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  // Template preview
  const match = url.pathname.match(/^\/preview\/(.+)$/);
  if (match) {
    const name = match[1]!;
    const factory = samples[name];
    if (!factory) {
      return new Response("Template not found", { status: 404 });
    }
    try {
      const html = await render(factory());
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
    } catch (err) {
      return new Response(`Render error: ${String(err)}`, { status: 500 });
    }
  }

  return new Response("Not found", { status: 404 });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = Bun.serve({
  port: PORT,
  fetch: handleRequest,
});

console.log(`ashlr email preview server running at http://localhost:${server.port}`);
console.log(`Templates: ${names.join(", ")}`);
