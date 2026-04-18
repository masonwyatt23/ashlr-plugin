import * as vscode from "vscode";
import * as fs from "fs";

/**
 * Gutter decorations that show a savings estimate badge next to any line in
 * the active editor that references an ashlr Read/Edit/Grep tool call pattern.
 *
 * Patterns matched (case-insensitive):
 *   - ashlr__read, ashlr__edit, ashlr__grep in string literals or comments
 *   - Read(  /  Edit(   in TypeScript/Python tool-call contexts (heuristic)
 *
 * Token savings are estimated from the file size of the referenced path when
 * one can be extracted, otherwise a fixed 500-token hint is shown.
 */

// Average bytes per token (rough Claude tokenizer approximation)
const BYTES_PER_TOKEN = 4;
// Fraction of tokens typically saved by routing through ashlr
const SAVINGS_FRACTION = 0.55;

const DECORATION_TYPE = vscode.window.createTextEditorDecorationType({
  after: {
    color: new vscode.ThemeColor("editorCodeLens.foreground"),
    fontStyle: "italic",
    margin: "0 0 0 1.5em",
  },
  isWholeLine: false,
  rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
});

// Patterns that indicate an ashlr-relevant call on a line
const TOOL_PATTERNS = [
  /ashlr__read/i,
  /ashlr__edit/i,
  /ashlr__grep/i,
  /\bRead\s*\(/,
  /\bEdit\s*\(/,
];

// Try to extract a file path argument from the line
const PATH_PATTERN = /["'`]([^"'`]+\.[a-zA-Z]{1,6})["'`]/;

export class GutterDecorationProvider implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((e) => {
        if (e) this.decorate(e);
      }),
      vscode.workspace.onDidChangeTextDocument((e) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === e.document) {
          this.decorate(editor);
        }
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("ashlr.showGutterBadges")) {
          const editor = vscode.window.activeTextEditor;
          if (editor) this.decorate(editor);
        }
      })
    );

    // Decorate immediately
    if (vscode.window.activeTextEditor) {
      this.decorate(vscode.window.activeTextEditor);
    }
  }

  private isEnabled(): boolean {
    return vscode.workspace.getConfiguration("ashlr").get("showGutterBadges") ?? true;
  }

  decorate(editor: vscode.TextEditor) {
    if (!this.isEnabled()) {
      editor.setDecorations(DECORATION_TYPE, []);
      return;
    }

    const doc = editor.document;
    const decorations: vscode.DecorationOptions[] = [];

    for (let i = 0; i < doc.lineCount; i++) {
      const line = doc.lineAt(i);
      const text = line.text;

      const matched = TOOL_PATTERNS.some((p) => p.test(text));
      if (!matched) continue;

      const savedTokens = estimateSavings(text, doc.uri.fsPath);
      if (savedTokens <= 0) continue;

      const range = new vscode.Range(i, line.text.length, i, line.text.length);
      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `  ~${formatTokens(savedTokens)} tokens saved via ashlr`,
          },
        },
      });
    }

    editor.setDecorations(DECORATION_TYPE, decorations);
  }

  dispose() {
    DECORATION_TYPE.dispose();
    this.disposables.forEach((d) => d.dispose());
  }
}

function estimateSavings(lineText: string, editorPath: string): number {
  // Try to find a file path in the line arguments
  const pathMatch = PATH_PATTERN.exec(lineText);
  if (pathMatch) {
    const candidate = pathMatch[1];
    // Resolve relative to the editor's directory
    const dir = require("path").dirname(editorPath);
    const abs = require("path").isAbsolute(candidate)
      ? candidate
      : require("path").join(dir, candidate);
    try {
      if (fs.existsSync(abs)) {
        const bytes = fs.statSync(abs).size;
        const tokens = Math.round(bytes / BYTES_PER_TOKEN);
        return Math.round(tokens * SAVINGS_FRACTION);
      }
    } catch {
      // ignore
    }
  }
  // Fallback hint: 500 tokens (typical small file)
  return 500;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}
