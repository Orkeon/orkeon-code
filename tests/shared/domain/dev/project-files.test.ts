// The project's files as a brief lists them. Run:
//   node --test tests/shared/domain/dev/project-files.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { PROJECT_FILES_HEADING, parseTrackedFiles, projectFileLines } from "../../../../src/shared/domain/dev/project-files.ts";
import { LINES_CASES, LISTING, PARSED } from "./project-files.fixtures.ts";

describe("parseTrackedFiles", () => {
  it("keeps the sources sorted, once each, the work folder and .orkeon/ left out", () => {
    // Arrange
    const stdout = LISTING;

    // Act
    const files = parseTrackedFiles(stdout, "workbench");

    // Assert
    deepStrictEqual(files, PARSED);
  });

  it("takes the work folder with or without its slash", () => {
    // Arrange
    const stdout = LISTING;

    // Act
    const files = parseTrackedFiles(stdout, "workbench/");

    // Assert
    deepStrictEqual(files, PARSED);
  });
});

describe("projectFileLines", () => {
  for (const c of LINES_CASES) {
    it(c.name, () => {
      // Arrange
      const { files, max } = c;

      // Act
      const lines = projectFileLines(files, max);

      // Assert
      strictEqual(lines.length, c.expectedCount, lines.join("\n"));
      strictEqual(lines.at(-1) ?? null, c.last);
    });
  }

  it("opens with the heading that says an absent name does not exist", () => {
    // Arrange
    const files = PARSED;

    // Act
    const lines = projectFileLines(files);

    // Assert
    strictEqual(lines[0], PROJECT_FILES_HEADING);
  });
});
