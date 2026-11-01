// The project's files as a brief lists them. Run:
//   node --test tests/shared/domain/dev/project-files.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  PROJECT_FILES_HEADING, PROJECT_LIST_RULE, parseTrackedFiles, projectFileLines,
} from "../../../../src/shared/domain/dev/project-files.ts";
import { CLOSING_CASES, CUT_LINE_MENTIONS, LINES_CASES, LISTING, LIST_RULE_CASES, PARSED } from "./project-files.fixtures.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";

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
    });
  }

  for (const c of CLOSING_CASES) {
    it(c.name, () => {
      // Arrange
      const max = c.max;

      // Act
      const lines = projectFileLines(PARSED, max);

      // Assert
      assertMentions(lines.at(-1) ?? "", c.mentions);
    });
  }

  it("opens with the heading", () => {
    // Arrange
    const files = PARSED;

    // Act
    const lines = projectFileLines(files);

    // Assert
    strictEqual(lines[0], PROJECT_FILES_HEADING);
  });

  it("names the count left out, that an absent name may exist and the glob that finds it on a cut list", () => {
    // Arrange
    const max = 2;

    // Act
    const last = projectFileLines(PARSED, max).at(-1) ?? "";

    // Assert
    assertMentions(last, CUT_LINE_MENTIONS);
  });

  it("never says an absent name does not exist on a cut list", () => {
    // Arrange
    const max = 2;

    // Act
    const text = projectFileLines(PARSED, max).join("\n");

    // Assert
    assertOmits(text, ["does not exist"]);
  });
});

describe("PROJECT_LIST_RULE", () => {
  for (const c of LIST_RULE_CASES) {
    it(c.name, () => {
      // Arrange
      const rule = PROJECT_LIST_RULE;

      // Act
      const text = rule.trim();

      // Assert
      assertMentions(text, c.mentions);
    });
  }
});
