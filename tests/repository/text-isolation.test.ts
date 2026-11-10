// Where the text of src/ lives (ADR 0026): no prose in a logic file, no logic in a text file, beyond the named
// exceptions.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { TEXT_FILES, TEXT_FILE_EXCEPTIONS, logicProblems, textFileLogic, textLiterals, textProblems, unusedExceptions } from "./text-isolation.ts";
import {
  CODE_CASES, COMMAND_FILE, COMMAND_SOURCE, DESCRIPTION_EXCEPTION, EXCEPTED_IMPORT, EXCEPTION_LISTS, LOGIC_CASES, LOGIC_CASE_FILE,
  LOOP_SOURCE, PROSE_CASES, SENTENCE_SOURCE, STALE_EXCEPTION, TEXT_CASES, TEXT_FILE_CASES, constructsOf, ownersIn, ownersOf,
  repositoryLogic, repositoryProse, srcScan,
} from "./text-isolation.fixtures.ts";
import { assertNoLogic, assertNoProse, assertNoStaleException } from "./text-isolation.assertions.ts";

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
    const owners = textLiterals(COMMAND_FILE, COMMAND_SOURCE).map((l) => ({ file: COMMAND_FILE, owner: l.owner }));

    // Act
    const unused = unusedExceptions(owners, [DESCRIPTION_EXCEPTION, STALE_EXCEPTION]);

    // Assert
    deepStrictEqual(unused, [STALE_EXCEPTION]);
  });
});

describe("text isolation: the logic of a text file", () => {
  for (const c of [...LOGIC_CASES, ...TEXT_CASES]) {
    it(c.name, () => {
      // Arrange
      const source = c.source;

      // Act
      const logic = textFileLogic(LOGIC_CASE_FILE, source);

      // Assert
      deepStrictEqual(constructsOf(logic), c.expected);
    });
  }

  it("reads no logic in a logic file", () => {
    // Arrange
    const source = LOOP_SOURCE;

    // Act
    const logic = textFileLogic("src/crews/dev-plan/application/plan-brief.ts", source);

    // Assert
    deepStrictEqual(logic, []);
  });

  it("lets the value an exception names stand, not the other value of the same import", () => {
    // Arrange
    const logic = textFileLogic(EXCEPTED_IMPORT.file, EXCEPTED_IMPORT.source);

    // Act
    const problems = logicProblems(EXCEPTED_IMPORT.file, logic, TEXT_FILE_EXCEPTIONS);

    // Assert
    deepStrictEqual(problems, [`${EXCEPTED_IMPORT.file}:1: OTHER: value imported from ../../../shared/application/config-store.ts`]);
  });
});

describe("text isolation: the repository", () => {
  it("no logic file of src/ holds prose beyond the named exceptions", () => {
    // Arrange
    const files = srcScan();

    // Act
    const problems = repositoryProse(files);

    // Assert
    assertNoProse(problems);
  });

  it("no text file of src/ holds logic beyond the named exceptions", () => {
    // Arrange
    const files = srcScan();

    // Act
    const problems = repositoryLogic(files);

    // Assert
    assertNoLogic(problems);
  });

  for (const list of EXCEPTION_LISTS) {
    it(`every exception for the ${list.found} found still matches one in src/`, () => {
      // Arrange
      const owners = ownersIn(srcScan(), list.found);

      // Act
      const unused = unusedExceptions(owners, list.exceptions);

      // Assert
      assertNoStaleException(unused);
    });
  }
});
