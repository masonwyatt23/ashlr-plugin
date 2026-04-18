/**
 * rss.xml/route.ts — RSS 2.0 feed for last-30-days incidents.
 *
 * Served at /status/rss.xml on the status subdomain.
 * No auth required.
 */

export const dynamic = "force-dynamic";

const API_BASE      = process.env["API_BASE_URL"]  ?? "https://api.ashlr.ai";
const STATUS_BASE   = process.env["STATUS_BASE_URL"] ?? "https://status.ashlr.ai";

interface IncidentSummary {
  id: string;
  title: string;
  status: string;
  affectedComponents: string[];
  createdAt: string;
  resolvedAt: string | null;
  body: string;
}

interface CurrentResponse {
  recentIncidents: IncidentSummary[];
  generatedAt: string;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildRss(incidents: IncidentSummary[], generatedAt: string): string {
  const items = incidents
    .map((inc) => {
      const components = inc.affectedComponents.length
        ? `Affected: ${inc.affectedComponents.join(", ")}. `
        : "";
      const resolution = inc.resolvedAt
        ? `Resolved at ${new Date(inc.resolvedAt).toUTCString()}.`
        : "Ongoing.";
      const description = escapeXml(
        `${components}${inc.body ? inc.body + " " : ""}${resolution}`,
      );
      return `
    <item>
      <title>${escapeXml(`[${inc.status.toUpperCase()}] ${inc.title}`)}</title>
      <link>${STATUS_BASE}/status/${inc.id}</link>
      <guid isPermaLink="true">${STATUS_BASE}/status/${inc.id}</guid>
      <pubDate>${new Date(inc.createdAt).toUTCString()}</pubDate>
      <description>${description}</description>
    </item>`.trim();
    })
    .join("\n    ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ashlr System Status</title>
    <link>${STATUS_BASE}</link>
    <description>Status updates and incident reports for ashlr services.</description>
    <language>en</language>
    <lastBuildDate>${new Date(generatedAt).toUTCString()}</lastBuildDate>
    <atom:link href="${STATUS_BASE}/status/rss.xml" rel="self" type="application/rss+xml"/>
    ${items}
  </channel>
</rss>`;
}

export async function GET(): Promise<Response> {
  let incidents: IncidentSummary[] = [];
  let generatedAt = new Date().toISOString();

  try {
    const res = await fetch(`${API_BASE}/status/current`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = (await res.json()) as CurrentResponse;
      incidents   = data.recentIncidents ?? [];
      generatedAt = data.generatedAt ?? generatedAt;
    }
  } catch {
    // Return an empty-but-valid feed if API is unreachable
  }

  const xml = buildRss(incidents, generatedAt);

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
    },
  });
}
