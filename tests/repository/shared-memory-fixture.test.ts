// The shared memory's reference set, checked offline: the fixture the probe
// (src/crews/_probe-shared-memory/probe.ork.ts) runs live. rag_eval needs the runtime, so
// this checks the fixture only: every entry validates with the repository's own parser and
// checks, ids are unique and match their file, every expected source exists, q08's target
// supersedes a `superseded` entry that no case expects, and q13 expects nothing.
// Run: node --test tests/repository/shared-memory-fixture.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { parseEntry } from "../../src/shared/domain/shared-memory/front-matter.ts";
import { entryProblems } from "../../src/shared/domain/shared-memory/entry.ts";
import { SUPERSESSION_CASE } from "../../src/crews/_probe-shared-memory/domain/probe-verdict.ts";
import {
  CASE_IDS, countByType, entryFiles, entryText, idOfSource, loadEntries, loadGolden, MARKERS,
} from "./shared-memory-fixture.fixtures.ts";
import {
  assertFilesNamedById, assertNegativeCaseOnly, assertRelevantAdmitted, assertSupersessionCase, assertSupersessionsLinked,
} from "./shared-memory-fixture.assertions.ts";
import { WORKSPACE } from "../../src/shared/domain/vfs.ts";

describe("the shared-memory fixture's entries", () => {
  it("holds 12 entries: 4 decisions, 3 code-structures, 3 methods, 2 mistakes, from several projects", () => {
    // Arrange
    const files = entryFiles();

    // Act
    const entries = loadEntries(files);

    // Assert
    strictEqual(files.length, 12);
    deepStrictEqual(countByType(files, ["decision", "code-structure", "method", "mistake"]), [4, 3, 3, 2]);
    ok(new Set([...entries.values()].map((e) => e.entry.project)).size >= 3);
  });

  for (const file of entryFiles()) {
    it(`parses and validates ${file} with the repository's own checks`, () => {
      // Arrange
      const text = entryText(file);

      // Act
      const parsed = parseEntry(text);

      // Assert
      ok(parsed.ok, `${file}: ${parsed.ok ? "" : parsed.problems.join("; ")}`);
      deepStrictEqual(entryProblems(parsed.entry, MARKERS), [], file);
    });
  }

  it("names every file <type>/<id>.md, so the ids are unique", () => {
    // Arrange
    const files = entryFiles();

    // Act
    const entries = loadEntries(files);

    // Assert
    assertFilesNamedById(entries, files);
  });

  it("links every supersession both ways, within one project", () => {
    // Arrange
    const files = entryFiles();

    // Act
    const entries = loadEntries(files);

    // Assert
    assertSupersessionsLinked(entries);
  });
});

describe("the reference set (golden.yaml, the rag_eval dataset shape)", () => {
  it("has the cases q01 to q14 with unique ids, a question each, and its own collection", () => {
    // Arrange
    const expectedIds = CASE_IDS;

    // Act
    const golden = loadGolden();

    // Assert
    deepStrictEqual(golden.cases.map((c) => c.id), expectedIds);
    ok(golden.cases.every((c) => c.question.trim() !== ""));
    strictEqual(golden.collection, "memory-eval-golden");
    strictEqual(golden.corpus, `${WORKSPACE}/.orkeon/memory/entries`);
  });

  it("names, in every relevant, an entry file of the fixture that is admitted", () => {
    // Arrange
    const entries = loadEntries();

    // Act
    const golden = loadGolden();

    // Assert
    assertRelevantAdmitted(golden, entries);
  });

  it("gives q08 a target that supersedes a superseded entry, and never expects a superseded id", () => {
    // Arrange
    const entries = loadEntries();
    const golden = loadGolden();
    const byCase = new Map(golden.cases.map((c) => [c.id, c]));

    // Act
    const target = entries.get(idOfSource(byCase.get(SUPERSESSION_CASE)?.relevant[0] ?? ""))?.entry;

    // Assert
    assertSupersessionCase(target, entries, golden);
  });

  it("expects nothing for q13, the negative case, and something for every other case", () => {
    // Arrange
    const load = loadGolden;

    // Act
    const golden = load();

    // Assert
    assertNegativeCaseOnly(golden);
  });

  it("asks q02 across two projects that disagree on one topic", () => {
    // Arrange
    const entries = loadEntries();
    const byCase = new Map(loadGolden().cases.map((c) => [c.id, c]));

    // Act
    const sources = byCase.get("q02")?.relevant.map((s) => entries.get(idOfSource(s))?.entry) ?? [];

    // Assert
    strictEqual(new Set(sources.map((e) => e?.project)).size, 2);
    strictEqual(new Set(sources.map((e) => e?.topic)).size, 1);
  });
});
