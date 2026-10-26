// Unit tests for the frozen shell lines of /dev-verify. Run:
//   node --test src/crews/dev-verify/domain/commands.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  GIT_CHANGED_TRACKED, GIT_DIFF_CHECK, buildOutputProblem, excludePathspecs, findNewer,
  gitDiffTracked, gitDiffUntracked, gitMethodGrep, gitStatusShort, gitTestFilesNaming, gitTraitGrep, gitUntracked,
  shellWord,
} from "../../../../src/crews/dev-verify/domain/commands.ts";
import {
  DIFF_TRACKED_CASES, DIFF_UNTRACKED_CASES, EX, FIND_NEWER_CASES, METHOD_GREP_CASES, METHOD_GREP_DROPPED_CASES,
  REFUSED_BUILD_OUTPUTS, SHELL_WORD_CASES, STATUS_SHORT_CASES, TEST_FILES_NAMING_CASES, TRAIT_GREP_CASES,
  TRAIT_GREP_DROPPED_CASES, TWO_HUNDRED_PATHS, UNTRACKED_CASES,
} from "./commands.fixtures.ts";

describe("shellWord", () => {
  for (const c of SHELL_WORD_CASES) {
    it(`${c.name}`, () => {
      // Arrange
      const [value] = c.args;

      // Act
      const word = shellWord(value);

      // Assert
      strictEqual(word, c.expected);
    });
  }
});

describe("buildOutputProblem and excludePathspecs", () => {
  for (const name of REFUSED_BUILD_OUTPUTS) {
    it(`refuses a path, '.', '..' and the empty name: ${JSON.stringify(name)}`, () => {
      // Arrange
      const expected = `layout.build_outputs takes folder names, not paths: ${name}`;

      // Act
      const problem = buildOutputProblem(name);

      // Assert
      strictEqual(problem, expected);
    });
  }

  it("accepts a folder name", () => {
    // Arrange
    const name = "bin";

    // Act
    const problem = buildOutputProblem(name);

    // Assert
    strictEqual(problem, undefined);
  });

  it("gives one quoted exclude pathspec per folder", () => {
    // Arrange
    const folders = ["bin", "obj"];

    // Act
    const pathspecs = excludePathspecs(folders);

    // Assert
    deepStrictEqual(pathspecs, [...EX]);
  });

  it("gives no exclude pathspec for no folder", () => {
    // Arrange
    const folders: string[] = [];

    // Act
    const pathspecs = excludePathspecs(folders);

    // Assert
    deepStrictEqual(pathspecs, []);
  });
});

describe("the frozen lines", () => {
  it("GIT_CHANGED_TRACKED, GIT_DIFF_CHECK", () => {
    // Arrange
    const expected = ["git diff --name-only HEAD", "git diff --check HEAD"];

    // Act
    const lines = [GIT_CHANGED_TRACKED, GIT_DIFF_CHECK];

    // Assert
    strictEqual(lines[0], expected[0]);
    strictEqual(lines[1], expected[1]);
  });

  for (const c of UNTRACKED_CASES) {
    it(`gitUntracked, ${c.name}`, () => {
      // Arrange
      const [excludes] = c.args;

      // Act
      const line = gitUntracked(excludes);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  for (const c of TRAIT_GREP_CASES) {
    it(`gitTraitGrep, ${c.name}`, () => {
      // Arrange
      const [ere, scope, excludes] = c.args;

      // Act
      const line = gitTraitGrep(ere, scope, excludes);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  for (const c of STATUS_SHORT_CASES) {
    it(`gitStatusShort, ${c.name}`, () => {
      // Arrange
      const [excludes] = c.args;

      // Act
      const line = gitStatusShort(excludes);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  for (const c of DIFF_TRACKED_CASES) {
    it(`gitDiffTracked, per file: ${c.name}`, () => {
      // Arrange
      const [path] = c.args;

      // Act
      const line = gitDiffTracked(path);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  for (const c of DIFF_UNTRACKED_CASES) {
    it(`gitDiffUntracked, per file: ${c.name}`, () => {
      // Arrange
      const [path] = c.args;

      // Act
      const line = gitDiffUntracked(path);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  for (const c of METHOD_GREP_CASES) {
    it(`gitMethodGrep, ${c.name}`, () => {
      // Arrange
      const [methods, testDirs, excludes] = c.args;

      // Act
      const line = gitMethodGrep(methods, testDirs, excludes);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  for (const c of TRAIT_GREP_DROPPED_CASES) {
    it(`gitTraitGrep gives null when a list is left empty once the unquotable entries are dropped: ${c.name}`, () => {
      // Arrange
      const [ere, scope, excludes] = c.args;

      // Act
      const line = gitTraitGrep(ere, scope, excludes);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  for (const c of METHOD_GREP_DROPPED_CASES) {
    it(`gitMethodGrep gives null only when a list is left empty once the unquotable entries are dropped: ${c.name}`, () => {
      // Arrange
      const [methods, testDirs, excludes] = c.args;

      // Act
      const line = gitMethodGrep(methods, testDirs, excludes);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  it("puts -e before a trait pattern that starts with '-'", () => {
    // Arrange
    const ere = "-x";

    // Act
    const line = gitTraitGrep(ere, ["."], []);

    // Assert
    strictEqual(line, "git grep --untracked -I -noE -e '-x' -- .");
  });

  for (const c of TEST_FILES_NAMING_CASES) {
    it(`gitTestFilesNaming, ${c.name}`, () => {
      // Arrange
      const [name, testDirs, extension, excludes] = c.args;

      // Act
      const line = gitTestFilesNaming(name, testDirs, extension, excludes);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  for (const c of FIND_NEWER_CASES) {
    it(`findNewer, ${c.name}`, () => {
      // Arrange
      const [paths, log] = c.args;

      // Act
      const line = findNewer(paths, log);

      // Assert
      strictEqual(line, c.expected);
    });
  }

  it("findNewer takes 200 paths", () => {
    // Arrange
    const paths = TWO_HUNDRED_PATHS;

    // Act
    const line = findNewer(paths, "log");

    // Assert
    strictEqual(line?.startsWith("find ./f ./f "), true);
  });
});
