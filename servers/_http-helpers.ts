/**
 * Shared HTTP helpers used by both ashlr-http and ashlr-webfetch servers.
 * Extracted here so webfetch-server.ts can import without triggering
 * http-server's top-level `await server.connect(transport)`.
 */

// ---------- safety ----------

export function isPrivateHost(host: string): boolean {
  if (process.env.ASHLR_HTTP_ALLOW_PRIVATE === "1") return false;
  const h = host.toLowerCase();
  if (h === "localhost" || h === "::1" || h.endsWith(".localhost")) return true;
  const v4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (v4) {
    const [a, b] = [parseInt(v4[1]!, 10), parseInt(v4[2]!, 10)];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

// ---------- HTML compressor ----------

export function compressHtml(raw: string): string {
  let s = raw;
  s = s.replace(/<script[\s\S]*?<\/script>/gi, "");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, "");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, "");
  s = s.replace(/<(nav|footer|aside|header|form)[^>]*>[\s\S]*?<\/\1>/gi, "");
  const mainMatch = s.match(/<(main|article)\b[^>]*>([\s\S]*?)<\/\1>/i);
  if (mainMatch) s = mainMatch[2]!;
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, lvl, t) => "\n" + "#".repeat(+lvl) + " " + stripTags(t) + "\n");
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, t) => "• " + stripTags(t) + "\n");
  s = s.replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => stripTags(t) + ` (${href})`);
  s = s.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_, t) => "\n```\n" + decodeEntities(stripTags(t)) + "\n```\n");
  s = s.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_, t) => "`" + stripTags(t) + "`");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<p[^>]*>/gi, "\n");
  s = s.replace(/<\/p>/gi, "\n");
  s = stripTags(s);
  s = decodeEntities(s);
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
}

// ---------- JSON compressor ----------

export function compressJson(raw: string): string {
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(elideLongArrays(obj), null, 2);
  } catch {
    return raw;
  }
}

function elideLongArrays(v: any): any {
  if (Array.isArray(v)) {
    if (v.length > 20) {
      const head = v.slice(0, 10).map(elideLongArrays);
      const tail = v.slice(-5).map(elideLongArrays);
      return [...head, `[... ${v.length - 15} elided ...]`, ...tail];
    }
    return v.map(elideLongArrays);
  }
  if (v && typeof v === "object") {
    const o: any = {};
    for (const [k, val] of Object.entries(v)) {
      if (typeof val === "string" && val.length > 300) {
        o[k] = val.slice(0, 280) + "…";
      } else {
        o[k] = elideLongArrays(val);
      }
    }
    return o;
  }
  return v;
}
