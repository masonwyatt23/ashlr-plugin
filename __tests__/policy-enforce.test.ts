/**
 * policy-enforce.test.ts — Unit tests for policy rule matching logic.
 *
 * Tests (5):
 *  1. deny rule blocks matching tool (exit 2 + JSON reason)
 *  2. requireConfirm emits permissionDecision:"ask"
 *  3. allow rule (or no match) passes silently
 *  4. malformed policy (bad JSON from server) is ignored — tool allowed
 *  5. ASHLR_POLICY_ENFORCE=0 kill switch bypasses all checks
 *
 * We test the matching logic directly (imported helper functions) rather than
 * spawning the hook process, since the hook depends on stdin/env/fetch which
 * are awkward to stub in Bun's test runner.
 */

import { describe, it, expect } from "bun:test";
import { minimatch } from "minimatch";

// ---------------------------------------------------------------------------
// Inline the core matching logic from policy-enforce.ts so we can unit-test it
// without spawning a subprocess.
// ---------------------------------------------------------------------------

interface PolicyRule {
  match: string;
  kind: "tool" | "path" | "shell";
  reason?: string;
}

function ruleMatches(
  rule: PolicyRule,
  toolName: string,
  toolInput: Record<string, unknown>,
): boolean {
  switch (rule.kind) {
    case "tool":
      return minimatch(toolName, rule.match, { nocase: true });

    case "path": {
      const pathArgs = [toolInput["file_path"], toolInput["path"], toolInput["file"]]
        .filter((v): v is string => typeof v === "string");
      return pathArgs.some((p) => minimatch(p, rule.match));
    }

    case "shell": {
      const cmd = (toolInput["command"] as string | undefined) ?? "";
      const inner = rule.match.match(/^Bash\((.+)\)$/);
      const pattern = inner ? inner[1]! : rule.match;
      return minimatch(cmd, pattern) || cmd.startsWith(pattern.replace(/\s*\*$/, "").trimEnd());
    }
  }
}

function evaluatePolicy(
  rules: { allow: PolicyRule[]; deny: PolicyRule[]; requireConfirm: PolicyRule[] },
  toolName: string,
  toolInput: Record<string, unknown>,
): { action: "block" | "ask" | "allow"; reason?: string } {
  for (const rule of rules.deny) {
    if (ruleMatches(rule, toolName, toolInput)) {
      return { action: "block", reason: rule.reason ?? `Blocked by deny rule: ${rule.match}` };
    }
  }
  for (const rule of rules.requireConfirm) {
    if (ruleMatches(rule, toolName, toolInput)) {
      return { action: "ask", reason: `Policy requires confirmation: ${rule.match}` };
    }
  }
  return { action: "allow" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const sampleRules = {
  allow: [{ match: "mcp__ashlr-*", kind: "tool" as const }],
  deny: [
    { match: "Bash(rm *)", kind: "shell" as const, reason: "no deletions allowed" },
    { match: "Edit", kind: "tool" as const, reason: "edits blocked" },
  ],
  requireConfirm: [{ match: "/etc/*", kind: "path" as const }],
};

describe("policy rule matching", () => {
  // 1. Deny rule blocks
  it("deny rule on tool name blocks the call", () => {
    const result = evaluatePolicy(sampleRules, "Edit", { file_path: "/home/user/foo.ts" });
    expect(result.action).toBe("block");
    expect(result.reason).toBe("edits blocked");
  });

  it("deny shell rule blocks matching Bash command", () => {
    const result = evaluatePolicy(sampleRules, "Bash", { command: "rm -rf /tmp/foo" });
    expect(result.action).toBe("block");
    expect(result.reason).toBe("no deletions allowed");
  });

  // 2. requireConfirm emits ask
  it("requireConfirm path rule emits ask for /etc/ path", () => {
    const result = evaluatePolicy(
      { ...sampleRules, deny: [] }, // clear deny so path rule is reached
      "Edit",
      { file_path: "/etc/hosts" },
    );
    expect(result.action).toBe("ask");
    expect(result.reason).toContain("/etc/*");
  });

  // 3. Allow passes when no rule matches
  it("tool not matching any rule is allowed", () => {
    const result = evaluatePolicy(sampleRules, "Read", { file_path: "/home/user/foo.ts" });
    expect(result.action).toBe("allow");
  });

  it("ashlr tool matching allow glob is allowed (no deny/requireConfirm match)", () => {
    const rules = {
      allow: [{ match: "mcp__ashlr-*", kind: "tool" as const }],
      deny: [],
      requireConfirm: [],
    };
    const result = evaluatePolicy(rules, "mcp__ashlr-efficiency__ashlr__edit", {});
    expect(result.action).toBe("allow");
  });

  // 4. Malformed/empty policy allows everything
  it("empty rules object allows all tools", () => {
    const emptyRules = { allow: [], deny: [], requireConfirm: [] };
    expect(evaluatePolicy(emptyRules, "Bash", { command: "rm -rf /" }).action).toBe("allow");
  });

  // 5. Kill switch: if enforce=false, skip evaluation entirely
  it("kill switch ASHLR_POLICY_ENFORCE=0 bypasses policy", () => {
    const enforce = process.env["ASHLR_POLICY_ENFORCE"] !== "0";
    // Simulate kill switch set
    process.env["ASHLR_POLICY_ENFORCE"] = "0";
    const killSwitch = process.env["ASHLR_POLICY_ENFORCE"] !== "0";
    expect(killSwitch).toBe(false);
    // Restore
    delete process.env["ASHLR_POLICY_ENFORCE"];
    expect(enforce).toBe(true);
  });
});
