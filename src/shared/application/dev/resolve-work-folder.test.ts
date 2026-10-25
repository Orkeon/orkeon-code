// Unit tests for the work folder resolution, over FakeFiles and FakeShell. Run:
//   node --test src/shared/application/dev/resolve-work-folder.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import type { Files } from "../ports.ts";
import {
  GIT_TOPLEVEL, GIT_WORKTREE_LIST, entryExists, gitDirProbe, resolveWorkFolder, workFolderLabel,
} from "./resolve-work-folder.ts";
import {
  config, DEFAULT_WORK, ENTRIES, LABELS, linked, LINKED_PORCELAIN, pack, setup, todoAndBackstage, UNQUOTABLE_MAINS,
} from "./resolve-work-folder.fixtures.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

describe("resolveWorkFolder", () => {
  it("applies the default when nothing is asked, without running git", async () => {
    // Arrange
    const deps = setup(["src", "workbench"]);

    // Act
    const work = await resolveWorkFolder(deps, null);

    // Assert
    deepStrictEqual(work, DEFAULT_WORK);
    deepStrictEqual(deps.shell.commands, []);
  });

  it("applies the default for a value that normalises to empty", async () => {
    // Arrange
    const deps = setup([]);

    // Act
    const work = await resolveWorkFolder(deps, config(" ./ "));

    // Assert
    strictEqual(work.outcome, "default");
    strictEqual(work.folder, "workbench");
    strictEqual(work.exists, false);
    strictEqual(work.note, null);
    deepStrictEqual(deps.shell.commands, []);
  });

  it("refuses an invalid value and applies the default, with a note", async () => {
    // Arrange
    const deps = setup(["workbench"]);

    // Act
    const work = await resolveWorkFolder(deps, config("../elsewhere"));

    // Assert
    strictEqual(work.outcome, "invalid");
    strictEqual(work.folder, "workbench");
    strictEqual(work.vfsPath, `${WORKSPACE}/workbench`);
    strictEqual(work.exists, true);
    strictEqual(work.note,
      "dev.workDir '../elsewhere' is not a relative folder of the checkout (a '..' or '.' segment): workbench/ applies");
    deepStrictEqual(deps.shell.commands, []);
  });

  it("applies workbench when it is named, without running git", async () => {
    // Arrange
    const deps = setup([]);

    // Act
    const work = await resolveWorkFolder(deps, pack("./workbench/"));

    // Assert
    strictEqual(work.outcome, "applied");
    strictEqual(work.folder, "workbench");
    strictEqual(work.exists, false);
    deepStrictEqual(deps.shell.commands, []);
  });

  it("applies a named folder that exists", async () => {
    // Arrange
    const deps = setup(["backstage"]);
    deps.files.listings.set(`${WORKSPACE}/backstage`, ["tasks", "notes"]);

    // Act
    const work = await resolveWorkFolder(deps, pack("backstage/tasks/"));

    // Assert
    deepStrictEqual(work, {
      folder: "backstage/tasks", vfsPath: `${WORKSPACE}/backstage/tasks`, outcome: "applied",
      request: pack("backstage/tasks/"), exists: true, note: null,
    });
    deepStrictEqual(deps.shell.commands, []);
  });

  it("falls back when the folder is absent and the checkout is the main worktree", async () => {
    // Arrange
    const deps = setup(["workbench"]);
    deps.shell.results[GIT_WORKTREE_LIST] = { stdout: `worktree ${WORKSPACE}\nHEAD 0123abc\nbranch refs/heads/main\n` };
    deps.shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}/\n` };

    // Act
    const work = await resolveWorkFolder(deps, pack("backstage/tasks"));

    // Assert
    deepStrictEqual(work, {
      folder: "workbench", vfsPath: `${WORKSPACE}/workbench`, outcome: "absent", request: pack("backstage/tasks"),
      exists: true, note: "layout.work 'backstage/tasks' is absent from the checkout: workbench/ applies",
    });
    deepStrictEqual(deps.shell.commands, [GIT_WORKTREE_LIST, GIT_TOPLEVEL]);
  });

  it("resolves the main worktree's folder in a linked worktree", async () => {
    // Arrange
    const deps = setup([]);
    linked(deps.shell);

    // Act
    const work = await resolveWorkFolder(deps, pack("backstage/tasks"));

    // Assert
    deepStrictEqual(work, {
      folder: "/home/dev/repo/backstage/tasks", vfsPath: null, outcome: "main-worktree", request: pack("backstage/tasks"),
      exists: true,
      note: "this checkout is a linked worktree: the work folder is the main worktree's /home/dev/repo/backstage/tasks",
    });
    deepStrictEqual(deps.shell.commands,
      [GIT_WORKTREE_LIST, GIT_TOPLEVEL, "git -C /home/dev/repo/backstage/tasks rev-parse --git-dir"]);
  });

  it("falls back in a linked worktree whose main worktree lacks the folder", async () => {
    // Arrange
    const deps = setup([]);
    linked(deps.shell);
    deps.shell.results[gitDirProbe("/home/dev/repo/backstage/tasks")] = { exitCode: 128, stderr: "fatal: cannot change" };

    // Act
    const work = await resolveWorkFolder(deps, config("backstage/tasks"));

    // Assert
    strictEqual(work.outcome, "absent");
    strictEqual(work.folder, "workbench");
    strictEqual(work.note, "dev.workDir 'backstage/tasks' is absent from the checkout: workbench/ applies");
  });

  it("falls back when the probe is refused", async () => {
    // Arrange
    const deps = setup([]);
    linked(deps.shell);
    deps.shell.errors[gitDirProbe("/home/dev/repo/backstage/tasks")] = new Error("command refused");

    // Act
    const work = await resolveWorkFolder(deps, pack("backstage/tasks"));

    // Assert
    strictEqual(work.outcome, "absent");
  });

  for (const main of UNQUOTABLE_MAINS) {
    it(`falls back without a probe when the main worktree's path is ${main}`, async () => {
      // Arrange
      const deps = setup([]);
      deps.shell.results[GIT_WORKTREE_LIST] = { stdout: `worktree ${main}\nHEAD 0123abc\n` };
      deps.shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };

      // Act
      const work = await resolveWorkFolder(deps, pack("backstage/tasks"));

      // Assert
      strictEqual(work.outcome, "absent", main);
      deepStrictEqual(deps.shell.commands, [GIT_WORKTREE_LIST, GIT_TOPLEVEL]);
    });
  }

  it("counts a git call that throws as not linked", async () => {
    // Arrange
    const thrown = setup([]);
    thrown.shell.errors[GIT_WORKTREE_LIST] = new Error("command refused");
    thrown.shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };

    // Act
    const work = await resolveWorkFolder(thrown, pack("backstage/tasks"));

    // Assert
    strictEqual(work.outcome, "absent");
  });

  it("counts a git call that fails as not linked", async () => {
    // Arrange
    const failed = setup([]);
    failed.shell.results[GIT_WORKTREE_LIST] = { stdout: LINKED_PORCELAIN };
    failed.shell.results[GIT_TOPLEVEL] = { exitCode: 128, stdout: "" };

    // Act
    const work = await resolveWorkFolder(failed, pack("backstage/tasks"));

    // Assert
    strictEqual(work.outcome, "absent");
    strictEqual(failed.shell.commands.length, 2);
  });
});

describe("entryExists", () => {
  for (const c of ENTRIES) {
    it(`looks for the last segment of ${c.path} in the parent's listing`, async () => {
      // Arrange
      const files = new FakeFiles();
      files.listings.set(WORKSPACE, ["src", "workbench"]);

      // Act
      const exists = await entryExists(files, c.path);

      // Assert
      strictEqual(exists, c.exists);
    });
  }

  it("is false when the listing throws", async () => {
    // Arrange
    const files: Pick<Files, "list"> = { list: async () => { throw new Error("permission denied"); } };

    // Act
    const exists = await entryExists(files, `${WORKSPACE}/workbench`);

    // Assert
    strictEqual(exists, false);
  });

  it("asks for at most 1000 entries", async () => {
    // Arrange
    let asked = 0;
    const files: Pick<Files, "list"> = { list: async (_path, max) => { asked = max; return []; } };

    // Act
    await entryExists(files, `${WORKSPACE}/workbench`);

    // Assert
    strictEqual(asked, 1000);
  });
});

describe("workFolderLabel", () => {
  for (const c of LABELS) {
    it(`says the folder comes from ${c.name}`, async () => {
      // Arrange
      const work = await resolveWorkFolder(todoAndBackstage(), c.request);

      // Act
      const label = workFolderLabel(work, c.packShown);

      // Assert
      strictEqual(label, c.label);
    });
  }

  it("shows the default when the request did not apply", async () => {
    // Arrange
    const work = await resolveWorkFolder(setup([]), config("/abs"));

    // Act
    const label = workFolderLabel(work, null);

    // Assert
    strictEqual(label, "workbench/ (default)");
  });
});
