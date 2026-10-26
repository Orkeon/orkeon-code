// The steps /dev-spec and /dev-change share around their draft: the inputs' code and text, the checkout check, the
// code's folder, the request read from a file, and the self-check of the written source. Over FakeFiles and
// FakeShell. Run:
//   node --test tests/shared/application/dev/source-step.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_REQUEST_CHARS, codeFolder, inputCode, inputText, readRequest, sourceSelfCheck, toplevelRefusal } from "../../../../src/shared/application/dev/source-step.ts";
import {
  CODE_CASES, LONG_BRIEF, REQUEST_CASES, SELF_CHECK_CASES, SPEC_PRUNE, STEP, TEXT_CASES, TOPLEVEL_CASES, WORK, WORK_OUTSIDE,
  checkoutFile, pruneFolder,
} from "./source-step.fixtures.ts";
import { assertNames, assertTextLength, folderOf } from "./source-step.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("inputCode", () => {
  for (const c of CODE_CASES) {
    it(c.name, () => {
      // Arrange
      const value = c.value;

      // Act
      const code = inputCode(STEP, value);

      // Assert
      deepStrictEqual(code, c.expected);
    });
  }
});

describe("inputText", () => {
  for (const c of TEXT_CASES) {
    it(c.name, () => {
      // Arrange
      const value = c.value;

      // Act
      const text = inputText(STEP, "request", value);

      // Assert
      deepStrictEqual(text, c.expected);
    });
  }
});

describe("toplevelRefusal", () => {
  for (const c of TOPLEVEL_CASES) {
    it(c.name, async () => {
      // Arrange
      const shell = c.shell();

      // Act
      const refusal = await toplevelRefusal(STEP, shell);

      // Assert
      strictEqual(refusal, c.expected);
    });
  }
});

describe("codeFolder", () => {
  it("refuses a work folder outside the checkout's mounts", async () => {
    // Arrange
    const files = pruneFolder([]);

    // Act
    const folder = await codeFolder(STEP, files, WORK_OUTSIDE, "prune");

    // Assert
    deepStrictEqual(folder, {
      refused: "dev-spec: the work folder /home/dev/repo/workbench is outside the checkout's mounts: run from the main worktree",
    });
  });

  it("reads a folder that does not exist yet as holding no name", async () => {
    // Arrange
    const files = pruneFolder([]);

    // Act
    const folder = await codeFolder(STEP, files, WORK, "absent");

    // Assert
    assertNames(folder, []);
  });

  it("lists the folder's names without their trailing slash", async () => {
    // Arrange
    const files = pruneFolder(["SPEC-prune.md", "notes/"]);

    // Act
    const folder = await codeFolder(STEP, files, WORK, "prune");

    // Assert
    assertNames(folder, ["SPEC-prune.md", "notes"]);
  });

  it("names a file of the folder both as the tools read it and as the user does", async () => {
    // Arrange
    const files = pruneFolder([]);
    const folder = folderOf(await codeFolder(STEP, files, WORK, "prune"));

    // Act
    const file = folder.file("SPEC-prune.md");

    // Assert
    deepStrictEqual(file, { vfs: `${WORKSPACE}/workbench/prune/SPEC-prune.md`, shown: "workbench/prune/SPEC-prune.md" });
  });
});

describe("readRequest", () => {
  for (const c of REQUEST_CASES) {
    it(c.name, async () => {
      // Arrange
      const files = c.files();

      // Act
      const read = await readRequest(STEP, files, c.request);

      // Assert
      deepStrictEqual(read, c.expected);
    });
  }

  it("cuts a request file at MAX_REQUEST_CHARS", async () => {
    // Arrange
    const files = checkoutFile("docs/brief.md", LONG_BRIEF);

    // Act
    const read = await readRequest(STEP, files, "docs/brief.md");

    // Assert
    assertTextLength(read, MAX_REQUEST_CHARS);
  });
});

describe("sourceSelfCheck", () => {
  for (const c of SELF_CHECK_CASES) {
    it(c.name, () => {
      // Arrange
      const text = SPEC_PRUNE;

      // Act
      const problems = sourceSelfCheck(text, "spec", c.expect);

      // Assert
      deepStrictEqual(problems, c.problems);
    });
  }
});
