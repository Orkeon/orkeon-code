// What the code already says about a feature or a change, looked up by code before a spec or a brief is drafted:
// the code index searched on a few phrases of the request, each hit kept once and located, at most 30 rows of
// `path:line — name`. A fact the code answers is then never asked. It builds the index when it holds no root and
// writes nothing else; a failing index is a warning and an empty inventory, never a stop.
import type { CodeIndex } from "../ports.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export interface BriefInventoryEntry { path: string; line: number; name: string }
export interface BriefInventory {
  entries: BriefInventoryEntry[];
  /** The phrases searched, in order. */
  phrases: string[];
  calls: number;
  warnings: string[];
}
export interface BriefInventoryRequest {
  phrases: readonly string[];
  /** Relative path prefixes never shown: the work folder, `.claude/`, the build outputs. */
  excluded: readonly string[];
}

export const BRIEF_INVENTORY_CAPS = { phrases: 6, phraseChars: 160, topK: 8, entries: 30 } as const;
const TOP = `${WORKSPACE}/`;
const ALWAYS_EXCLUDED = [".claude/", ".git/", "node_modules/"];

const firstLine = (e: unknown): string => (e instanceof Error ? e.message : String(e)).split("\n")[0];
const relative = (path: string): string => (path.startsWith(TOP) ? path.slice(TOP.length) : path.replace(/^\/+/, ""));
const pathPart = (fqn: string): string => {
  const cut = fqn.indexOf("::");
  return cut >= 0 ? fqn.slice(0, cut) : fqn;
};
const nameOf = (fqn: string): string => {
  const cut = fqn.indexOf("::");
  return cut >= 0 ? fqn.slice(cut + 2) : fqn.slice(fqn.lastIndexOf("/") + 1);
};

/** The phrases to search for a request: the code's words, then its first lines or sentences, distinct. */
export function briefPhrases(code: string, text: string): string[] {
  const out: string[] = [];
  const add = (phrase: string): void => {
    const p = phrase.replace(/[#>*`_|]/g, " ").replace(/\s+/g, " ").trim().slice(0, BRIEF_INVENTORY_CAPS.phraseChars);
    if (p.length >= 3 && !out.some((o) => o.toLowerCase() === p.toLowerCase())) out.push(p);
  };
  add(code.replace(/-/g, " "));
  for (const piece of text.split(/\r?\n|(?<=[.!?])\s+/)) {
    if (out.length >= BRIEF_INVENTORY_CAPS.phrases) break;
    add(piece);
  }
  return out.slice(0, BRIEF_INVENTORY_CAPS.phrases);
}

function excludedBy(prefixes: readonly string[]): (path: string) => boolean {
  const all = [...ALWAYS_EXCLUDED, ...prefixes.map((p) => (p.endsWith("/") ? p : `${p}/`))];
  return (path) => all.some((p) => path.startsWith(p));
}

export async function briefInventory(index: CodeIndex, request: BriefInventoryRequest): Promise<BriefInventory> {
  const out: BriefInventory = { entries: [], phrases: [...request.phrases], calls: 0, warnings: [] };
  try {
    out.calls++;
    if ((await index.rootCount()) === 0) {
      out.calls++;
      await index.index(WORKSPACE);
    }
  } catch (e) {
    out.warnings.push(`the code index is not available (${firstLine(e)}): the draft has no inventory`);
    return out;
  }
  const excluded = excludedBy(request.excluded);
  const seen = new Set<string>();
  for (const phrase of request.phrases) {
    if (out.entries.length >= BRIEF_INVENTORY_CAPS.entries) break;
    let hits;
    try {
      out.calls++;
      hits = await index.search(phrase, BRIEF_INVENTORY_CAPS.topK);
    } catch (e) {
      out.warnings.push(`search failed for '${phrase}': ${firstLine(e)}`);
      continue;
    }
    for (const hit of hits) {
      if (out.entries.length >= BRIEF_INVENTORY_CAPS.entries) break;
      const path = relative(pathPart(hit.fqn));
      if (seen.has(hit.fqn) || excluded(path)) continue;
      seen.add(hit.fqn);
      let line = 0;
      try {
        out.calls++;
        line = (await index.symbolSource(hit.fqn)).startLine;
      } catch {
        line = 0;
      }
      out.entries.push({ path, line, name: nameOf(hit.fqn) });
    }
  }
  return out;
}

/** The inventory as the prompt shows it: one `path:line — name` per row, or a line saying it is empty. */
export function renderBriefInventory(inventory: BriefInventory): string {
  if (inventory.entries.length === 0) return "(the index found nothing for this request)";
  return inventory.entries.map((e) => `- ${e.path}${e.line > 0 ? `:${e.line}` : ""} — ${e.name}`).join("\n");
}
