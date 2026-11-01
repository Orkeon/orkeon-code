// Run: node --test tests/crews/project-init/domain/existing-files.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  MAX_EXISTING_FILE_CHARS, MAX_EXISTING_FILES_CHARS, clipExisting, clipExistingFiles, instructionsTarget, proposalNote,
} from "../../../../src/crews/project-init/domain/existing-files.ts";
import { LEFT_FOR_THE_LAST, TARGETS, filesOverTheTotal } from "./existing-files.fixtures.ts";
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

describe("clipExistingFiles", () => {
  it(`cuts the later files to what is left of ${MAX_EXISTING_FILES_CHARS} characters in all`, () => {
    // Arrange
    const found = filesOverTheTotal();

    // Act
    const clipped = clipExistingFiles(found);

    // Assert
    deepStrictEqual(clipped.map((f) => [f.content.length, f.cut]), [
      [MAX_EXISTING_FILE_CHARS, undefined],
      [MAX_EXISTING_FILE_CHARS, undefined],
      [MAX_EXISTING_FILES_CHARS - 2 * MAX_EXISTING_FILE_CHARS - LEFT_FOR_THE_LAST, undefined],
      [LEFT_FOR_THE_LAST, 5_000],
    ]);
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
    assertMentions(note, ["AGENTS.md left as it is", `CLAUDE.md is cut (${MAX_EXISTING_FILE_CHARS} characters shown of a file, ${MAX_EXISTING_FILES_CHARS} in all)`, "review AGENTS.proposed.md and merge it by hand"]);
  });

  it("says AGENTS.md is not written when only CLAUDE.md exists and was cut", () => {
    // Arrange
    const existing = [{ file: "CLAUDE.md", content: "x", cut: 5 }];

    // Act
    const note = proposalNote(existing);

    // Assert
    assertMentions(note, ["; AGENTS.md not written, since CLAUDE.md is cut"]);
  });

  it("names every cut file in the plural when two were cut", () => {
    // Arrange
    const existing = [{ file: "AGENTS.md", content: "x", cut: 5 }, { file: "CLAUDE.md", content: "y", cut: 2 }];

    // Act
    const note = proposalNote(existing);

    // Assert
    assertMentions(note, [`since AGENTS.md, CLAUDE.md are cut (${MAX_EXISTING_FILE_CHARS} characters shown of a file, ${MAX_EXISTING_FILES_CHARS} in all) and the model saw only their start`]);
  });
});
