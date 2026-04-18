---
name: ashlr-demo
description: Run a 30-second scripted showcase of ashlr token savings on the current project.
---

Run the demo script and show its output verbatim:

```
bun run /Users/masonwyatt/Desktop/ashlr-plugin/scripts/demo-run.ts --cwd <absolute path to current project>
```

Replace `<absolute path to current project>` with the actual `cwd` of the project you are working in (use `process.cwd()` or the project root).

The script will:
1. Find a largish source file (>2KB) in the project.
2. Read it via `ashlr__read` and report before/after bytes.
3. Grep for a common pattern via `ashlr__grep` and report bytes.
4. Show totals and projected lifetime savings.

Output is plain text, at most 30 lines. Safe to run repeatedly — never writes files.

Show the output inside a fenced code block so alignment is preserved.
