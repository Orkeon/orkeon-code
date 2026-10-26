// Unit tests for the memory entry checks. Run:
//   node --test src/shared/domain/shared-memory/entry.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { ENTRY_KEYS, ENTRY_TYPES, entryIdPrefix, entryProblems } from "../../../../src/shared/domain/shared-memory/entry.ts";
import type { EntryType } from "../../../../src/shared/domain/shared-memory/entry.ts";
import { ASSIGNED_TOKEN, AWS_KEY, BODY, ONE_PROBLEM, base, provenanceMarkers } from "./entry.fixtures.ts";

describe("entryIdPrefix", () => {
  it("joins project, type and the compact date", () => {
    // Arrange
    const project = "shop";

    // Act
    const prefix = entryIdPrefix(project, "code-structure", "2026-10-22");

    // Assert
    strictEqual(prefix, "shop-code-structure-20261022-");
  });
});

describe("entryProblems", () => {
  for (const type of ENTRY_TYPES) {
    it(`accepts a valid ${type}`, () => {
      // Arrange
      const entry = base(type);

      // Act
      const problems = entryProblems(entry);

      // Assert
      deepStrictEqual(problems, []);
    });
  }

  for (const c of ONE_PROBLEM) {
    it(`${c.name}: one problem`, () => {
      // Arrange
      const entry = base(c.type ?? "decision", c.over);

      // Act
      const problems = entryProblems(entry);

      // Assert
      deepStrictEqual(problems, [c.problem]);
    });
  }

  it("type outside the four", () => {
    // Arrange
    const entry = base("decision", { type: "rule" as EntryType, id: "shop-rule-20261022-sample-slug" });

    // Act
    const problems = entryProblems(entry);

    // Assert
    deepStrictEqual(problems, ["type must be one of decision, code-structure, method, mistake"]);
  });

  it("project not kebab (the id cannot be kebab either)", () => {
    // Arrange
    const entry = base("decision", { project: "Shop", id: "Shop-decision-20261022-x" });

    // Act
    const problems = entryProblems(entry);

    // Assert
    deepStrictEqual(problems, [
      "id 'Shop-decision-20261022-x' is not Shop-decision-20261022-<slug>",
      "project 'Shop' is not a kebab-case name",
    ]);
  });

  it("date not a calendar date", () => {
    // Arrange
    const entry = base("decision", { date: "2026-02-30", id: "shop-decision-20260230-x" });

    // Act
    const problems = entryProblems(entry);

    // Assert
    deepStrictEqual(problems, ["date '2026-02-30' is not YYYY-MM-DD"]);
  });

  it("lists the problems in the table order", () => {
    // Arrange
    const entry = base("decision", { title: "", rationale: "", tags: ["A"] });

    // Act
    const problems = entryProblems(entry);

    // Assert
    deepStrictEqual(problems, [
      "title must be one line of 1 to 90 characters", "rationale is empty", "tags item 'A' is not a lower-case token",
    ]);
  });

  it("names the key and the pattern of a secret, never the matched text", () => {
    // Arrange
    const entry = base("decision", { rationale: `the key ${AWS_KEY} leaked`, body: `${BODY}\n${AWS_KEY}\n` });

    // Act
    const problems = entryProblems(entry);

    // Assert
    deepStrictEqual(problems, [
      "rationale looks like it holds a secret (AWS access key id)",
      "body looks like it holds a secret (AWS access key id)",
    ]);
    ok(problems.every((p) => !p.includes(AWS_KEY)), "a problem quotes the secret");
  });

  it("checks list values too", () => {
    // Arrange
    const entry = base("decision", { tags: [ASSIGNED_TOKEN] });

    // Act
    const problems = entryProblems(entry);

    // Assert
    deepStrictEqual(problems, [
      `tags item '${ASSIGNED_TOKEN}' is not a lower-case token`,
      "tags looks like it holds a secret (assigned secret)",
    ]);
  });

  it("names a provenance marker by its source", () => {
    // Arrange
    const entry = base("decision", { title: "From Forbidden Product notes" });

    // Act
    const problems = entryProblems(entry, provenanceMarkers());

    // Assert
    deepStrictEqual(problems, ["title carries a provenance marker (forbidden[ -]?product)"]);
  });

  it("ignores a g flag: a second check with the same markers names the marker again", () => {
    // Arrange
    const markers = provenanceMarkers();
    const entry = base("decision", { title: "From Forbidden Product notes" });
    const first = entryProblems(entry, markers);

    // Act
    const second = entryProblems(entry, markers);

    // Assert
    deepStrictEqual(first, ["title carries a provenance marker (forbidden[ -]?product)"]);
    deepStrictEqual(second, ["title carries a provenance marker (forbidden[ -]?product)"]);
  });

  it("finds no provenance marker in an entry that carries none", () => {
    // Arrange
    const entry = base("decision");

    // Act
    const problems = entryProblems(entry, provenanceMarkers());

    // Assert
    deepStrictEqual(problems, []);
  });

  it("knows the sixteen keys", () => {
    // Arrange
    const expected = 16;

    // Act
    const count = ENTRY_KEYS.length;

    // Assert
    strictEqual(count, expected);
  });
});
