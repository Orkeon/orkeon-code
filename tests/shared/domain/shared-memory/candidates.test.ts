// The generated lists of the shared memory (M-4). Run: node --test src/shared/domain/shared-memory/candidates.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";

import { CANDIDATES_TITLE, INDEX_TITLE, batchesOf, candidatesList, decidedPointer, entriesIndex } from "../../../../src/shared/domain/shared-memory/candidates.ts";
import { parseEntry } from "../../../../src/shared/domain/shared-memory/front-matter.ts";
import { BATCHES_OF, DECISION_AND_SUPERSEDED_METHOD, METHOD_THEN_MISTAKE, POINTERS, POINTERS_PARSED } from "./candidates.fixtures.ts";
import { assertRow } from "./candidates.assertions.ts";

describe("the candidates list and the index", () => {
  it("lists the candidates by id, a pipe of a cell escaped", () => {
    // Arrange
    const [, a] = METHOD_THEN_MISTAKE;

    // Act
    const text = candidatesList(METHOD_THEN_MISTAKE);

    // Assert
    const lines = text.trimEnd().split("\n");
    strictEqual(lines[0], CANDIDATES_TITLE);
    strictEqual(lines[4], "| id | type | topic | source | batches |");
    assertRow(lines[7], `| ${a.id} | mistake | alpha |`, "| 2 |", "the mistake row");
    ok(lines[6].includes("a \\| b"), `method sorts before mistake, its pipe escaped: ${lines[6]}`);
    assertRow(lines[6], "", "| - |", "method sorts before mistake");
    ok(text.endsWith("\n"), "no final newline");
  });

  for (const c of BATCHES_OF) {
    it(`counts the distinct batches a source names: ${c.name}`, () => {
      // Arrange
      const { source } = c;

      // Act
      const batches = batchesOf(source);

      // Assert
      strictEqual(batches, c.batches);
    });
  }

  it("indexes the entries with their status", () => {
    // Arrange
    const entries = DECISION_AND_SUPERSEDED_METHOD;

    // Act
    const text = entriesIndex(entries);

    // Assert
    ok(text.startsWith(INDEX_TITLE), text);
    ok(text.includes("| shop-method-20261022-a | method | superseded | Title of a |"), text);
  });

  for (const c of POINTERS) {
    it(`turns a decided candidate into a pointer: ${c.name}`, () => {
      // Arrange
      const { status, file } = c;

      // Act
      const pointer = decidedPointer(status, "2026-10-24", file);

      // Assert
      ok(pointer.includes(c.names), pointer);
    });
  }

  for (const c of POINTERS_PARSED) {
    it(`reads the pointer of a ${c.name} candidate as no entry`, () => {
      // Arrange
      const pointer = decidedPointer(c.status, "2026-10-24", c.file);

      // Act
      const parsed = parseEntry(pointer);

      // Assert
      strictEqual(parsed.ok, false);
    });
  }
});
