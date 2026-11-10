// Where the text of src/ lives (ADR 0026): no prose in a logic file beyond the named exceptions. A ratchet for now:
// a file may hold the count text-isolation-baseline.ts gives it, never more.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { TEXT_EXCEPTIONS, TEXT_FILES, textLiterals, textProblems, unusedExceptions } from "./text-isolation.ts";
import { TEXT_BASELINE } from "./text-isolation-baseline.ts";
import {
  CODE_CASES, COMMAND_FILE, COMMAND_SOURCE, PROSE_CASES, SENTENCE_SOURCE, STALE_EXCEPTION, TEXT_FILE_CASES, ownersOf,
  repositoryCounts, srcFiles,
} from "./text-isolation.fixtures.ts";
import { assertNoStaleException, assertWithinBaseline } from "./text-isolation.assertions.ts";

describe("text isolation: the detector", () => {
  for (const c of [...PROSE_CASES, ...CODE_CASES]) {
    it(c.name, () => {
      // Arrange
      const source = c.source;

      // Act
      const literals = textLiterals("src/a.ts", source);

      // Assert
      deepStrictEqual(ownersOf(literals), c.expected);
    });
  }

  for (const c of TEXT_FILE_CASES) {
    it(`${c.text ? "counts" : "does not count"} ${c.file} as a text file`, () => {
      // Arrange
      const file = c.file;

      // Act
      const text = TEXT_FILES(file);

      // Assert
      strictEqual(text, c.text);
    });
  }

  it("reads nothing in a text file", () => {
    // Arrange
    const source = SENTENCE_SOURCE;

    // Act
    const literals = textLiterals("src/crews/dev-plan/application/prompts.ts", source);

    // Assert
    deepStrictEqual(literals, []);
  });

  it("reads nothing in a declaration file", () => {
    // Arrange
    const source = SENTENCE_SOURCE;

    // Act
    const literals = textLiterals("src/orkeon.d.ts", source);

    // Assert
    deepStrictEqual(literals, []);
  });

  it("lets the description of a command stand, not the other text of its file", () => {
    // Arrange
    const source = COMMAND_SOURCE;

    // Act
    const problems = textProblems(COMMAND_FILE, source);

    // Assert
    deepStrictEqual(problems, [`${COMMAND_FILE}:4: run: "nothing to plan here yet"`]);
  });

  it("matches no exception outside the files it names", () => {
    // Arrange
    const source = COMMAND_SOURCE;

    // Act
    const problems = textProblems("src/commands/_lib/dev/dev.ts", source);

    // Assert
    strictEqual(problems.length, 2);
  });

  it("names an exception that matches no literal", () => {
    // Arrange
    const files = [{ file: COMMAND_FILE, text: COMMAND_SOURCE }];

    // Act
    const unused = unusedExceptions(files, [...TEXT_EXCEPTIONS, STALE_EXCEPTION]);

    // Assert
    deepStrictEqual(unused, [STALE_EXCEPTION]);
  });
});

describe("text isolation: the repository", () => {
  it("no file of src/ holds more prose than its baseline", () => {
    // Arrange
    const baseline = TEXT_BASELINE;

    // Act
    const counts = repositoryCounts();

    // Assert
    assertWithinBaseline(counts, baseline);
  });

  it("every exception still matches a literal of src/", () => {
    // Arrange
    const files = srcFiles();

    // Act
    const unused = unusedExceptions(files);

    // Assert
    assertNoStaleException(unused);
  });
});
