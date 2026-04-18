/**
 * _genome-sync.ts — Plugin-side team genome sync client.
 *
 * Opt-in: set ASHLR_TEAM_GENOME_ID (plus existing ASHLR_PRO_TOKEN).
 *
 * Used by:
 *   - hooks/session-start.ts: pull remote sections on session start
 *   - servers/_genome-live.ts: push updated sections after ashlr__edit
 *
 * Design constraints:
 *   - Never throws — all functions catch internally and log to stderr.
 *   - Non-blocking: callers fire-and-forget (no await required).
 *   - Tracks a local sequence number in ASHLR_GENOME_LOCAL_SEQ_PATH so
 *     incremental pulls only fetch sections modified since last pull.
 *
 * Security note:
 *   Section content is transmitted and stored in plaintext.
 *   Client-side encryption is deferred to v2. Teams should opt in knowing this.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";

// ---------------------------------------------------------------------------
// Config — read at call time so tests can set env vars after module load
// ---------------------------------------------------------------------------

function cfg() {
  return {
    apiUrl:       process.env["ASHLR_API_URL"]               ?? "https://api.ashlr.ai",
    genomeId:     process.env["ASHLR_TEAM_GENOME_ID"]        ?? "",
    proToken:     process.env["ASHLR_PRO_TOKEN"]             ?? "",
    clientId:     process.env["ASHLR_CLIENT_ID"]             ?? `client_${process.pid}`,
    localSeqPath: process.env["ASHLR_GENOME_LOCAL_SEQ_PATH"] ?? join(homedir(), ".ashlr", "genome-seq.json"),
  };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemoteSection {
  path:        string;
  content:     string;
  vclock:      Record<string, number>;
  conflictFlag: boolean;
  serverSeq:   number;
}

export interface PullResult {
  sections:    RemoteSection[];
  serverSeqNum: number;
}

export interface PushResult {
  applied:   string[];
  conflicts: string[];
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Returns true when team genome sync is configured. */
export function isTeamGenomeEnabled(): boolean {
  const { genomeId, proToken } = cfg();
  return Boolean(genomeId && proToken);
}

// ---------------------------------------------------------------------------
// Local seq persistence
// ---------------------------------------------------------------------------

async function readLocalSeq(): Promise<number> {
  try {
    const raw = await readFile(cfg().localSeqPath, "utf-8");
    const obj = JSON.parse(raw) as { seq?: number };
    return typeof obj.seq === "number" ? obj.seq : 0;
  } catch {
    return 0;
  }
}

async function writeLocalSeq(seq: number): Promise<void> {
  try {
    const p = cfg().localSeqPath;
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, JSON.stringify({ seq }), "utf-8");
  } catch {
    // Non-fatal
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function apiFetch(
  method: string,
  path: string,
  body?: unknown,
): Promise<Response> {
  const { apiUrl, proToken } = cfg();
  const url = `${apiUrl}${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${proToken}`,
      "Content-Type": "application/json",
    },
  };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }
  return fetch(url, init);
}

// ---------------------------------------------------------------------------
// Pull
// ---------------------------------------------------------------------------

/**
 * Pull remote sections since the last known sequence number, write them to
 * .ashlrcode/genome/sections/, update local seq.
 *
 * @param genomeSectionsDir  Absolute path to .ashlrcode/genome/sections/ in the repo.
 */
export async function pullTeamGenome(genomeSectionsDir: string): Promise<PullResult | null> {
  if (!isTeamGenomeEnabled()) return null;

  try {
    const since = await readLocalSeq();
    const res   = await apiFetch("GET", `/genome/${cfg().genomeId}/pull?since=${since}`);

    if (!res.ok) {
      process.stderr.write(`[ashlr-genome-sync] pull failed: ${res.status}\n`);
      return null;
    }

    const data = await res.json() as PullResult;

    if (data.sections.length > 0) {
      await mkdir(genomeSectionsDir, { recursive: true });

      for (const section of data.sections) {
        const safeName = section.path.replace(/^sections\//, "");
        // Additional client-side path safety check
        if (safeName.includes("..") || safeName.startsWith("/")) {
          process.stderr.write(`[ashlr-genome-sync] skipping unsafe path: ${section.path}\n`);
          continue;
        }
        const dest = join(genomeSectionsDir, safeName);
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, section.content, "utf-8");
      }

      await writeLocalSeq(data.serverSeqNum);
      process.stderr.write(`[ashlr-genome-sync] pulled ${data.sections.length} section(s), seq=${data.serverSeqNum}\n`);
    }

    return data;
  } catch (err) {
    process.stderr.write(`[ashlr-genome-sync] pull error: ${String(err)}\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Push
// ---------------------------------------------------------------------------

/**
 * Push a single updated section to the remote genome.
 *
 * @param sectionPath  Relative path within genome sections (e.g. "sections/auth.md")
 * @param content      Full section content after the edit
 * @param vclock       Current vector clock for this client (caller manages increment)
 */
export async function pushTeamGenomeSection(
  sectionPath: string,
  content: string,
  vclock: Record<string, number>,
): Promise<PushResult | null> {
  if (!isTeamGenomeEnabled()) return null;

  try {
    const { genomeId, clientId } = cfg();
    const res = await apiFetch("POST", `/genome/${genomeId}/push`, {
      clientId,
      sections: [{ path: sectionPath, content, vclock }],
    });

    if (!res.ok) {
      process.stderr.write(`[ashlr-genome-sync] push failed: ${res.status}\n`);
      return null;
    }

    const data = await res.json() as PushResult;

    if (data.conflicts.length > 0) {
      process.stderr.write(
        `[ashlr-genome-sync] conflict on ${data.conflicts.join(", ")} — run /ashlr-genome-conflicts to resolve\n`,
      );
    }

    return data;
  } catch (err) {
    process.stderr.write(`[ashlr-genome-sync] push error: ${String(err)}\n`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Vclock helpers (client-side)
// ---------------------------------------------------------------------------

/** Load the local vclock state from disk. Returns {} if not found. */
export async function loadLocalVClock(genomeSectionsDir: string, sectionPath: string): Promise<Record<string, number>> {
  const metaPath = join(genomeSectionsDir, ".vclock", sectionPath.replace(/^sections\//, "") + ".json");
  try {
    const raw = await readFile(metaPath, "utf-8");
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

/** Persist a vclock after a successful push. */
export async function saveLocalVClock(
  genomeSectionsDir: string,
  sectionPath: string,
  vclock: Record<string, number>,
): Promise<void> {
  const metaPath = join(genomeSectionsDir, ".vclock", sectionPath.replace(/^sections\//, "") + ".json");
  try {
    await mkdir(dirname(metaPath), { recursive: true });
    await writeFile(metaPath, JSON.stringify(vclock), "utf-8");
  } catch {
    // Non-fatal
  }
}

/** Increment this client's counter in a vclock and return the updated clock. */
export function tickVClock(vclock: Record<string, number>, clientId = cfg().clientId): Record<string, number> {
  return { ...vclock, [clientId]: (vclock[clientId] ?? 0) + 1 };
}
