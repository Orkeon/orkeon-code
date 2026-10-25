// The shared memory's reference set as the tests read it: the entry files of tests/fixtures/shared-memory/, the
// entries they parse to, and golden.yaml.
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseEntry } from "../../src/shared/domain/shared-memory/front-matter.ts";
import type { MemoryEntry } from "../../src/shared/domain/shared-memory/entry.ts";
import { parseGolden } from "../../src/crews/_probe-shared-memory/domain/probe-verdict.ts";

const FIXTURE = fileURLToPath(new URL("../fixtures/shared-memory/", import.meta.url));
const markerFile = JSON.parse(readFileSync(fileURLToPath(new URL("../../scripts/provenance-markers.json", import.meta.url)), "utf8"));
export const MARKERS: RegExp[] = markerFile.markers.map((m: { source: string; flags: string }) => new RegExp(m.source, m.flags));

/** The entry files, as `<type>/<id>.md` paths under entries/, sorted. */
export function entryFiles(): string[] {
  return readdirSync(join(FIXTURE, "entries"), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.split("\\").join("/"))
    .sort();
}

/** The text of an entry file. */
export const entryText = (file: string): string => readFileSync(join(FIXTURE, "entries", file), "utf8");

/** A path of the fixture, relative to its root (`entries/…`), exists. */
export const fixturePath = (source: string): string => join(FIXTURE, source);

export type Entries = Map<string, { file: string; entry: MemoryEntry }>;

/** The entries that parse, by id, with their file. */
export function loadEntries(files: readonly string[] = entryFiles()): Entries {
  const entries: Entries = new Map();
  for (const file of files) {
    const parsed = parseEntry(entryText(file));
    if (parsed.ok) entries.set(parsed.entry.id, { file, entry: parsed.entry });
  }
  return entries;
}

export const loadGolden = () => parseGolden(readFileSync(join(FIXTURE, "eval", "golden.yaml"), "utf8"));
export type Golden = ReturnType<typeof loadGolden>;

export const idOfSource = (source: string): string => basename(source, ".md");

/** How many files of `files` sit under each folder of `types`, in that order. */
export const countByType = (files: readonly string[], types: readonly string[]): number[] =>
  types.map((type) => files.filter((f) => f.startsWith(`${type}/`)).length);

/** The case ids q01 to q14. */
export const CASE_IDS: readonly string[] = Array.from({ length: 14 }, (_, i) => `q${String(i + 1).padStart(2, "0")}`);
