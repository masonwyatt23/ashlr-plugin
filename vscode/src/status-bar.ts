import * as vscode from "vscode";
import { readStats, aggregateSessions, fmtTokens } from "./stats-reader";

/**
 * Status bar item that shows ashlr session + lifetime savings.
 * Polls stats.json every `ashlr.pollIntervalMs` milliseconds.
 *
 * Display format: "ashlr · session +N · lifetime +M"
 * Clicking opens the ashlr dashboard webview.
 */
export class AshlrStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | null = null;
  private claudeRunning = false;

  constructor(private readonly showDashboardCmd: string) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      // priority: place near the right edge, after language selector
      90
    );
    this.item.command = showDashboardCmd;
    this.item.tooltip = "ashlr — click to open savings dashboard";
    this.item.show();
    this.refresh();
    this.startPolling();
  }

  private getInterval(): number {
    const cfg = vscode.workspace.getConfiguration("ashlr");
    const ms: number = cfg.get("pollIntervalMs") ?? 2000;
    return Math.max(500, ms);
  }

  private startPolling() {
    this.timer = setInterval(() => this.refresh(), this.getInterval());
    // Re-start timer when configuration changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("ashlr.pollIntervalMs")) {
        this.stopPolling();
        this.startPolling();
      }
    });
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  setClaudeStatus(running: boolean) {
    this.claudeRunning = running;
    this.refresh();
  }

  refresh() {
    const stats = readStats();
    if (!stats) {
      this.item.text = "ashlr · not running";
      this.item.color = new vscode.ThemeColor("statusBarItem.warningForeground");
      return;
    }

    const session = aggregateSessions(stats);
    const lifetime = stats.lifetime;

    const sessionTok = fmtTokens(session.tokensSaved);
    const lifetimeTok = fmtTokens(lifetime?.tokensSaved ?? 0);

    this.item.text = `ashlr · session +${sessionTok} · lifetime +${lifetimeTok}`;
    this.item.color = undefined; // use default status bar foreground
    this.item.tooltip = this.claudeRunning
      ? "ashlr — claude CLI detected · click to open dashboard"
      : "ashlr — click to open dashboard";
  }

  dispose() {
    this.stopPolling();
    this.item.dispose();
  }
}
