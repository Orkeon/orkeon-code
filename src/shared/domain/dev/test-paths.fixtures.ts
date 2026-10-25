// Layouts and paths isTestPath and hasTestLayout are tested on.
import type { RepoPackLayout } from "./repo-pack.ts";
import { WORKSPACE } from "../vfs.ts";

type TestLayout = Pick<RepoPackLayout, "tests" | "testFiles">;

/** The pack's test folder and test file pattern. */
export const LAYOUT: TestLayout = { tests: "tests/", testFiles: ["src/*.test.ts"] };

export interface TestPathCase {
  name: string;
  path: string;
  layout: TestLayout;
  expected: boolean;
}

export const TEST_PATH_CASES: readonly TestPathCase[] = [
  { name: "reads a file of the test folder as a test", path: "tests/a.ts", layout: LAYOUT, expected: true },
  {
    name: "reads an absolute path matching a test file pattern as a test",
    path: `${WORKSPACE}/src/x/a.test.ts`, layout: LAYOUT, expected: true,
  },
  { name: "reads a source file as no test", path: "src/x/a.ts", layout: LAYOUT, expected: false },
  { name: "reads a folder that only starts like the test folder as no test", path: "tests2/a.ts", layout: LAYOUT, expected: false },
  { name: "reads nothing as a test when the test folder is empty", path: "src/a.ts", layout: { tests: "" }, expected: false },
];

export interface LayoutCase {
  name: string;
  layout: TestLayout;
  expected: boolean;
}

export const HAS_TEST_LAYOUT_CASES: readonly LayoutCase[] = [
  { name: "says a blank test folder names no test", layout: { tests: " " }, expected: false },
  { name: "says a test file pattern names tests", layout: { testFiles: ["*.spec.ts"] }, expected: true },
];
