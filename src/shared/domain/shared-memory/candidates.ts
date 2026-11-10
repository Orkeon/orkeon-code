// The shared memory's generated lists, pure: candidates/CANDIDATES.md (the pending candidates) and
// INDEX.md (every entry of entries/). Both are views rebuilt from the files, which stay the truth.
// A decided candidate cannot be deleted (no file tool removes a file): its file is rewritten to one
// pointer line, which never parses as an entry, so it is no longer a candidate.

import type { MemoryEntry } from "./entry.ts";
import { admittedPointer, CANDIDATES_INTRO, INDEX_INTRO, refusedPointer } from "./messages.ts";

export const CANDIDATES_TITLE = "# Memory candidates";
export const INDEX_TITLE = "# Shared memory";

const cell = (text: string): string => text.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").trim();

function table(head: readonly string[], rows: ReadonlyArray<readonly string[]>): string[] {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(cell).join(" | ")} |`)];
}

/** How many distinct batches a source names (`<code>/<CODE>-VERIFY-F<n>.md`), for the batches column; "-" when none. */
export function batchesOf(source: string): string {
  const batches = new Set([...source.matchAll(/([^\s,:/]+)\/[^\s,/]*-VERIFY-(F\d+)/g)].map((m) => `${m[1]}/${m[2]}`));
  return batches.size === 0 ? "-" : String(batches.size);
}

export function candidatesList(candidates: readonly MemoryEntry[]): string {
  const rows = [...candidates].sort((a, b) => a.id.localeCompare(b.id))
    .map((c) => [c.id, c.type, c.topic, c.source, batchesOf(c.source)]);
  return [CANDIDATES_TITLE, "", CANDIDATES_INTRO, "", ...table(["id", "type", "topic", "source", "batches"], rows)].join("\n") + "\n";
}

export function entriesIndex(entries: readonly MemoryEntry[]): string {
  const rows = [...entries].sort((a, b) => a.id.localeCompare(b.id)).map((e) => [e.id, e.type, e.status, e.title]);
  return [INDEX_TITLE, "", INDEX_INTRO, "", ...table(["id", "type", "status", "title"], rows)].join("\n") + "\n";
}

/** What a decided candidate's file becomes. */
export function decidedPointer(decision: "admitted" | "refused", date: string, entryFile?: string): string {
  return decision === "admitted"
    ? admittedPointer(date, entryFile)
    : refusedPointer(date);
}
