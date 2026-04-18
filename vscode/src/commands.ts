import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";
import { execSync } from "child_process";
import {
  readStats,
  aggregateSessions,
  fmtTokens,
  fmtCost,
  bestDay,
  projectedAnnual,
  resolveStatsPath,
} from "./stats-reader";

// ---------------------------------------------------------------------------
// Show Dashboard — handled by DashboardWebviewProvider; command is wired in
// extension.ts. This file handles the remaining four commands.
// ---------------------------------------------------------------------------

/** ashlr: Open Genome Folder */
export async function cmdOpenGenomeFolder() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) {
    vscode.window.showWarningMessage("ashlr: No workspace folder open.");
    return;
  }

  const root = folders[0].uri.fsPath;
  const genomePath = path.join(root, ".ashlrcode", "genome");

  if (!fs.existsSync(genomePath)) {
    const create = await vscode.window.showInformationMessage(
      `ashlr: .ashlrcode/genome/ does not exist in this workspace. Create it?`,
      "Create",
      "Cancel"
    );
    if (create === "Create") {
      fs.mkdirSync(genomePath, { recursive: true });
      // drop a placeholder
      fs.writeFileSync(
        path.join(genomePath, ".gitkeep"),
        "# ashlr genome — run ashlr__genome_propose to populate\n"
      );
    } else {
      return;
    }
  }

  await vscode.commands.executeCommand(
    "revealInExplorer",
    vscode.Uri.file(genomePath)
  );
}

/** ashlr: Run Benchmark */
export async function cmdRunBenchmark() {
  // Find the ashlr-plugin root: walk up from workspace root or use known path
  const pluginRoot = findPluginRoot();
  if (!pluginRoot) {
    vscode.window.showErrorMessage(
      "ashlr: Could not locate the ashlr-plugin directory. " +
        "Open the plugin repo or set the workspace root to it."
    );
    return;
  }

  const benchScript = path.join(pluginRoot, "scripts", "run-benchmark.ts");
  if (!fs.existsSync(benchScript)) {
    vscode.window.showErrorMessage(
      `ashlr: Benchmark script not found at ${benchScript}`
    );
    return;
  }

  const terminal = vscode.window.createTerminal({
    name: "ashlr benchmark",
    cwd: pluginRoot,
  });
  terminal.show();
  terminal.sendText(`bun run ${benchScript}`);
}

/** ashlr: Show Savings */
export async function cmdShowSavings() {
  const stats = readStats();
  if (!stats) {
    vscode.window.showInformationMessage(
      "ashlr: No savings data found. Run some ashlr tool calls first."
    );
    return;
  }

  const session = aggregateSessions(stats);
  const lifetime = stats.lifetime;
  const bd = bestDay(stats);
  const annual = projectedAnnual(stats);

  const claudeRunning = isClaudeAvailable();

  const lines = [
    `ashlr savings summary`,
    ``,
    `Status:     ${claudeRunning ? "claude CLI detected" : "claude CLI not found"}`,
    ``,
    `Session`,
    `  calls:        ${session.calls}`,
    `  tokens saved: ${fmtTokens(session.tokensSaved)}`,
    ``,
    `Lifetime`,
    `  calls:        ${lifetime?.calls ?? 0}`,
    `  tokens saved: ${fmtTokens(lifetime?.tokensSaved ?? 0)}`,
    `  cost saved:   ${fmtCost(lifetime?.tokensSaved ?? 0)}`,
    ``,
    bd
      ? `Best day:     ${bd.date}  (${fmtTokens(bd.tokensSaved)} tokens)`
      : `Best day:     —`,
    ``,
    annual > 0
      ? `Projected annual: ${fmtTokens(annual)} tokens  (~${fmtCost(annual)})`
      : `Projected annual: not enough data yet`,
    ``,
    `Stats file:   ${resolveStatsPath()}`,
    ``,
    `Full dashboard: https://plugin.ashlr.ai/dashboard`,
  ];

  const panel = vscode.window.createWebviewPanel(
    "ashlrSavings",
    "ashlr savings",
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  panel.webview.html = buildSavingsHtml(lines.join("\n"));
}

/** ashlr: Sign in to Pro */
export async function cmdSignInToPro() {
  await vscode.env.openExternal(
    vscode.Uri.parse("https://plugin.ashlr.ai/signin")
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findPluginRoot(): string | null {
  // Check if workspace root contains the plugin markers
  const folders = vscode.workspace.workspaceFolders;
  if (folders?.length) {
    for (const folder of folders) {
      const p = folder.uri.fsPath;
      if (fs.existsSync(path.join(p, "servers", "_stats.ts"))) return p;
    }
  }
  // Check the extension's own parent (works when running from the repo)
  return null;
}

function isClaudeAvailable(): boolean {
  try {
    execSync("which claude", { stdio: "ignore", timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function buildSavingsHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <style>
    body {
      font-family: "JetBrains Mono", "Fira Mono", monospace;
      font-size: 13px;
      background: #faf8f2;
      color: #2c2824;
      padding: 2rem;
      line-height: 1.6;
    }
    pre { white-space: pre-wrap; word-break: break-word; }
    a { color: #00a878; }
  </style>
</head>
<body>
  <pre>${escaped}</pre>
</body>
</html>`;
}
