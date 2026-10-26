// The shape of every test of the repository: Arrange, Act, Assert (CONTRIBUTING.md, "Tests"); no clock nor timer
// in test code (tests/scripts/ aside); every double in tests/support/doubles/; every test of src/ beside its module.
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { clockProblems, doubleProblems, moduleProblem, sectionProblem, shapeProblems } from "./test-shape.ts";
import {
  AAA_TEST, BARE_TEST, CLOCK_CASES, DOUBLE_CASES, LOOP_TESTS, METHODS, MODULE_CASES, NOT_TESTS, OUT_OF_ORDER_TEST, PORTS,
  TWO_ACTS_TEST, filesUnder, readRepo, repositoryDoubleMethods, repositoryPorts,
} from "./test-shape.fixtures.ts";

describe("test shape: the check", () => {
  it("passes a test laid out Arrange, Act, Assert", () => {
    // Arrange
    const source = AAA_TEST;

    // Act
    const problems = shapeProblems("a.test.ts", source);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("names the first section a bare test lacks, with its file and line", () => {
    // Arrange
    const source = BARE_TEST;

    // Act
    const problems = shapeProblems("a.test.ts", source);

    // Assert
    deepStrictEqual(problems, ['a.test.ts:2: adds: no "// Arrange" line']);
  });

  it("refuses a second act", () => {
    // Arrange
    const source = TWO_ACTS_TEST;

    // Act
    const problems = shapeProblems("a.test.ts", source);

    // Assert
    deepStrictEqual(problems, ['a.test.ts:2: adds: "// Act" 2 times: one act per test']);
  });

  it("refuses sections out of order", () => {
    // Arrange
    const body = OUT_OF_ORDER_TEST;

    // Act
    const problem = sectionProblem(body);

    // Assert
    deepStrictEqual(problem, "the sections are not in the order Arrange, Act, Assert");
  });

  it("checks the tests a loop builds and an async test(), inside a describe", () => {
    // Arrange
    const source = LOOP_TESTS;

    // Act
    const problems = shapeProblems("a.test.ts", source);

    // Assert
    deepStrictEqual(problems, ['a.test.ts:13: adds zero: no "// Arrange" line']);
  });

  it("leaves alone the calls that declare no test", () => {
    // Arrange
    const source = NOT_TESTS;

    // Act
    const problems = shapeProblems("a.test.ts", source);

    // Assert
    deepStrictEqual(problems, []);
  });
});

describe("test shape: clock, doubles and modules", () => {
  for (const c of CLOCK_CASES) {
    it(c.name, () => {
      // Arrange
      const { file, text } = c;

      // Act
      const problems = clockProblems(file, text);

      // Assert
      deepStrictEqual(problems, c.problems);
    });
  }

  for (const c of DOUBLE_CASES) {
    it(c.name, () => {
      // Arrange
      const { file, text } = c;

      // Act
      const problems = doubleProblems(file, text, PORTS, METHODS);

      // Assert
      deepStrictEqual(problems, c.problems);
    });
  }

  for (const c of MODULE_CASES) {
    it(c.name, () => {
      // Arrange
      const files = new Set(c.files);

      // Act
      const problem = moduleProblem(c.file, files);

      // Assert
      strictEqual(problem, c.problem);
    });
  }
});

describe("test shape: the repository", () => {
  it("every test is laid out Arrange, Act, Assert", () => {
    // Arrange
    const files = [...filesUnder("src"), ...filesUnder("tests")].filter((f) => f.endsWith(".test.ts"));

    // Act
    const problems = files.flatMap((f) => shapeProblems(f, readRepo(f)));

    // Assert
    deepStrictEqual(problems, []);
  });

  it("no test code reads the clock or starts a timer, tests/scripts/ aside", () => {
    // Arrange
    const files = [...filesUnder("src"), ...filesUnder("tests")];

    // Act
    const problems = files.flatMap((f) => clockProblems(f, readRepo(f)));

    // Assert
    deepStrictEqual(problems, []);
  });

  it("reads the ports from every file of application/ports/", () => {
    // Arrange
    const expected = ["Shell", "Files", "HumanInput", "Llm", "SharedMemory"];

    // Act
    const ports = repositoryPorts();

    // Assert
    deepStrictEqual(expected.filter((name) => !ports.has(name)), []);
  });

  it("every double lives in tests/support/doubles/", () => {
    // Arrange
    const files = [...filesUnder("src"), ...filesUnder("tests")];
    const ports = repositoryPorts();
    const methods = repositoryDoubleMethods();

    // Act
    const problems = files.flatMap((f) => doubleProblems(f, readRepo(f), ports, methods));

    // Assert
    deepStrictEqual(problems, []);
  });

  it("every test of src/ sits beside its module", () => {
    // Arrange
    const files = new Set(filesUnder("src"));

    // Act
    const problems = [...files].flatMap((f) => moduleProblem(f, files) ?? []);

    // Assert
    deepStrictEqual(problems, []);
  });
});
