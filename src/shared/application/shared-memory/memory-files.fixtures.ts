// The shared memory's folder memory-files is tested over: the default layout, candidates and entries of
// tests/support/fixtures/memory-entries.ts written into FakeFiles, a refused.md, and a foreign INDEX.md.
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { entryText, sampleEntry } from "../../../../tests/support/fixtures/memory-entries.ts";
import { appendRefused } from "../../domain/shared-memory/refused.ts";
import { INDEX_TITLE } from "../../domain/shared-memory/candidates.ts";
import { candidatePath, entryPath, memoryLayout } from "../../domain/shared-memory/layout.ts";

export const layout = memoryLayout(".orkeon/memory");

export const CANDIDATE_B = sampleEntry("method", "run-contract-tests", { status: "candidate" });
export const CANDIDATE_A = sampleEntry("decision", "keep-one-port", { status: "candidate" });
const ADMITTED = sampleEntry("method", "already-admitted");
export const DECISION = sampleEntry("decision", "ports-in-one-file");

/** The candidates folder: two pending candidates listed out of order, an admitted entry, a file that does not parse,
 *  one that cannot be read, and a file that is no .md. */
export function candidatesFolder(): FakeFiles {
  const files = new FakeFiles();
  const named = (id: string) => candidatePath(layout, id);
  files.files.set(named(CANDIDATE_B.id), entryText(CANDIDATE_B));
  files.files.set(named(CANDIDATE_A.id), entryText(CANDIDATE_A));
  files.files.set(named(ADMITTED.id), entryText(ADMITTED));
  files.files.set(named("broken"), "no front matter here\n");
  files.readErrors.set(named("locked"), new Error("permission denied"));
  files.listings.set(layout.candidates, [
    `${CANDIDATE_B.id}.md`, `${ADMITTED.id}.md`, "broken.md", "locked.md", `${CANDIDATE_A.id}.md`, "CANDIDATES.md.bak",
  ]);
  return files;
}

/** The ids pendingCandidates gives over candidatesFolder(), in the order of their file names. */
export const PENDING_IDS = [CANDIDATE_A.id, CANDIDATE_B.id];

/** A memory whose refused.md holds two topics. */
export function refusedFile(): FakeFiles {
  const files = new FakeFiles();
  const first = appendRefused(null, { topic: "empty-exports", project: "shop", date: "2026-10-21", motif: "Exports skip the empty case" });
  files.files.set(layout.refused, appendRefused(first, { topic: "fixtures-drift", project: "shop", date: "2026-10-22", motif: "Fixtures drift" }));
  return files;
}

/** A memory with one admitted decision under entries/decision/. */
export function oneEntry(): FakeFiles {
  const files = new FakeFiles();
  files.files.set(entryPath(layout, "decision", DECISION.id), entryText(DECISION));
  files.listings.set(`${layout.entries}/decision`, [`${DECISION.id}.md`]);
  return files;
}

/** oneEntry(), the INDEX.md at the folder's root a file of the project. */
export function foreignIndex(): FakeFiles {
  const files = oneEntry();
  files.files.set(layout.index, "# Project index\nOur own notes.\n");
  return files;
}

/** oneEntry(), an earlier INDEX.md the memory generated. */
export function earlierIndex(): FakeFiles {
  const files = oneEntry();
  files.files.set(layout.index, `${INDEX_TITLE}\n\nAn older list.\n`);
  return files;
}

/** oneEntry(), every write under the memory folder failing. */
export function readOnlyMemory(): FakeFiles {
  const files = oneEntry();
  files.writeErrors.push({ prefix: layout.root, error: () => new Error("read-only file system\nat write") });
  return files;
}

export interface RefreshCase { name: string; files: () => FakeFiles; line: string | null }

export const REFRESH_CASES: readonly RefreshCase[] = [
  { name: "writes INDEX.md where there is none and says nothing", files: oneEntry, line: null },
  { name: "rewrites an INDEX.md the memory generated and says nothing", files: earlierIndex, line: null },
  {
    name: "leaves a foreign INDEX.md alone and says why", files: foreignIndex,
    line: `${layout.index} not refreshed: it exists and is not the memory's (it does not start with '${INDEX_TITLE}')`,
  },
  {
    name: "says a write that fails as a line, with the first line of the reason", files: readOnlyMemory,
    line: `${layout.index} not refreshed (read-only file system)`,
  },
];
