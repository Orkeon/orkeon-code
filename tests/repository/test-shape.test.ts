// The shape of every test of the repository: Arrange, Act, Assert (CONTRIBUTING.md, "Tests").
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { posix } from "node:path";
import { fileURLToPath } from "node:url";
import { sectionProblem, shapeProblems } from "./test-shape.ts";
import { AAA_TEST, BARE_TEST, LOOP_TESTS, NOT_TESTS, OUT_OF_ORDER_TEST, TWO_ACTS_TEST } from "./test-shape.fixtures.ts";

const ROOT = posix.join(posix.dirname(fileURLToPath(import.meta.url)), "../..");

function testFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(posix.join(ROOT, dir)).sort()) {
    if (e.startsWith(".") || e === "node_modules") continue;
    const rel = posix.join(dir, e);
    if (statSync(posix.join(ROOT, rel)).isDirectory()) testFiles(rel, acc);
    else if (rel.endsWith(".test.ts")) acc.push(rel);
  }
  return acc;
}

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

describe("test shape: the repository", () => {
  it("every test is laid out Arrange, Act, Assert", () => {
    // Arrange
    const files = [...testFiles("src"), ...testFiles("tests")];

    // Act
    const problems = files.flatMap((f) => shapeProblems(f, readFileSync(posix.join(ROOT, f), "utf-8")));

    // Assert
    deepStrictEqual(problems, []);
  });
});
