// Unit tests for the capture sections. Run:
//   node --test src/crews/dev-verify/domain/capture-sections.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  MAX_SECTION_CHARS, buildFailure, buildLogProblem, classesIn, diffBase, isTestFile, isTestRoot, splitSection,
  tailLines, testClassesLine, testRunSummary, traitsSection, typeNameOf,
} from "./capture-sections.ts";

function lineBlock(chars: number): string {
  // lines of 99 characters plus a line break, then padding to the exact length
  let s = "";
  while (s.length + 100 <= chars) s += `${"x".repeat(99)}\n`;
  return s + "y".repeat(chars - s.length);
}

describe("splitSection", () => {
  it("keeps 32 000 characters in one file", () => {
    const files = splitSection("build", "a".repeat(32_000));
    deepStrictEqual(files.map((f) => f.name), ["build.txt"]);
    strictEqual(files[0].content.length, 32_000);
  });

  it("cuts 32 001 characters into two files on a line break, with the continuation line", () => {
    const content = lineBlock(32_001);
    const files = splitSection("diff-003", content);
    deepStrictEqual(files.map((f) => f.name), ["diff-003.txt", "diff-003-2.txt"]);
    for (const f of files) ok(f.content.length <= MAX_SECTION_CHARS, `${f.name} is ${f.content.length}`);
    ok(files[0].content.endsWith("\n\n[continued in diff-003-2.txt]\n"));
    const first = files[0].content.slice(0, -"\n[continued in diff-003-2.txt]\n".length);
    strictEqual(first.length, 31_000);
    ok(first.endsWith("\n"));
    strictEqual(first + files[1].content, content);
  });

  it("cuts hard at 31 000 without a line break", () => {
    const files = splitSection("diff-001", "z".repeat(40_000));
    strictEqual(files.length, 2);
    strictEqual(files[0].content, `${"z".repeat(31_000)}\n[continued in diff-001-2.txt]\n`);
    strictEqual(files[1].content, "z".repeat(9_000));
  });

  it("stops at 10 parts with the cut line", () => {
    const files = splitSection("diff-002", "q".repeat(31_000 * 10 + 5_000));
    strictEqual(files.length, 10);
    strictEqual(files[9].name, "diff-002-10.txt");
    ok(files[9].content.endsWith("\n[cut: 5000 more characters not captured]\n"));
    for (const f of files) ok(f.content.length <= MAX_SECTION_CHARS);
  });

  it("names a diff by its index", () => {
    strictEqual(diffBase(1), "diff-001");
    strictEqual(diffBase(40), "diff-040");
  });
});

describe("buildLogProblem", () => {
  it("is null on a green log", () => {
    strictEqual(buildLogProblem("Build succeeded.\n    0 Error(s)\nexit=0\n"), null);
  });
  it("finds each failure form", () => {
    strictEqual(buildLogProblem("x\nBuild FAILED.\n"), "Build FAILED.");
    strictEqual(buildLogProblem("a.cs(3,4): error CS1002: ; expected\n"), "a.cs(3,4): error CS1002: ; expected");
    strictEqual(buildLogProblem("error TS2304 here\n"), "error TS2304 here");
    strictEqual(buildLogProblem("done\nexit=1\n"), "exit=1");
    strictEqual(buildLogProblem("Xerror CS1\n"), null);
    strictEqual(buildLogProblem("no exit=1 at the start\n"), null);
  });
});

describe("buildFailure", () => {
  it("keeps the first 6 failing lines and the first as why", () => {
    const out = Array.from({ length: 8 }, (_, i) => `error E${i}`).join("\n");
    const f = buildFailure(`start\n${out}\nend\n`);
    strictEqual(f.lines.length, 6);
    strictEqual(f.why, "error E0");
  });
  it("falls back on the last 6 lines and the last line, cut at 120", () => {
    const long = "w".repeat(150);
    const f = buildFailure(`1\n2\n3\n4\n5\n6\n7\n${long}\n`);
    deepStrictEqual(f.lines, ["3", "4", "5", "6", "7", long]);
    strictEqual(f.why, "w".repeat(120));
  });
});

describe("tailLines and testRunSummary", () => {
  it("gives the last lines", () => {
    deepStrictEqual(tailLines("a\nb\nc\n", 2), ["b", "c"]);
  });
  it("reads VSTest lines, summed", () => {
    deepStrictEqual(testRunSummary(["Failed!  - Failed: 1, Passed: 4", "Passed!  - Failed: 0, Passed: 3"]),
      { passed: 7, failed: 1, exit: null });
  });
  it("reads Microsoft.Testing.Platform lines", () => {
    deepStrictEqual(testRunSummary(["  failed: 0", "  succeeded: 12 ", "exit=0"]), { passed: 12, failed: 0, exit: 0 });
  });
  it("keeps the last exit line", () => {
    deepStrictEqual(testRunSummary(["exit=0", "exit=3"]), { passed: null, failed: null, exit: 3 });
  });
  it("reads Node's runner summary in both forms", () => {
    deepStrictEqual(testRunSummary(["ℹ tests 5", "ℹ pass 5", "ℹ fail 0"]), { passed: 5, failed: 0, exit: null });
    deepStrictEqual(testRunSummary(["# pass 2", "# fail 1"]), { passed: 2, failed: 1, exit: null });
  });
  it("is unknown without a summary", () => {
    deepStrictEqual(testRunSummary(["ran things"]), { passed: null, failed: null, exit: null });
  });
});

describe("classes and test files", () => {
  it("lists classes sorted and unique, then describe names", () => {
    const src = 'public class Zeta {}\nrecord Alpha(int X);\nclass Zeta2 {}\ndescribe("the order lines", () => {});\ndescribe(`Alpha`, () => {});';
    deepStrictEqual(classesIn(src), ["Alpha", "Zeta", "Zeta2", "the order lines"]);
  });
  it("tells a test root and a test file", () => {
    strictEqual(isTestRoot("Tests/Unit"), true);
    strictEqual(isTestRoot("src"), false);
    strictEqual(isTestFile("specs/a.ts", ["specs/"]), true);
    strictEqual(isTestFile("src/OrderTests.cs", []), true);
    strictEqual(isTestFile("src/Order.cs", ["tests"]), false);
  });
  it("names the type by the basename up to the first dot", () => {
    strictEqual(typeNameOf("src/a/Order.Lines.cs"), "Order");
  });
  it("renders the test-classes lines", () => {
    strictEqual(testClassesLine("tests/a.ts", ["A", "B"], null), "tests/a.ts: A, B");
    strictEqual(testClassesLine("tests/a.ts", [], null), "tests/a.ts: no class found");
    strictEqual(testClassesLine("src/Order.cs", null, ["tests/x.cs", "tests/y.cs"]), "src/Order.cs -> tests naming Order: tests/x.cs, tests/y.cs");
    strictEqual(testClassesLine("src/Order.cs", null, []), "src/Order.cs -> tests naming Order: none");
    strictEqual(testClassesLine("src/Order.cs", null, null, "no test root given"), "src/Order.cs -> tests naming Order: no test root given");
  });
});

describe("traitsSection", () => {
  it("says when the pack has no marker", () => {
    strictEqual(traitsSection(null, ["BR-01"], null), "not checked — the pack has no tests.rule_trait or tests.trait_pattern\n");
  });
  it("lists the marker, the ids and the hits rewritten", () => {
    strictEqual(traitsSection('[Trait("BR", "<id>")]', ["BR-01", "BR-02"], ["tests/a.cs:12:[Trait(\"BR\", \"BR-01\")]"]),
      '[Trait("BR", "<id>")]'.replace(/^/, "marker: ") + "\nids of the sheet: BR-01 BR-02\ntests/a.cs:12 [Trait(\"BR\", \"BR-01\")]\n");
  });
});
