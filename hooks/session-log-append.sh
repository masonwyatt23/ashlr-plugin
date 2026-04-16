#!/usr/bin/env bash
# ashlr-plugin PostToolUse: cross-agent session log.
#
# Appends one JSONL line per tool invocation to `~/.ashlr/session-log.jsonl`
# so any tool (workbench `aw-log`, Goose, OpenHands, etc.) can tail the
# same feed. The schema is intentionally small:
#
#   { ts, agent, event, tool, cwd, session, input_size, output_size }
#
# Rules:
#   - Never block the agent. `|| true` on every failure path.
#   - Self-rotate: if the file passes 10 MB we rename to `.jsonl.1`.
#   - Honor ASHLR_SESSION_LOG=0 as a kill switch.

set +e

if [ "${ASHLR_SESSION_LOG:-1}" = "0" ]; then
  exit 0
fi

LOG_DIR="$HOME/.ashlr"
LOG_FILE="$LOG_DIR/session-log.jsonl"
ROTATED="$LOG_FILE.1"
MAX_BYTES=10485760  # 10 MB

mkdir -p "$LOG_DIR" 2>/dev/null || true

# Slurp stdin once — may be empty or malformed, that's fine.
STDIN_JSON=$(cat 2>/dev/null || true)

# Rotate if the file has grown past the cap.
if [ -f "$LOG_FILE" ]; then
  SIZE=$(stat -f%z "$LOG_FILE" 2>/dev/null || stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)
  if [ -n "$SIZE" ] && [ "$SIZE" -ge "$MAX_BYTES" ] 2>/dev/null; then
    mv -f "$LOG_FILE" "$ROTATED" 2>/dev/null || true
  fi
fi

# Emit exactly one JSONL line via bun. We keep the bun stub tiny and
# defensive: any parse error yields a minimal record rather than nothing.
LINE=$(printf '%s' "$STDIN_JSON" | LOG_PWD="$PWD" LOG_SESSION="${CLAUDE_SESSION_ID:-}" bun -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    const sizeOf = (v) => {
      if (v == null) return 0;
      if (typeof v === "string") return Buffer.byteLength(v, "utf8");
      try { return Buffer.byteLength(JSON.stringify(v), "utf8"); } catch { return 0; }
    };
    let tool = "unknown";
    let inSize = 0;
    let outSize = 0;
    try {
      const p = raw.trim() ? JSON.parse(raw) : {};
      if (typeof p?.tool_name === "string") tool = p.tool_name;
      inSize = sizeOf(p?.tool_input);
      outSize = sizeOf(p?.tool_result ?? p?.tool_response);
    } catch { /* use defaults */ }
    // Fallback session hash when CLAUDE_SESSION_ID is not set.
    const sessRaw = process.env.LOG_SESSION || "";
    let session = sessRaw;
    if (!session) {
      const seed = `${process.env.LOG_PWD || ""}:${process.pid}`;
      let h = 0;
      for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
      session = `h${(h >>> 0).toString(16)}`;
    }
    const rec = {
      ts: new Date().toISOString(),
      agent: "claude-code",
      event: "tool_call",
      tool,
      cwd: process.env.LOG_PWD || "",
      session,
      input_size: inSize,
      output_size: outSize,
    };
    process.stdout.write(JSON.stringify(rec));
  });
' 2>/dev/null)

# If bun is unavailable or produced nothing, fall back to a minimal record
# built entirely in bash so the log still captures something useful.
if [ -z "$LINE" ]; then
  TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "1970-01-01T00:00:00Z")
  SESSION="${CLAUDE_SESSION_ID:-unknown}"
  # JSON-safe cwd (escape backslashes + quotes).
  CWD_ESC=$(printf '%s' "$PWD" | sed 's/\\/\\\\/g; s/"/\\"/g')
  LINE="{\"ts\":\"$TS\",\"agent\":\"claude-code\",\"event\":\"tool_call\",\"tool\":\"unknown\",\"cwd\":\"$CWD_ESC\",\"session\":\"$SESSION\",\"input_size\":0,\"output_size\":0}"
fi

printf '%s\n' "$LINE" >> "$LOG_FILE" 2>/dev/null || true

exit 0
