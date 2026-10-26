// Unit tests for the capture sections. Run:
//   node --test tests/crews/dev-verify/domain/capture-sections.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  buildFailure, buildLogProblem, classesIn, diffBase, isTestFile, isTestRoot, splitSection,
  tailLines, testClassesLine, testRunSummary, traitsSection, typeNameOf,
} from "../../../../src/crews/dev-verify/domain/capture-sections.ts";
import {
  CLASSES_LINE_CASES, CLASSES_SOURCE, DIFF_BASE_CASES, LOG_PROBLEM_CASES, SUMMARY_CASES, TEST_FILE_CASES,
  TEST_ROOT_CASES, lineBlock,
} from "./capture-sections.fixtures.ts";
import { assertContinuedOnLineBreak, assertPartsWithinMax } from "./capture-sections.assertions.ts";

describe("splitSection", () => {
  it("keeps 32 000 characters in one file", () => {
    // Arrange
    const content = "a".repeat(32_000);

    // Act
    const files = splitSection("build", content);

    // Assert
    deepStrictEqual(files.map((f) => f.name), ["build.txt"]);
    strictEqual(files[0].content.length, 32_000);
  });

  it("cuts 32 001 characters into two files on a line break, with the continuation line", () => {
    // Arrange
    const content = lineBlock(32_001);

    // Act
    const files = splitSection("diff-003", content);

    // Assert
    deepStrictEqual(files.map((f) => f.name), ["diff-003.txt", "diff-003-2.txt"]);
    assertPartsWithinMax(files);
    assertContinuedOnLineBreak(files, content);
  });

  it("cuts hard at 31 000 without a line break", () => {
    // Arrange
    const content = "z".repeat(40_000);

    // Act
    const files = splitSection("diff-001", content);

    // Assert
    strictEqual(files.length, 2);
    strictEqual(files[0].content, `${"z".repeat(31_000)}\n[continued in diff-001-2.txt]\n`);
    strictEqual(files[1].content, "z".repeat(9_000));
  });

  it("stops at 10 parts with the cut line", () => {
    // Arrange
    const content = "q".repeat(31_000 * 10 + 5_000);

    // Act
    const files = splitSection("diff-002", content);

    // Assert
    strictEqual(files.length, 10);
    strictEqual(files[9].name, "diff-002-10.txt");
    ok(files[9].content.endsWith("\n[cut: 5000 more characters not captured]\n"));
    assertPartsWithinMax(files);
  });

  for (const c of DIFF_BASE_CASES) {
    it(`names a diff by its index: ${c.index}`, () => {
      // Arrange
      const { index } = c;

      // Act
      const base = diffBase(index);

      // Assert
      strictEqual(base, c.expected);
    });
  }
});

describe("buildLogProblem", () => {
  it("is null on a green log", () => {
    // Arrange
    const log = "Build succeeded.\n    0 Error(s)\nexit=0\n";

    // Act
    const problem = buildLogProblem(log);

    // Assert
    strictEqual(problem, null);
  });

  for (const c of LOG_PROBLEM_CASES) {
    it(`finds each failure form: ${c.name}`, () => {
      // Arrange
      const { log } = c;

      // Act
      const problem = buildLogProblem(log);

      // Assert
      strictEqual(problem, c.expected);
    });
  }
});

describe("buildFailure", () => {
  it("keeps the first 6 failing lines and the first as why", () => {
    // Arrange
    const out = Array.from({ length: 8 }, (_, i) => `error E${i}`).join("\n");

    // Act
    const f = buildFailure(`start\n${out}\nend\n`);

    // Assert
    strictEqual(f.lines.length, 6);
    strictEqual(f.why, "error E0");
  });

  it("falls back on the last 6 lines and the last line, cut at 120", () => {
    // Arrange
    const long = "w".repeat(150);

    // Act
    const f = buildFailure(`1\n2\n3\n4\n5\n6\n7\n${long}\n`);

    // Assert
    deepStrictEqual(f.lines, ["3", "4", "5", "6", "7", long]);
    strictEqual(f.why, "w".repeat(120));
  });
});

describe("tailLines and testRunSummary", () => {
  it("gives the last lines", () => {
    // Arrange
    const text = "a\nb\nc\n";

    // Act
    const lines = tailLines(text, 2);

    // Assert
    deepStrictEqual(lines, ["b", "c"]);
  });

  for (const c of SUMMARY_CASES) {
    it(c.name, () => {
      // Arrange
      const { tail } = c;

      // Act
      const summary = testRunSummary(tail);

      // Assert
      deepStrictEqual(summary, c.expected);
    });
  }
});

describe("classes and test files", () => {
  it("lists classes sorted and unique, then describe names", () => {
    // Arrange
    const src = CLASSES_SOURCE;

    // Act
    const classes = classesIn(src);

    // Assert
    deepStrictEqual(classes, ["Alpha", "Zeta", "Zeta2", "the order lines"]);
  });

  for (const c of TEST_ROOT_CASES) {
    it(`tells a test root: ${c.path}`, () => {
      // Arrange
      const { path } = c;

      // Act
      const root = isTestRoot(path);

      // Assert
      strictEqual(root, c.expected);
    });
  }

  for (const c of TEST_FILE_CASES) {
    it(`tells a test file: ${c.name}`, () => {
      // Arrange
      const { path, roots } = c;

      // Act
      const testFile = isTestFile(path, roots);

      // Assert
      strictEqual(testFile, c.expected);
    });
  }

  it("names the type by the basename up to the first dot", () => {
    // Arrange
    const path = "src/a/Order.Lines.cs";

    // Act
    const name = typeNameOf(path);

    // Assert
    strictEqual(name, "Order");
  });

  for (const c of CLASSES_LINE_CASES) {
    it(`renders the test-classes lines: ${c.name}`, () => {
      // Arrange
      const [path, classes, testFiles, why] = c.args;

      // Act
      const line = testClassesLine(path, classes, testFiles, why);

      // Assert
      strictEqual(line, c.expected);
    });
  }
});

describe("traitsSection", () => {
  it("says when the pack has no marker", () => {
    // Arrange
    const marker = null;

    // Act
    const section = traitsSection(marker, ["BR-01"], null);

    // Assert
    strictEqual(section, "not checked — the pack has no tests.rule_trait or tests.trait_pattern\n");
  });

  it("lists the marker, the ids and the hits rewritten", () => {
    // Arrange
    const hits = ["tests/a.cs:12:[Trait(\"BR\", \"BR-01\")]"];

    // Act
    const section = traitsSection('[Trait("BR", "<id>")]', ["BR-01", "BR-02"], hits);

    // Assert
    strictEqual(section,
      '[Trait("BR", "<id>")]'.replace(/^/, "marker: ") + "\nids of the sheet: BR-01 BR-02\ntests/a.cs:12 [Trait(\"BR\", \"BR-01\")]\n");
  });
});
