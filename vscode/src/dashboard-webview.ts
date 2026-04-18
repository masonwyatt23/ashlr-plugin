import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  readStats,
  aggregateSessions,
  fmtTokens,
  fmtCost,
  bestDay,
  lastNDays,
  projectedAnnual,
} from "./stats-reader";
import type { StatsFile, ByTool } from "./types";

const VIEW_TYPE = "ashlrDashboard";

export class DashboardWebviewProvider implements vscode.Disposable {
  private panel: vscode.WebviewPanel | null = null;
  private readonly extensionUri: vscode.Uri;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(context: vscode.ExtensionContext) {
    this.extensionUri = context.extensionUri;
  }

  show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      VIEW_TYPE,
      "ashlr dashboard",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.extensionUri, "webview"),
          vscode.Uri.joinPath(this.extensionUri, "resources"),
        ],
        retainContextWhenHidden: true,
      }
    );

    this.panel.onDidDispose(() => {
      this.stopRefresh();
      this.panel = null;
    });

    this.renderPanel();
    this.startRefresh();
  }

  private startRefresh() {
    this.refreshTimer = setInterval(() => this.renderPanel(), 2000);
  }

  private stopRefresh() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private renderPanel() {
    if (!this.panel) return;
    const stats = readStats();
    this.panel.webview.html = buildHtml(stats, this.extensionUri, this.panel.webview);
  }

  dispose() {
    this.stopRefresh();
    this.panel?.dispose();
  }
}

// ---------------------------------------------------------------------------
// HTML generation
// ---------------------------------------------------------------------------

function buildHtml(
  stats: StatsFile | null,
  extensionUri: vscode.Uri,
  webview: vscode.Webview
): string {
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "resources", "dashboard.css")
  );
  const jsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, "webview", "dashboard.js")
  );

  const now = new Date().toLocaleString();

  if (!stats) {
    return wrapHtml(cssUri, jsUri, `
      <div class="empty-state">
        <h2>No savings data yet</h2>
        <p>Run a few ashlr tool calls in Claude Code or Cursor to start tracking savings.</p>
        <p>Haven't installed the plugin? Start at <a href="https://plugin.ashlr.ai" class="ext-link">plugin.ashlr.ai</a>.</p>
      </div>
    `, now);
  }

  const session = aggregateSessions(stats);
  const lifetime = stats.lifetime;
  const bd = bestDay(stats);
  const days7 = lastNDays(stats, 7);
  const days30 = lastNDays(stats, 30);
  const annual = projectedAnnual(stats);

  const heroTiles = `
    <div class="hero-grid">
      <div class="hero-tile">
        <div class="hero-label">This session</div>
        <div class="hero-value">${fmtTokens(session.tokensSaved)}</div>
        <div class="hero-sub">tokens saved</div>
      </div>
      <div class="hero-tile">
        <div class="hero-label">Lifetime</div>
        <div class="hero-value">${fmtTokens(lifetime?.tokensSaved ?? 0)}</div>
        <div class="hero-sub">${fmtCost(lifetime?.tokensSaved ?? 0)} saved</div>
      </div>
      <div class="hero-tile">
        <div class="hero-label">Best day</div>
        <div class="hero-value">${bd ? fmtTokens(bd.tokensSaved) : "—"}</div>
        <div class="hero-sub">${bd ? bd.date : "no data yet"}</div>
      </div>
    </div>
  `;

  const toolChart = buildToolChart(session.byTool);
  const sparkline7 = buildSparkline("7-day", days7);
  const sparkline30 = buildSparkline("30-day", days30);

  const projection = annual > 0
    ? `<div class="projection">
         Projected annual savings: <span class="projection-value">${fmtTokens(annual)} tokens</span>
         <span class="projection-cost">(~${fmtCost(annual)})</span>
       </div>`
    : "";

  const body = `
    ${heroTiles}
    <section class="section">
      <h3 class="section-title">Per-tool savings</h3>
      ${toolChart}
    </section>
    <section class="section sparklines">
      ${sparkline7}
      ${sparkline30}
    </section>
    ${projection}
    <div class="footer-link">
      <a href="https://plugin.ashlr.ai/dashboard" class="ext-link">Open full dashboard</a>
    </div>
  `;

  return wrapHtml(cssUri, jsUri, body, now);
}

function wrapHtml(
  cssUri: vscode.Uri,
  jsUri: vscode.Uri,
  body: string,
  timestamp: string
): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cssUri} 'unsafe-inline'; script-src ${jsUri}; img-src data:; connect-src https://plugin.ashlr.ai;">
  <link rel="stylesheet" href="${cssUri}">
  <title>ashlr dashboard</title>
</head>
<body>
  <header class="header">
    <span class="header-title">ashlr dashboard</span>
    <span class="header-ts">${timestamp}</span>
  </header>
  <main class="main">
    ${body}
  </main>
  <script src="${jsUri}"></script>
</body>
</html>`;
}

function buildToolChart(byTool: ByTool): string {
  const entries = Object.entries(byTool)
    .filter(([, v]) => v.tokensSaved > 0)
    .sort((a, b) => b[1].tokensSaved - a[1].tokensSaved)
    .slice(0, 8);

  if (!entries.length) return `<p class="empty-note">No tool data yet.</p>`;

  const max = entries[0][1].tokensSaved;

  const rows = entries.map(([tool, v]) => {
    const pct = max > 0 ? Math.round((v.tokensSaved / max) * 100) : 0;
    const label = tool.replace("ashlr__", "");
    return `
      <div class="bar-row">
        <div class="bar-label">${label}</div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${pct}%"></div>
        </div>
        <div class="bar-value">${fmtTokens(v.tokensSaved)}</div>
      </div>`;
  });

  return `<div class="bar-chart">${rows.join("")}</div>`;
}

function buildSparkline(label: string, values: number[]): string {
  const max = Math.max(...values, 1);
  const h = 40;
  const w = 14;
  const gap = 3;
  const totalW = values.length * (w + gap) - gap;

  const rects = values.map((v, i) => {
    const barH = Math.round((v / max) * h);
    const x = i * (w + gap);
    const y = h - barH;
    const opacity = v > 0 ? 0.8 : 0.2;
    return `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(barH, 1)}" rx="2" fill="var(--brand)" opacity="${opacity}"/>`;
  });

  return `
    <div class="sparkline">
      <div class="sparkline-label">${label}</div>
      <svg viewBox="0 0 ${totalW} ${h}" width="${totalW}" height="${h}" class="sparkline-svg">
        ${rects.join("")}
      </svg>
    </div>`;
}
