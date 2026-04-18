# Team Genome: Sharing a Genome Across a Development Team

A single `.ashlrcode/genome/` directory can be committed to your repository and
shared by every developer on the team. This guide explains how it works, when to
use it, and how to keep it healthy as the codebase evolves.

---

## What a shared genome does

The genome is a pre-summarized retrieval index of your codebase. When the
ashlr-efficiency server receives a `grep` or `read` call, it first checks whether
the genome has a relevant section and returns that instead of scanning raw files.
This cuts token usage by 40-80% on well-indexed repos.

When you commit the genome to the repository:

- Every developer gets the same index on `git clone` or `git pull`.
- `ashlr__grep` returns consistent answers regardless of whose machine runs it.
- Token savings are deterministic per project — the genome ships with cost
  estimates in `manifest.json` that the savings accounting uses.
- New contributors start saving tokens immediately, without running
  `ashlr-genome-init` themselves.

A committed genome also serves as a living architectural digest: reviewers can
read `sections/*.md` to understand how subsystems fit together before touching
code.

---

## Repository layout

After initialization the genome lives entirely inside `.ashlrcode/`:

```
.ashlrcode/
  genome/
    manifest.json          # index metadata, section checksums, cost estimates
    sections/
      architecture.md
      api-surface.md
      data-models.md
      ...                  # one file per logical section
  genome-ignore            # optional exclusion list (see below)
```

`proposals.jsonl` is written locally by the scribe hook during a session. It is
not shared.

---

## Git workflow

### Initial commit

After running `/ashlr-genome-init` (or `ashlr__genome_propose` + consolidate) on
the base branch:

```bash
git add .ashlrcode/genome/
git commit -m "chore: add ashlr genome index"
```

Add this to your project `.gitignore`:

```gitignore
# ashlr genome — commit the genome itself, ignore local proposals
.ashlrcode/proposals.jsonl
.ashlrcode/genome/proposals.jsonl
```

The `sections/` directory and `manifest.json` should be tracked. They are plain
markdown and JSON — readable in any diff tool, no binary blobs.

### Keeping it up to date

The genome does not auto-update itself in CI. Designate one developer per sprint
(or add a `make genome-sync` target) to regenerate it when the codebase drifts:

```makefile
# Makefile
genome-sync:
	git pull --rebase
	bun run $(ASHLR_PLUGIN_ROOT)/scripts/genome-auto-consolidate.ts
	git add .ashlrcode/genome/
	git commit -m "chore: refresh ashlr genome" || true
	git push
```

The consolidation script reads accumulated proposals and merges them into
`sections/*.md`. Run it on a clean working tree so the diff is easy to review.

A practical cadence: run `make genome-sync` after any large refactor, and at
least once per two-week sprint. The genome degrades gracefully — stale sections
return slightly less precise results but never break tool calls.

---

## Conflict resolution

### How conflicts arise

`hooks/genome-scribe-hook.ts` appends to `proposals.jsonl` after each session.
`scripts/genome-auto-consolidate.ts` applies those proposals to `sections/*.md`
at session end. Both operations are local-only.

If two developers run consolidation on diverged branches and both commit updated
sections, a standard merge conflict appears in `sections/<name>.md`.

### Resolution strategy

Genome sections are prose documents. The last consolidator's version wins — there
is no semantic merge logic. Resolve conflicts by accepting one side or
hand-editing to combine the relevant changes, then re-commit.

Recommended approach:

1. Pull the remote genome into your branch before consolidating locally.
2. Run `genome-auto-consolidate.ts`.
3. Commit and push.

```bash
git pull --rebase origin main
bun run /path/to/ashlr-plugin/scripts/genome-auto-consolidate.ts
git add .ashlrcode/genome/
git commit -m "chore: merge genome"
git push
```

If you encounter a conflict during `git pull`:

```bash
# Accept the remote version (safe default — theirs was already reviewed)
git checkout --theirs .ashlrcode/genome/sections/architecture.md
git add .ashlrcode/genome/sections/architecture.md

# Then consolidate your local proposals on top
bun run /path/to/ashlr-plugin/scripts/genome-auto-consolidate.ts
```

Conflicts in `manifest.json` should always be resolved by regenerating the file
via consolidation — do not hand-edit checksums.

---

## genome-ignore: excluding files from the index

Create `.ashlrcode/genome-ignore` at the repository root. One glob pattern per
line. The scribe hook skips any source file whose path matches a listed pattern.

Example `.ashlrcode/genome-ignore`:

```
# Never include secrets or credentials
.env
.env.*
secrets/**
config/credentials.*
**/*.pem
**/*.key

# Generated files add noise
dist/**
build/**
coverage/**
*.min.js
```

Patterns follow the same syntax as `.gitignore`. The ignore file itself should be
committed so every developer's scribe respects the same exclusions.

---

## When not to share a genome

**Small throwaway repositories.** If the project will be deleted or archived
within a few weeks, the overhead of maintaining a genome is not worth it. Skip
the commit — developers can generate a local genome on demand.

**Secrets risk.** The genome embeds excerpts from source files. Any file that
contains secrets — API keys, passwords, private keys — must be excluded via
`genome-ignore` before running the first propose. If a secret is accidentally
indexed, rotate the secret immediately, remove the section from `sections/`,
and force-push or use `git filter-repo` to scrub the history.

Rule of thumb: if a file would be dangerous to share in a public pull request,
add it to `genome-ignore` before running `/ashlr-genome-init`.

**High-churn monorepos.** If hundreds of files change every day, the genome will
be stale by the time it lands on other machines. Prefer per-package genomes
scoped to stable subdirectories, or run `genome-sync` in CI on a nightly schedule
rather than per-commit.

---

## Bootstrapping a new team member

No extra steps are needed beyond the standard clone:

```bash
git clone https://github.com/your-org/your-repo
cd your-repo
bun install   # if ashlr-plugin is a dev dependency
```

The plugin auto-detects `.ashlrcode/genome/` in the current working directory on
startup. If the genome exists, it is used immediately — no initialization
required.

If the new developer's session generates proposals that improve on the committed
genome, they can run `genome-auto-consolidate.ts` locally and open a PR with the
updated sections.

---

## Size considerations

A typical genome for a 50,000-line codebase is 200-500 KB. Sections are Markdown
and compress well in git's object store.

Recommended upper bound: **5 MB total** for the `sections/` directory. Beyond
that, `git clone` and `git pull` times degrade noticeably on slow connections, and
the retrieval index itself becomes slower to scan.

If the genome approaches 5 MB:

- Audit `sections/` for redundant or overly verbose entries.
- Tighten `genome-ignore` to exclude large generated directories.
- Consider splitting the repo into smaller packages, each with its own genome.

Check current size:

```bash
du -sh .ashlrcode/genome/sections/
```

---

## Example: full team workflow end-to-end

```bash
# Tech lead initializes the genome on main
cd /path/to/your-repo
# (in Claude Code with ashlr active)
# /ashlr-genome-init
git add .ashlrcode/genome/
git commit -m "chore: add ashlr genome index"
git push

# Developer clones repo — genome is immediately active
git clone https://github.com/your-org/your-repo
cd your-repo
# ashlr__grep and ashlr__read now use the genome automatically

# After a sprint of changes, refresh the genome
make genome-sync
# opens a PR with updated sections/*.md
```

---

## See also

- `docs/architecture.md` — system architecture overview used as a source for the
  genome's architecture section.
- `/ashlr-genome-init` skill — interactive setup wizard that runs propose +
  consolidate and writes the initial genome.
