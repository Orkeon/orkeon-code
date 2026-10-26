// The project's files read with git for a brief. Run:
//   node --test src/shared/application/dev/project-files.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { PROJECT_FILES_COMMAND, listProjectFiles } from "../../../../src/shared/application/dev/project-files.ts";
import { LISTED, listingShell, refusingShell } from "./project-files.fixtures.ts";

describe("listProjectFiles", () => {
  it("lists the tracked and untracked files git names, the work folder left out", async () => {
    // Arrange
    const shell = listingShell(LISTED);

    // Act
    const files = await listProjectFiles(shell, "workbench");

    // Assert
    deepStrictEqual(files, ["src/math.js", "src/stats.js"]);
  });

  it("asks git for the tracked and the untracked files it does not ignore", async () => {
    // Arrange
    const shell = listingShell(LISTED);

    // Act
    await listProjectFiles(shell, "workbench");

    // Assert
    deepStrictEqual(shell.commands, [PROJECT_FILES_COMMAND]);
  });

  it("lists nothing when git fails", async () => {
    // Arrange
    const shell = listingShell("fatal: not a git repository", 128);

    // Act
    const files = await listProjectFiles(shell, "workbench");

    // Assert
    deepStrictEqual(files, []);
  });

  it("lists nothing when the shell refuses the call", async () => {
    // Arrange
    const shell = refusingShell();

    // Act
    const files = await listProjectFiles(shell, "workbench");

    // Assert
    deepStrictEqual(files, []);
  });
});
