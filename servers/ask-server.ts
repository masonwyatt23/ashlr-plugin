#!/usr/bin/env bun
/**
 * ashlr-ask MCP server.
 *
 * Exposes a single tool (ashlr__ask) that accepts a natural-language question
 * and routes it to the correct underlying ashlr tool via deterministic rules —
 * no LLM involved in routing.
 *
 * Routing table (first match wins):
 *  1. glob token (e.g. **\/*.ts)          → ashlr__glob
 *  2. read/show-me/file + path token      → ashlr__read
 *  3. grep/find/search/where-is/which     → ashlr__grep
 *  4. structural (how does/explain/why)   → ashlr__orient
 *  5. list/tree/structure/directory       → ashlr__tree
 *  fallback                               → ashlr__orient
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { logEvent } from "./_events";
import { ashlrRead, ashlrGrep } from "./efficiency-server";
import { orient, extractKeywords } from "./orient-server";
import { ashlrTree } from "./tree-server";
import { ashlrGlob } from "./glob-server";

// Re-export for tests
export { extractKeywords };

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

export type RoutedTool = "ashlr__read" | "ashlr__grep" | "ashlr__orient" | "ashlr__tree" | "ashlr__glob";

export interface RouteDecision {
  tool: RoutedTool;
  reason: string;
  /** Extracted value used for the underlying call (path, keyword, pattern). */
  extracted?: string;
}

/** Glob-shaped token: contains * or ? and looks like a file pattern. */
const GLOB_RE = /(?:^|\s)((?:\*\*\/|[\w.\-]+\/)*[\w.*?\-]+\*[\w.*?\-/]*|[\w.*?\-/]*\*[\w.*?\-/]*\.[\w]+)(?:\s|$)/;

/** Path-like token: starts with / or ./ or contains a file extension, or is a dotfile like .env */
const PATH_RE = /(?:^|\s)((?:\/|\.\/|~\/|[\w\-]+\/)+[\w.\-]+|\.[\w]+|[\w\-]+\.(?:ts|js|tsx|jsx|py|go|rs|rb|java|md|json|yaml|yml|sh|toml|lock|txt|env|sql|graphql|proto|css|html|xml))(?:\s|$)/;

const READ_VERBS_RE = /\b(read|show\s+me|what'?s?\s+in|contents?\s+of|display|print|open)\b/i;
const GREP_VERBS_RE = /^(grep|find|search|where\s+is|where\s+are|which\s+file|look\s+for|locate)\b/i;
const STRUCTURAL_RE = /\b(how\s+does|how\s+do(?:es)?\s+we|explain|walk\s+me\s+through|why\s+does|how\s+is|what\s+is\s+the\s+(?:flow|pattern|architecture)|how\s+(?:does|do|is|are)\s+(?:the\s+)?(?:\w+\s+){0,3}work)\b/i;
const TREE_VERBS_RE = /\b(list|show|tree|structure|directory|layout|overview|scaffold|outline)\b/i;

export function routeQuestion(question: string): RouteDecision {
  const q = question.trim();

  // 1. Glob-shaped token — highest priority so "find **/*.ts" → glob, not grep.
  const globMatch = GLOB_RE.exec(q);
  if (globMatch) {
    return { tool: "ashlr__glob", reason: "glob-pattern token", extracted: globMatch[1]!.trim() };
  }

  // 2. Read verbs + path token.
  if (READ_VERBS_RE.test(q)) {
    const pathMatch = PATH_RE.exec(q);
    if (pathMatch) {
      return { tool: "ashlr__read", reason: "read verb + path token", extracted: pathMatch[1]!.trim() };
    }
  }

  // 3. Grep/search verbs (anchored at start for precision).
  if (GREP_VERBS_RE.test(q)) {
    const keywords = extractKeywords(q);
    const kw = keywords[0] ?? q.split(/\s+/).slice(1, 3).join(" ");
    return { tool: "ashlr__grep", reason: "search verb", extracted: kw };
  }

  // 4. Structural / explanatory questions.
  if (STRUCTURAL_RE.test(q)) {
    return { tool: "ashlr__orient", reason: "structural query" };
  }

  // 5. List/tree/structure with no specific pattern.
  if (TREE_VERBS_RE.test(q) && !PATH_RE.test(q)) {
    return { tool: "ashlr__tree", reason: "structural listing request" };
  }

  // Fallback: orient handles multi-file synthesis best.
  return { tool: "ashlr__orient", reason: "fallback — no rule matched" };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export async function askHandler(input: { question: string; cwd?: string }): Promise<string> {
  const { question, cwd } = input;
  const decision = routeQuestion(question);

  // Log the routing decision for /ashlr-usage analytics.
  await logEvent("tool_call", {
    tool: "ashlr__ask",
    reason: `routed-to=${decision.tool}`,
    extra: { routeReason: decision.reason, extracted: decision.extracted ?? null },
  });

  const trace = `[ashlr__ask] routed to ${decision.tool} (${decision.reason})`;

  let result: string;
  switch (decision.tool) {
    case "ashlr__read": {
      const path = decision.extracted ?? question;
      result = await ashlrRead({ path });
      break;
    }
    case "ashlr__grep": {
      const pattern = decision.extracted ?? question;
      result = await ashlrGrep({ pattern, cwd });
      break;
    }
    case "ashlr__orient": {
      const out = await orient({ query: question, dir: cwd });
      result = out.text;
      break;
    }
    case "ashlr__tree": {
      result = await ashlrTree({ path: cwd });
      break;
    }
    case "ashlr__glob": {
      const pattern = decision.extracted ?? question;
      result = await ashlrGlob({ pattern, cwd });
      break;
    }
    default: {
      const out = await orient({ query: question, dir: cwd });
      result = out.text;
    }
  }

  return `${trace}\n${result}`;
}

// ---------------------------------------------------------------------------
// MCP server wiring
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "ashlr-ask", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "ashlr__ask",
      description:
        "Single-tool entry point for ashlr. Accepts a natural-language question and " +
        "auto-routes to the correct underlying tool (ashlr__read, ashlr__grep, " +
        "ashlr__orient, ashlr__tree, or ashlr__glob) using deterministic rules — no " +
        "LLM in the routing step. Output always starts with a one-line trace showing " +
        "which tool fired and why.",
      inputSchema: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "Natural-language question about the codebase",
          },
          cwd: {
            type: "string",
            description: "Working directory context (default: process.cwd())",
          },
        },
        required: ["question"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  try {
    if (name !== "ashlr__ask") {
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    }
    const a = (args ?? {}) as { question?: string; cwd?: string };
    const text = await askHandler({
      question: typeof a.question === "string" ? a.question : "",
      cwd: typeof a.cwd === "string" ? a.cwd : undefined,
    });
    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `ashlr__ask error: ${message}` }], isError: true };
  }
});

if (import.meta.main) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
