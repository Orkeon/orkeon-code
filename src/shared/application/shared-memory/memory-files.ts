// The shared memory's files as the use cases read and write them, through Files: the pending
// candidates, the entries, the refused topics, the two generated lists. A folder that does not
// exist yet reads as empty; the first file_write creates it.

import type { Files } from "../ports.ts";
import { ENTRY_TYPES } from "../../domain/shared-memory/entry.ts";
import type { MemoryEntry } from "../../domain/shared-memory/entry.ts";
import { parseEntry, serializeEntry } from "../../domain/shared-memory/front-matter.ts";
import { parseRefused } from "../../domain/shared-memory/refused.ts";
import { candidatesList, entriesIndex } from "../../domain/shared-memory/candidates.ts";
import { candidatePath } from "../../domain/shared-memory/layout.ts";
import type { MemoryLayout } from "../../domain/shared-memory/layout.ts";

/** How many files of one folder are read at most. */
export const MAX_LISTED = 1_000;

export interface StoredEntry {
  entry: MemoryEntry;
  path: string;
}

/** The file's text, or null when it does not exist; an unreadable file throws. */
export async function readOrNull(files: Pick<Files, "read">, path: string): Promise<string | null> {
  try {
    return await files.read(path);
  } catch (error) {
    if (/not found|does not exist|no such file|could not find/i.test(String((error as Error)?.message ?? error))) return null;
    throw error;
  }
}

async function namesIn(files: Pick<Files, "list">, folder: string): Promise<string[]> {
  try {
    return (await files.list(folder, MAX_LISTED)).map((name) => name.split("/").pop() ?? name).filter((n) => n.endsWith(".md"));
  } catch {
    return [];
  }
}

/** The entries of `folder` whose file parses, with `status` among `statuses`. */
async function entriesIn(files: Pick<Files, "list" | "read">, folder: string, statuses: readonly string[]): Promise<StoredEntry[]> {
  const found: StoredEntry[] = [];
  for (const name of (await namesIn(files, folder)).sort()) {
    const path = `${folder}/${name}`;
    let text: string | null;
    try {
      text = await readOrNull(files, path);
    } catch {
      continue;
    }
    const parsed = text === null ? null : parseEntry(text);
    if (parsed?.ok && statuses.includes(parsed.entry.status)) found.push({ entry: parsed.entry, path });
  }
  return found;
}

/** The pending candidates: the files of candidates/ that parse as an entry of status candidate. */
export async function pendingCandidates(files: Pick<Files, "list" | "read">, layout: MemoryLayout): Promise<StoredEntry[]> {
  return entriesIn(files, layout.candidates, ["candidate"]);
}

/** Every entry of entries/<type>/, admitted or superseded. */
export async function storedEntries(files: Pick<Files, "list" | "read">, layout: MemoryLayout): Promise<StoredEntry[]> {
  const all: StoredEntry[] = [];
  for (const type of ENTRY_TYPES) all.push(...await entriesIn(files, `${layout.entries}/${type}`, ["admitted", "superseded"]));
  return all;
}

/** The refused topics; none when refused.md does not exist. Throws when it cannot be read. */
export async function refusedTopics(files: Pick<Files, "read">, layout: MemoryLayout): Promise<Set<string>> {
  const text = await readOrNull(files, layout.refused);
  return new Set(text === null ? [] : parseRefused(text).motifs.map((m) => m.topic));
}

/** Writes the candidate's file; its path. */
export async function writeCandidateFile(files: Pick<Files, "write">, layout: MemoryLayout, entry: MemoryEntry): Promise<string> {
  const path = candidatePath(layout, entry.id);
  await files.write(path, serializeEntry({ ...entry, status: "candidate" }));
  return path;
}

/** Rewrites CANDIDATES.md from the pending candidates; a failure is a line, never a throw. */
export async function refreshCandidatesList(files: Pick<Files, "list" | "read" | "write">, layout: MemoryLayout): Promise<string | null> {
  try {
    await files.write(layout.candidatesList, candidatesList((await pendingCandidates(files, layout)).map((c) => c.entry)));
    return null;
  } catch (error) {
    return `${layout.candidatesList} not refreshed (${String((error as Error)?.message ?? error).split("\n")[0]})`;
  }
}

/** Rewrites INDEX.md from the entries; a failure is a line, never a throw. */
export async function refreshIndexFile(files: Pick<Files, "list" | "read" | "write">, layout: MemoryLayout): Promise<string | null> {
  try {
    await files.write(layout.index, entriesIndex((await storedEntries(files, layout)).map((e) => e.entry)));
    return null;
  } catch (error) {
    return `${layout.index} not refreshed (${String((error as Error)?.message ?? error).split("\n")[0]})`;
  }
}
