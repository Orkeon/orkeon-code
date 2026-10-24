// Finds the repository pack of the checkout: `.orkeon/repo.yaml` first, else the first
// `repo-*` pack the harness deployed under `.claude/harness/packs/`, in sorted order. The
// first file that exists decides: one that cannot be read or does not parse gives a
// warning and no pack, and no other file is tried after it.
import type { Files } from "../ports.ts";
import { parseRepoPack } from "../../domain/dev/repo-pack.ts";
import type { RepoPack, RepoPackIssue } from "../../domain/dev/repo-pack.ts";
import { formatYamlError } from "../../domain/dev/yaml-subset.ts";

export const ORKEON_PACK_PATH = "/workspace/.orkeon/repo.yaml";
export const HARNESS_PACKS_DIR = "/workspace/.claude/harness/packs";

export interface FoundPack {
  path: string;            // VFS path read
  shown: string;           // path without "/workspace/", e.g. ".orkeon/repo.yaml"
  origin: "orkeon" | "harness";
  pack: RepoPack;
  issues: RepoPackIssue[];
}
export interface PackLookup { found: FoundPack | null; warnings: string[] }

const LIST_CAP = 200;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const isNotFound = (e: unknown): boolean => /not found/i.test(messageOf(e));
const shownOf = (path: string): string => (path.startsWith("/workspace/") ? path.slice("/workspace/".length) : path);

type Attempt = { kind: "absent" } | { kind: "failed"; error: unknown } | { kind: "read"; text: string };

async function attempt(files: Pick<Files, "read">, path: string): Promise<Attempt> {
  try {
    return { kind: "read", text: await files.read(path) };
  } catch (e) {
    return isNotFound(e) ? { kind: "absent" } : { kind: "failed", error: e };
  }
}

function decide(path: string, origin: FoundPack["origin"], a: Exclude<Attempt, { kind: "absent" }>, warnings: string[]): PackLookup {
  const shown = shownOf(path);
  if (a.kind === "failed") {
    const first = messageOf(a.error).split("\n")[0];
    warnings.push(`${shown} cannot be read (${first}): no repository pack is used`);
    return { found: null, warnings };
  }
  const parsed = parseRepoPack(a.text);
  if (!parsed.ok) {
    warnings.push(`${formatYamlError(shown, parsed.error)}: the repository pack is ignored`);
    return { found: null, warnings };
  }
  for (const issue of parsed.issues) warnings.push(`${shown}: ${issue.key}: ${issue.message}`);
  return { found: { path, shown, origin, pack: parsed.pack, issues: parsed.issues }, warnings };
}

export async function findRepoPack(files: Pick<Files, "read" | "list">): Promise<PackLookup> {
  const warnings: string[] = [];
  const own = await attempt(files, ORKEON_PACK_PATH);
  if (own.kind !== "absent") return decide(ORKEON_PACK_PATH, "orkeon", own, warnings);

  let entries: string[];
  try {
    entries = await files.list(HARNESS_PACKS_DIR, LIST_CAP);
  } catch {
    entries = [];
  }
  const packs = entries.filter((e) => /^repo-/.test(e)).sort();
  for (const entry of packs) {
    const path = `${HARNESS_PACKS_DIR}/${entry}/references/repo.yaml`;
    const a = await attempt(files, path);
    if (a.kind === "absent") continue;
    if (packs.length > 1) {
      warnings.push(`several repository packs are deployed (${packs.join(", ")}): ${shownOf(path)} is read`);
    }
    return decide(path, "harness", a, warnings);
  }
  return { found: null, warnings };
}
