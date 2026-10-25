// Checks on the shared memory's reference set.
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { existsSync } from "node:fs";
import type { MemoryEntry } from "../src/shared/domain/shared-memory/entry.ts";
import { NEGATIVE_CASE } from "../src/crews/_probe-shared-memory/domain/probe-verdict.ts";
import { fixturePath, idOfSource } from "./shared-memory-fixture.fixtures.ts";
import type { Entries, Golden } from "./shared-memory-fixture.fixtures.ts";

/** Each id is unique and its file is `<type>/<id>.md`. */
export function assertFilesNamedById(entries: Entries, files: readonly string[]): void {
  strictEqual(entries.size, files.length);
  for (const [id, { file, entry }] of entries) strictEqual(file, `${entry.type}/${id}.md`);
}

/** Every entry an entry supersedes is known, `superseded`, points back to it and sits in its project. */
export function assertSupersessionsLinked(entries: Entries): void {
  for (const { entry } of entries.values()) {
    for (const old of entry.supersedes) {
      const target = entries.get(old)?.entry;
      ok(target, `${entry.id} supersedes the unknown ${old}`);
      strictEqual(target.status, "superseded");
      strictEqual(target.supersededBy, entry.id);
      strictEqual(target.project, entry.project);
    }
  }
}

/** Every relevant source of every case is an existing entry file of the fixture, admitted. */
export function assertRelevantAdmitted(golden: Golden, entries: Entries): void {
  for (const c of golden.cases) {
    for (const source of c.relevant) {
      ok(source.startsWith("entries/"), `${c.id}: ${source}`);
      ok(existsSync(fixturePath(source)), `${c.id}: ${source} does not exist`);
      strictEqual(entries.get(idOfSource(source))?.entry.status, "admitted", `${c.id}: ${source}`);
    }
  }
}

/** `target` supersedes superseded entries only, and no case expects a superseded id. */
export function assertSupersessionCase(target: MemoryEntry | undefined, entries: Entries, golden: Golden): void {
  ok(target && target.supersedes.length > 0, "q08's target supersedes nothing");
  for (const old of target.supersedes) strictEqual(entries.get(old)?.entry.status, "superseded");
  const superseded = [...entries.values()].filter((e) => e.entry.status === "superseded").map((e) => e.entry.id);
  ok(superseded.length > 0);
  for (const c of golden.cases) for (const source of c.relevant) ok(!superseded.includes(idOfSource(source)), `${c.id}: ${source}`);
}

/** The negative case expects nothing, every other case something. */
export function assertNegativeCaseOnly(golden: Golden): void {
  deepStrictEqual(new Map(golden.cases.map((c) => [c.id, c])).get(NEGATIVE_CASE)?.relevant, []);
  for (const c of golden.cases) if (c.id !== NEGATIVE_CASE) ok(c.relevant.length > 0, c.id);
}
