// Unit tests for the work folder resolution, over FakeFiles and FakeShell. Run:
//   node --test src/shared/application/dev/resolve-work-folder.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { Files } from "../ports.ts";
import type { WorkDirRequest } from "../../domain/dev/work-folder.ts";
import {
  GIT_TOPLEVEL, GIT_WORKTREE_LIST, WORKSPACE_ROOT, entryExists, gitDirProbe, resolveWorkFolder, workFolderLabel,
} from "./resolve-work-folder.ts";

const pack = (value: string): WorkDirRequest => ({ value, source: "layout.work" });
const config = (value: string): WorkDirRequest => ({ value, source: "dev.workDir" });

const LINKED_PORCELAIN = "worktree /home/dev/repo\nHEAD 0123abc\nbranch refs/heads/main\n\n"
  + "worktree /workspace\nHEAD 4567def\nbranch refs/heads/feature\n";

function setup(listing: string[] = []) {
  const files = new FakeFiles();
  files.listings.set(WORKSPACE_ROOT, listing);
  const shell = new FakeShell();
  return { files, shell };
}

function linked(shell: FakeShell) {
  shell.results[GIT_WORKTREE_LIST] = { stdout: LINKED_PORCELAIN };
  shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
}

describe("resolveWorkFolder", () => {
  it("applies the default when nothing is asked, without running git", async () => {
    const deps = setup(["src", "workbench"]);
    deepStrictEqual(await resolveWorkFolder(deps, null), {
      folder: "workbench", vfsPath: "/workspace/workbench", outcome: "default", request: null, exists: true, note: null,
    });
    deepStrictEqual(deps.shell.commands, []);
  });

  it("applies the default for a value that normalises to empty", async () => {
    const deps = setup([]);
    const work = await resolveWorkFolder(deps, config(" ./ "));
    strictEqual(work.outcome, "default");
    strictEqual(work.folder, "workbench");
    strictEqual(work.exists, false);
    strictEqual(work.note, null);
    deepStrictEqual(deps.shell.commands, []);
  });

  it("refuses an invalid value and applies the default, with a note", async () => {
    const deps = setup(["workbench"]);
    const work = await resolveWorkFolder(deps, config("../elsewhere"));
    strictEqual(work.outcome, "invalid");
    strictEqual(work.folder, "workbench");
    strictEqual(work.vfsPath, "/workspace/workbench");
    strictEqual(work.exists, true);
    strictEqual(work.note,
      "dev.workDir '../elsewhere' is not a relative folder of the checkout (a '..' or '.' segment): workbench/ applies");
    deepStrictEqual(deps.shell.commands, []);
  });

  it("applies workbench when it is named, without running git", async () => {
    const deps = setup([]);
    const work = await resolveWorkFolder(deps, pack("./workbench/"));
    strictEqual(work.outcome, "applied");
    strictEqual(work.folder, "workbench");
    strictEqual(work.exists, false);
    deepStrictEqual(deps.shell.commands, []);
  });

  it("applies a named folder that exists", async () => {
    const deps = setup(["backstage"]);
    deps.files.listings.set("/workspace/backstage", ["tasks", "notes"]);
    deepStrictEqual(await resolveWorkFolder(deps, pack("backstage/tasks/")), {
      folder: "backstage/tasks", vfsPath: "/workspace/backstage/tasks", outcome: "applied",
      request: pack("backstage/tasks/"), exists: true, note: null,
    });
    deepStrictEqual(deps.shell.commands, []);
  });

  it("falls back when the folder is absent and the checkout is the main worktree", async () => {
    const deps = setup(["workbench"]);
    deps.shell.results[GIT_WORKTREE_LIST] = { stdout: "worktree /workspace\nHEAD 0123abc\nbranch refs/heads/main\n" };
    deps.shell.results[GIT_TOPLEVEL] = { stdout: "/workspace/\n" };
    const work = await resolveWorkFolder(deps, pack("backstage/tasks"));
    deepStrictEqual(work, {
      folder: "workbench", vfsPath: "/workspace/workbench", outcome: "absent", request: pack("backstage/tasks"),
      exists: true, note: "layout.work 'backstage/tasks' is absent from the checkout: workbench/ applies",
    });
    deepStrictEqual(deps.shell.commands, [GIT_WORKTREE_LIST, GIT_TOPLEVEL]);
  });

  it("resolves the main worktree's folder in a linked worktree", async () => {
    const deps = setup([]);
    linked(deps.shell);
    const work = await resolveWorkFolder(deps, pack("backstage/tasks"));
    deepStrictEqual(work, {
      folder: "/home/dev/repo/backstage/tasks", vfsPath: null, outcome: "main-worktree", request: pack("backstage/tasks"),
      exists: true,
      note: "this checkout is a linked worktree: the work folder is the main worktree's /home/dev/repo/backstage/tasks",
    });
    deepStrictEqual(deps.shell.commands,
      [GIT_WORKTREE_LIST, GIT_TOPLEVEL, "git -C /home/dev/repo/backstage/tasks rev-parse --git-dir"]);
  });

  it("falls back in a linked worktree whose main worktree lacks the folder", async () => {
    const deps = setup([]);
    linked(deps.shell);
    deps.shell.results[gitDirProbe("/home/dev/repo/backstage/tasks")] = { exitCode: 128, stderr: "fatal: cannot change" };
    const work = await resolveWorkFolder(deps, config("backstage/tasks"));
    strictEqual(work.outcome, "absent");
    strictEqual(work.folder, "workbench");
    strictEqual(work.note, "dev.workDir 'backstage/tasks' is absent from the checkout: workbench/ applies");
  });

  it("falls back when the probe is refused", async () => {
    const deps = setup([]);
    linked(deps.shell);
    deps.shell.errors[gitDirProbe("/home/dev/repo/backstage/tasks")] = new Error("command refused");
    strictEqual((await resolveWorkFolder(deps, pack("backstage/tasks"))).outcome, "absent");
  });

  it("falls back without a probe when the main worktree's path holds whitespace or a quote", async () => {
    for (const main of ["/home/dev/my repo", "/home/dev/o'repo"]) {
      const deps = setup([]);
      deps.shell.results[GIT_WORKTREE_LIST] = { stdout: `worktree ${main}\nHEAD 0123abc\n` };
      deps.shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
      const work = await resolveWorkFolder(deps, pack("backstage/tasks"));
      strictEqual(work.outcome, "absent", main);
      deepStrictEqual(deps.shell.commands, [GIT_WORKTREE_LIST, GIT_TOPLEVEL]);
    }
  });

  it("counts a git call that throws or fails as not linked", async () => {
    const thrown = setup([]);
    thrown.shell.errors[GIT_WORKTREE_LIST] = new Error("command refused");
    thrown.shell.results[GIT_TOPLEVEL] = { stdout: "/workspace\n" };
    strictEqual((await resolveWorkFolder(thrown, pack("backstage/tasks"))).outcome, "absent");

    const failed = setup([]);
    failed.shell.results[GIT_WORKTREE_LIST] = { stdout: LINKED_PORCELAIN };
    failed.shell.results[GIT_TOPLEVEL] = { exitCode: 128, stdout: "" };
    strictEqual((await resolveWorkFolder(failed, pack("backstage/tasks"))).outcome, "absent");
    strictEqual(failed.shell.commands.length, 2);
  });
});

describe("entryExists", () => {
  it("looks for the last segment in the parent's listing", async () => {
    const files = new FakeFiles();
    files.listings.set("/workspace", ["src", "workbench"]);
    strictEqual(await entryExists(files, "/workspace/workbench"), true);
    strictEqual(await entryExists(files, "/workspace/workbench/"), true);
    strictEqual(await entryExists(files, "/workspace/todo"), false);
    strictEqual(await entryExists(files, "/workspace/workbench/demo"), false);
  });

  it("is false when the listing throws", async () => {
    const files: Pick<Files, "list"> = { list: async () => { throw new Error("permission denied"); } };
    strictEqual(await entryExists(files, "/workspace/workbench"), false);
  });

  it("asks for at most 1000 entries", async () => {
    let asked = 0;
    const files: Pick<Files, "list"> = { list: async (_path, max) => { asked = max; return []; } };
    await entryExists(files, "/workspace/workbench");
    strictEqual(asked, 1000);
  });
});

describe("workFolderLabel", () => {
  it("says where the folder comes from", async () => {
    const deps = setup(["todo", "backstage"]);
    deps.files.listings.set("/workspace/backstage", ["tasks"]);
    strictEqual(workFolderLabel(await resolveWorkFolder(deps, null), null), "workbench/ (default)");
    strictEqual(workFolderLabel(await resolveWorkFolder(deps, pack("backstage/tasks")), ".orkeon/repo.yaml"),
      "backstage/tasks/ (layout.work, .orkeon/repo.yaml)");
    strictEqual(workFolderLabel(await resolveWorkFolder(deps, config("todo")), ".orkeon/repo.yaml"), "todo/ (dev.workDir)");
  });

  it("shows the default when the request did not apply", async () => {
    const deps = setup([]);
    strictEqual(workFolderLabel(await resolveWorkFolder(deps, config("/abs")), null), "workbench/ (default)");
  });
});
