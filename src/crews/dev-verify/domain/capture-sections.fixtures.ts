// The texts and cases the capture sections are tested on.
import type { TestRunSummary, testClassesLine } from "./capture-sections.ts";

/** `chars` characters in lines of 99 characters plus a line break, then padding to the exact length. */
export function lineBlock(chars: number): string {
  let s = "";
  while (s.length + 100 <= chars) s += `${"x".repeat(99)}\n`;
  return s + "y".repeat(chars - s.length);
}

export interface DiffBaseCase {
  index: number;
  expected: string;
}

export const DIFF_BASE_CASES: readonly DiffBaseCase[] = [
  { index: 1, expected: "diff-001" },
  { index: 40, expected: "diff-040" },
];

export interface LogProblemCase {
  name: string;
  log: string;
  expected: string | null;
}

/** Each failure form a build log may show, and two lines that only look like one. */
export const LOG_PROBLEM_CASES: readonly LogProblemCase[] = [
  { name: "Build FAILED.", log: "x\nBuild FAILED.\n", expected: "Build FAILED." },
  { name: "a C# error", log: "a.cs(3,4): error CS1002: ; expected\n", expected: "a.cs(3,4): error CS1002: ; expected" },
  { name: "a TypeScript error", log: "error TS2304 here\n", expected: "error TS2304 here" },
  { name: "a non-zero exit line", log: "done\nexit=1\n", expected: "exit=1" },
  { name: "not an error glued to a word", log: "Xerror CS1\n", expected: null },
  { name: "not an exit line that does not start the line", log: "no exit=1 at the start\n", expected: null },
];

export interface SummaryCase {
  name: string;
  tail: readonly string[];
  expected: TestRunSummary;
}

export const SUMMARY_CASES: readonly SummaryCase[] = [
  {
    name: "reads VSTest lines, summed",
    tail: ["Failed!  - Failed: 1, Passed: 4", "Passed!  - Failed: 0, Passed: 3"],
    expected: { passed: 7, failed: 1, exit: null },
  },
  {
    name: "reads Microsoft.Testing.Platform lines",
    tail: ["  failed: 0", "  succeeded: 12 ", "exit=0"],
    expected: { passed: 12, failed: 0, exit: 0 },
  },
  { name: "keeps the last exit line", tail: ["exit=0", "exit=3"], expected: { passed: null, failed: null, exit: 3 } },
  {
    name: "reads Node's runner summary in its spec form",
    tail: ["ℹ tests 5", "ℹ pass 5", "ℹ fail 0"],
    expected: { passed: 5, failed: 0, exit: null },
  },
  { name: "reads Node's runner summary in its TAP form", tail: ["# pass 2", "# fail 1"], expected: { passed: 2, failed: 1, exit: null } },
  { name: "is unknown without a summary", tail: ["ran things"], expected: { passed: null, failed: null, exit: null } },
];

/** C# classes and records, then describe names, out of order and one twice. */
export const CLASSES_SOURCE =
  'public class Zeta {}\nrecord Alpha(int X);\nclass Zeta2 {}\ndescribe("the order lines", () => {});\ndescribe(`Alpha`, () => {});';

export interface TestRootCase {
  path: string;
  expected: boolean;
}

export const TEST_ROOT_CASES: readonly TestRootCase[] = [
  { path: "Tests/Unit", expected: true },
  { path: "src", expected: false },
];

export interface TestFileCase {
  name: string;
  path: string;
  roots: readonly string[];
  expected: boolean;
}

export const TEST_FILE_CASES: readonly TestFileCase[] = [
  { name: "a file under a test root", path: "specs/a.ts", roots: ["specs/"], expected: true },
  { name: "a file named as tests", path: "src/OrderTests.cs", roots: [], expected: true },
  { name: "a source file outside the test roots", path: "src/Order.cs", roots: ["tests"], expected: false },
];

export interface ClassesLineCase {
  name: string;
  args: Parameters<typeof testClassesLine>;
  expected: string;
}

export const CLASSES_LINE_CASES: readonly ClassesLineCase[] = [
  { name: "a test file and its classes", args: ["tests/a.ts", ["A", "B"], null], expected: "tests/a.ts: A, B" },
  { name: "a test file without a class", args: ["tests/a.ts", [], null], expected: "tests/a.ts: no class found" },
  {
    name: "a source file and the tests naming its type",
    args: ["src/Order.cs", null, ["tests/x.cs", "tests/y.cs"]],
    expected: "src/Order.cs -> tests naming Order: tests/x.cs, tests/y.cs",
  },
  { name: "a source file no test names", args: ["src/Order.cs", null, []], expected: "src/Order.cs -> tests naming Order: none" },
  {
    name: "a source file and why its tests were not searched",
    args: ["src/Order.cs", null, null, "no test root given"],
    expected: "src/Order.cs -> tests naming Order: no test root given",
  },
];
