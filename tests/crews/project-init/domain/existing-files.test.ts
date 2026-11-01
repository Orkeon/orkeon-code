// Run: node --test tests/crews/project-init/domain/existing-files.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  MAX_EXISTING_FILE_CHARS, clipExisting, cutMarker, instructionsTarget, proposalNote,
} from "../../../../src/crews/project-init/domain/existing-files.ts";
import { TARGETS } from "./existing-files.fixtures.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("clipExisting", () => {
  it(`keeps a file of ${MAX_EXISTING_FILE_CHARS} characters whole, with no cut`, () => {
    // Arrange
    const content = "a".repeat(MAX_EXISTING_FILE_CHARS);

    // Act
    const clipped = clipExisting("CLAUDE.md", content);

    // Assert
    deepStrictEqual(clipped, { file: "CLAUDE.md", content });
  });

  it("cuts a longer file at the bound and counts what it left out", () => {
    // Arrange
    const content = "a".repeat(MAX_EXISTING_FILE_CHARS + 7);

    // Act
    const clipped = clipExisting("CLAUDE.md", content);

    // Assert
    deepStrictEqual(clipped, { file: "CLAUDE.md", content: "a".repeat(MAX_EXISTING_FILE_CHARS), cut: 7 });
  });
});

describe("cutMarker", () => {
  it("says how many characters of the file are not shown", () => {
    // Arrange
    const omitted = 1234;

    // Act
    const marker = cutMarker(omitted);

    // Assert
    strictEqual(marker, "[… cut: 1234 characters of this file not shown …]");
  });
});

describe("instructionsTarget", () => {
  for (const c of TARGETS) {
    it(c.name, () => {
      // Arrange
      const { existing } = c;

      // Act
      const target = instructionsTarget(existing);

      // Assert
      strictEqual(target, c.expected);
    });
  }
});

describe("proposalNote", () => {
  it("adds nothing when no existing file was cut", () => {
    // Arrange
    const existing = [{ file: "CLAUDE.md", content: "x" }];

    // Act
    const note = proposalNote(existing);

    // Assert
    strictEqual(note, "");
  });

  it("names the cut file, the file left as it is and the proposal to merge", () => {
    // Arrange
    const existing = [{ file: "AGENTS.md", content: "y" }, { file: "CLAUDE.md", content: "x", cut: 5 }];

    // Act
    const note = proposalNote(existing);

    // Assert
    assertMentions(note, ["AGENTS.md left as it is", "CLAUDE.md is longer than 40000 characters", "review AGENTS.proposed.md and merge it by hand"]);
  });

  it("says AGENTS.md is not written when only CLAUDE.md exists and was cut", () => {
    // Arrange
    const existing = [{ file: "CLAUDE.md", content: "x", cut: 5 }];

    // Act
    const note = proposalNote(existing);

    // Assert
    assertMentions(note, ["; AGENTS.md not written, since CLAUDE.md is longer"]);
  });

  it("names every cut file in the plural when two were cut", () => {
    // Arrange
    const existing = [{ file: "AGENTS.md", content: "x", cut: 5 }, { file: "CLAUDE.md", content: "y", cut: 2 }];

    // Act
    const note = proposalNote(existing);

    // Assert
    assertMentions(note, ["since AGENTS.md, CLAUDE.md are longer than 40000 characters and the model saw only their start"]);
  });
});
