// Unit tests for the work folder rules. Run:
//   node --test src/shared/domain/dev/work-folder.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  DEFAULT_WORK_FOLDER, DEV_WORK_DIR_CONFIG_KEY, isSamePath, mainWorktreeOf, normalizeWorkDir,
  pickWorkDirRequest, workFolderProblem,
} from "../../../../src/shared/domain/dev/work-folder.ts";
import {
  EMPTY_VALUES, LISTINGS, LOOK_ALIKES, NEITHER_SET, NOT_LISTINGS, PACK_FALLBACKS, PATH_PAIRS, PROBLEMS, REFUSED,
  REFUSED_IN_ORDER, STRIPPED, VALID_VALUES,
} from "./work-folder.fixtures.ts";

describe("normalizeWorkDir", () => {
  for (const c of STRIPPED) {
    it(`strips control whitespace, blanks, leading ./ and trailing /: ${JSON.stringify(c.raw)}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const result = normalizeWorkDir(raw);

      // Assert
      deepStrictEqual(result, { ok: true, folder: c.folder });
    });
  }

  for (const raw of EMPTY_VALUES) {
    it(`gives an empty folder for an empty value: ${JSON.stringify(raw)}`, () => {
      // Arrange
      const value = raw;

      // Act
      const result = normalizeWorkDir(value);

      // Assert
      deepStrictEqual(result, { ok: true, folder: "" }, JSON.stringify(raw));
    });
  }

  for (const c of REFUSED) {
    it(`refuses what is not a relative folder of the checkout, with the reason: ${JSON.stringify(c.raw)}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const result = normalizeWorkDir(raw);

      // Assert
      deepStrictEqual(result, { ok: false, reason: c.reason }, JSON.stringify(raw));
    });
  }

  for (const c of REFUSED_IN_ORDER) {
    it(`checks the refusals in order: ${JSON.stringify(c.raw)}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const result = normalizeWorkDir(raw);

      // Assert
      deepStrictEqual(result, { ok: false, reason: c.reason });
    });
  }

  it("refuses a non-breaking space, as Python's isprintable does", () => {
    // Arrange
    const raw = "a\u00A0b";

    // Act
    const result = normalizeWorkDir(raw);

    // Assert
    deepStrictEqual(result, { ok: false, reason: "a non-printable character" });
  });

  for (const folder of LOOK_ALIKES) {
    it(`accepts a folder only named like the guarded ones: ${folder}`, () => {
      // Arrange
      const raw = folder;

      // Act
      const result = normalizeWorkDir(raw);

      // Assert
      deepStrictEqual(result, { ok: true, folder });
    });
  }
});

describe("workFolderProblem", () => {
  for (const raw of VALID_VALUES) {
    it(`is undefined for a valid or empty value: ${JSON.stringify(raw)}`, () => {
      // Arrange
      const value = raw;

      // Act
      const problem = workFolderProblem(value);

      // Assert
      strictEqual(problem, undefined);
    });
  }

  for (const c of PROBLEMS) {
    it(`names the value and the reason: ${c.raw}`, () => {
      // Arrange
      const { raw } = c;

      // Act
      const problem = workFolderProblem(raw);

      // Assert
      strictEqual(problem, c.problem);
    });
  }
});

describe("pickWorkDirRequest", () => {
  it("prefers the config key", () => {
    // Arrange
    const config = "todo";

    // Act
    const request = pickWorkDirRequest(config, "backstage/tasks");

    // Assert
    deepStrictEqual(request, { value: "todo", source: "dev.workDir" });
  });

  for (const c of PACK_FALLBACKS) {
    it(`falls to the pack when the config is unset or blank: ${c.name}`, () => {
      // Arrange
      const { config, pack } = c;

      // Act
      const request = pickWorkDirRequest(config, pack);

      // Assert
      deepStrictEqual(request, { value: "backstage/tasks", source: "layout.work" });
    });
  }

  it("keeps an invalid value set: the first set source decides", () => {
    // Arrange
    const config = "/abs";

    // Act
    const request = pickWorkDirRequest(config, "backstage/tasks");

    // Assert
    deepStrictEqual(request, { value: "/abs", source: "dev.workDir" });
  });

  for (const c of NEITHER_SET) {
    it(`is null when neither is set: ${c.name}`, () => {
      // Arrange
      const { config, pack } = c;

      // Act
      const request = pickWorkDirRequest(config, pack);

      // Assert
      strictEqual(request, null);
    });
  }
});

describe("mainWorktreeOf", () => {
  for (const c of LISTINGS) {
    it(`reads the first worktree of the porcelain listing: ${c.name}`, () => {
      // Arrange
      const { listing } = c;

      // Act
      const main = mainWorktreeOf(listing);

      // Assert
      strictEqual(main, c.main);
    });
  }

  for (const c of NOT_LISTINGS) {
    it(`is null on anything else: ${c.name}`, () => {
      // Arrange
      const { listing } = c;

      // Act
      const main = mainWorktreeOf(listing);

      // Assert
      strictEqual(main, null);
    });
  }
});

describe("isSamePath", () => {
  for (const c of PATH_PAIRS) {
    it(`ignores trailing slashes only: ${c.a} and ${c.b}`, () => {
      // Arrange
      const { a, b } = c;

      // Act
      const same = isSamePath(a, b);

      // Assert
      strictEqual(same, c.same);
    });
  }
});

describe("constants", () => {
  it("names the default folder and the config key", () => {
    // Arrange
    const expected = { folder: "workbench", key: "dev.workDir" };

    // Act
    const [folder, key] = [DEFAULT_WORK_FOLDER, DEV_WORK_DIR_CONFIG_KEY];

    // Assert
    strictEqual(folder, expected.folder);
    strictEqual(key, expected.key);
  });
});
