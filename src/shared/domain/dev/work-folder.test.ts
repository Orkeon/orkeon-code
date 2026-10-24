// Unit tests for the work folder rules. Run:
//   node --test src/shared/domain/dev/work-folder.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import {
  DEFAULT_WORK_FOLDER, DEV_WORK_DIR_CONFIG_KEY, isSamePath, mainWorktreeOf, normalizeWorkDir,
  pickWorkDirRequest, workFolderProblem,
} from "./work-folder.ts";

describe("normalizeWorkDir", () => {
  it("strips control whitespace, blanks, leading ./ and trailing /", () => {
    deepStrictEqual(normalizeWorkDir(" ./backstage/tasks/ \t"), { ok: true, folder: "backstage/tasks" });
    deepStrictEqual(normalizeWorkDir("./././notes//"), { ok: true, folder: "notes" });
    deepStrictEqual(normalizeWorkDir("back\nstage"), { ok: true, folder: "backstage" });
  });

  it("gives an empty folder for an empty value", () => {
    for (const raw of ["", "   ", "./", "\t\r\n", "./ "]) {
      deepStrictEqual(normalizeWorkDir(raw), { ok: true, folder: "" }, JSON.stringify(raw));
    }
  });

  it("refuses what is not a relative folder of the checkout, with the reason", () => {
    const cases: Array<[string, string]> = [
      ["/abs", "an absolute path"],
      ["/", "an absolute path"],
      ["a//b", "an empty segment"],
      ["..", "a '..' or '.' segment"],
      ["a/../b", "a '..' or '.' segment"],
      ["../x", "a '..' or '.' segment"],
      [".", "a '..' or '.' segment"],
      ["./.", "a '..' or '.' segment"],
      ["a/./b", "a '..' or '.' segment"],
      [".claude", "under .claude/ or .git/"],
      [".claude/x", "under .claude/ or .git/"],
      [".git", "under .claude/ or .git/"],
      ["a\u0007b", "a non-printable character"],
      ["a​b", "a non-printable character"],
    ];
    for (const [raw, reason] of cases) {
      deepStrictEqual(normalizeWorkDir(raw), { ok: false, reason }, JSON.stringify(raw));
    }
  });

  it("checks the refusals in order", () => {
    deepStrictEqual(normalizeWorkDir("/a//b"), { ok: false, reason: "an absolute path" });
    deepStrictEqual(normalizeWorkDir("a//.."), { ok: false, reason: "an empty segment" });
    deepStrictEqual(normalizeWorkDir(".git/.."), { ok: false, reason: "a '..' or '.' segment" });
  });

  it("refuses a non-breaking space, as Python's isprintable does", () => {
    deepStrictEqual(normalizeWorkDir("a\u00A0b"), { ok: false, reason: "a non-printable character" });
  });

  it("accepts a folder only named like the guarded ones", () => {
    deepStrictEqual(normalizeWorkDir("docs/.claude"), { ok: true, folder: "docs/.claude" });
    deepStrictEqual(normalizeWorkDir(".claudette"), { ok: true, folder: ".claudette" });
  });
});

describe("workFolderProblem", () => {
  it("is undefined for a valid or empty value", () => {
    strictEqual(workFolderProblem("backstage/tasks"), undefined);
    strictEqual(workFolderProblem(""), undefined);
  });
  it("names the value and the reason", () => {
    strictEqual(workFolderProblem("/srv/work"), "'/srv/work' is not a relative folder of the checkout: an absolute path");
    strictEqual(workFolderProblem(".git/x"), "'.git/x' is not a relative folder of the checkout: under .claude/ or .git/");
  });
});

describe("pickWorkDirRequest", () => {
  it("prefers the config key", () => {
    deepStrictEqual(pickWorkDirRequest("todo", "backstage/tasks"), { value: "todo", source: "dev.workDir" });
  });
  it("falls to the pack when the config is unset or blank", () => {
    deepStrictEqual(pickWorkDirRequest(undefined, "backstage/tasks"), { value: "backstage/tasks", source: "layout.work" });
    deepStrictEqual(pickWorkDirRequest("  ", "backstage/tasks"), { value: "backstage/tasks", source: "layout.work" });
  });
  it("keeps an invalid value set: the first set source decides", () => {
    deepStrictEqual(pickWorkDirRequest("/abs", "backstage/tasks"), { value: "/abs", source: "dev.workDir" });
  });
  it("is null when neither is set", () => {
    strictEqual(pickWorkDirRequest(undefined, undefined), null);
    strictEqual(pickWorkDirRequest("", " \t"), null);
  });
});

describe("mainWorktreeOf", () => {
  it("reads the first worktree of the porcelain listing", () => {
    const porcelain = "worktree /workspace\nHEAD 0123abc\nbranch refs/heads/main\n\n"
      + "worktree /workspace/.claude/worktrees/p2\nHEAD 4567def\nbranch refs/heads/p2\n";
    strictEqual(mainWorktreeOf(porcelain), "/workspace");
    strictEqual(mainWorktreeOf("worktree /home/me/repo\r\nHEAD x\r\n"), "/home/me/repo");
  });
  it("is null on anything else", () => {
    strictEqual(mainWorktreeOf(""), null);
    strictEqual(mainWorktreeOf("worktree \n"), null);
    strictEqual(mainWorktreeOf("fatal: not a git repository\n"), null);
  });
});

describe("isSamePath", () => {
  it("ignores trailing slashes only", () => {
    strictEqual(isSamePath("/workspace", "/workspace/"), true);
    strictEqual(isSamePath("/workspace//", "/workspace"), true);
    strictEqual(isSamePath("/workspace", "/workspace2"), false);
  });
});

describe("constants", () => {
  it("names the default folder and the config key", () => {
    strictEqual(DEFAULT_WORK_FOLDER, "workbench");
    strictEqual(DEV_WORK_DIR_CONFIG_KEY, "dev.workDir");
  });
});
