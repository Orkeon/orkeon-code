// Unit tests for the git close rules. Run:
//   node --test src/shared/domain/git/close.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  COMMIT_MESSAGE_FILE, GIT_STATUS_COMMAND, IDENTITY_HANDOVER, changedPaths, indexDeletedPaths, ghPrCreateCommand, gitAddCommand, gitCommitCommand,
  gitDiffCommand, gitMergeFfOnly, isNotFastForward, isPushed, gitPushCommand, gitPushedCheckCommand, gitRebaseAbortIn, gitRebaseIn, identityStop, parseDefaultBranch,
  parseGitIdent, prBodyPath, prSlug, renderPrBody, selectCommitFiles, shellQuote, shellUnsafe,
} from "./close.ts";

describe("parseGitIdent", () => {
  it("reads the name and the email of `git var GIT_AUTHOR_IDENT`", () => {
    deepStrictEqual(parseGitIdent("Ada Lovelace <ada@example.com> 1700000000 +0100\n"), {
      name: "Ada Lovelace", email: "ada@example.com",
    });
  });

  it("is null on an empty answer, a line without an email, and git's placeholder domain", () => {
    strictEqual(parseGitIdent(""), null);
    strictEqual(parseGitIdent("Ada 1700000000 +0100"), null);
    strictEqual(parseGitIdent("Ada <> 1700000000 +0100"), null);
    strictEqual(parseGitIdent("ada <ada@box.(none)> 1700000000 +0100"), null);
  });
});

describe("identityStop", () => {
  it("names git's reason and hands over the two commands, one per line, without inventing an identity", () => {
    const text = identityStop("fatal: unable to auto-detect email address", "/commit");
    const lines = text.split("\n");
    ok(lines[0].includes("fatal: unable to auto-detect email address"));
    ok(lines[0].includes("/commit"));
    deepStrictEqual(lines.slice(1), IDENTITY_HANDOVER.map((c) => `  ${c}`));
    deepStrictEqual(IDENTITY_HANDOVER, [
      "git config --global user.name \"<your name>\"",
      "git config --global user.email <your email>",
    ]);
  });
});

describe("changedPaths", () => {
  it("lists every path once, both sides of a rename, quotes removed", () => {
    deepStrictEqual(
      changedPaths(" M a.ts\nR  old.ts -> new.ts\n?? \"with space.md\"\n D gone.ts\nMM a.ts\n"),
      ["a.ts", "old.ts", "new.ts", "with space.md", "gone.ts"],
    );
  });

  it("skips a file added then deleted from the worktree (`AD`): nothing of it is left to commit", () => {
    deepStrictEqual(changedPaths("AD ghost.ts\n M a.ts\n"), ["a.ts"]);
  });
});

describe("isNotFastForward", () => {
  it("tells git's not-a-fast-forward refusal from another failure", () => {
    strictEqual(isNotFastForward("fatal: Not possible to fast-forward, aborting."), true);
    strictEqual(isNotFastForward("error: Your local changes would be overwritten by merge."), false);
  });
});

describe("indexDeletedPaths", () => {
  it("names a staged deletion and the old side of a staged rename, not a deletion left unstaged", () => {
    deepStrictEqual(indexDeletedPaths("D  gone.ts\nR  old.ts -> new.ts\n D kept.ts\nRM a.ts -> b.ts\n"), ["gone.ts", "old.ts", "a.ts"]);
  });
});

describe("selectCommitFiles", () => {
  const STATUS = " M src/a.ts\n?? workbench/code/PLAN.md\n?? src/new.ts\n M docs/x.md\n";

  it("takes every changed path but the work folder's when no path is named", () => {
    deepStrictEqual(selectCommitFiles({ status: STATUS, workFolder: "workbench" }), {
      files: ["src/a.ts", "src/new.ts", "docs/x.md"], leftOut: ["workbench/code/PLAN.md"],
      inWorkFolder: [], unchanged: [], unsafe: [],
    });
  });

  it("takes a named file, and the changed files under a named folder", () => {
    deepStrictEqual(selectCommitFiles({ status: STATUS, workFolder: "workbench", named: ["./src/", "docs/x.md"] }).files, [
      "src/a.ts", "src/new.ts", "docs/x.md",
    ]);
  });

  it("refuses a named path of the work folder and a named path with no change", () => {
    const s = selectCommitFiles({ status: STATUS, workFolder: "backstage/tasks", named: ["backstage/tasks/a.md", "README.md"] });
    deepStrictEqual([s.files, s.inWorkFolder, s.unchanged], [[], ["backstage/tasks/a.md"], ["README.md"]]);
  });

  it("leaves the work folder out of a named parent folder, and excludes nothing for a folder outside the checkout", () => {
    deepStrictEqual(selectCommitFiles({ status: STATUS, workFolder: "workbench", named: ["."] }).leftOut, ["workbench/code/PLAN.md"]);
    deepStrictEqual(selectCommitFiles({ status: STATUS, workFolder: "/home/main/workbench" }).leftOut, []);
  });

  it("lets a path named inside the work folder through only when asked (/commit), never in the default list", () => {
    const s = selectCommitFiles({ status: STATUS, workFolder: "workbench", named: ["workbench/code"], namedWorkFolder: true });
    deepStrictEqual([s.files, s.inWorkFolder, s.leftOut], [["workbench/code/PLAN.md"], [], []]);
    deepStrictEqual(selectCommitFiles({ status: STATUS, workFolder: "workbench", namedWorkFolder: true }).leftOut, ["workbench/code/PLAN.md"]);
  });

  it("names the paths the runtime's shell cannot carry", () => {
    deepStrictEqual(selectCommitFiles({ status: "?? \"a\\\"b.ts\"\n?? ok.ts\n?? x;y.ts\n", workFolder: "" }).unsafe, [
      "a\\\"b.ts", "x;y.ts",
    ]);
  });
});

describe("shellUnsafe and shellQuote", () => {
  it("refuses quotes, backslashes, newlines and the runtime's forbidden operators", () => {
    for (const s of ["a'b", "a\"b", "a\\b", "a\nb", "a;b", "a|b", "a&&b", "a$(b)", "a`b`", ""]) strictEqual(shellUnsafe(s), true, s);
    for (const s of ["src/a b.ts", "feat/x-1", "a&b", "a$b"]) strictEqual(shellUnsafe(s), false, s);
  });

  it("single-quotes an argument for a POSIX shell", () => {
    strictEqual(shellQuote("a b"), "'a b'");
    strictEqual(shellQuote("it's"), "'it'\\''s'");
  });
});

describe("the git commands", () => {
  it("adds and commits the listed files only, after a `--`", () => {
    strictEqual(gitAddCommand(["src/a.ts", "a b.md"]), "git --literal-pathspecs add -- 'src/a.ts' 'a b.md'");
    strictEqual(gitCommitCommand(["a[1].ts"]), `git --literal-pathspecs commit -F ${COMMIT_MESSAGE_FILE} -- 'a[1].ts'`);
    strictEqual(gitDiffCommand(["src/a.ts"]), "git --literal-pathspecs diff HEAD -- 'src/a.ts'");
  });

  it("reads the status with names unquoted, so an accented name is not refused as escaped", () => {
    strictEqual(GIT_STATUS_COMMAND, "git -c core.quotePath=false status --short --untracked-files=all");
  });

  it("pushes the branch to origin with its upstream", () => {
    strictEqual(gitPushCommand("feat/x"), "git push -u origin 'feat/x'");
  });

  it("merges by fast-forward only, and rebases inside the batch worktree", () => {
    strictEqual(gitMergeFfOnly("agent-1"), "git merge --ff-only 'agent-1'");
    strictEqual(gitRebaseIn("/w/agent 1", "feat/x"), "git -C '/w/agent 1' rebase 'feat/x'");
    strictEqual(gitRebaseAbortIn("/w/a"), "git -C '/w/a' rebase --abort");
  });
});

describe("parseDefaultBranch", () => {
  it("strips the remote's name, and is null when origin/HEAD is unset", () => {
    strictEqual(parseDefaultBranch("origin/main\n"), "main");
    strictEqual(parseDefaultBranch(""), null);
  });
});

describe("the pull request", () => {
  it("slugs the branch into a folder name, under <work>/pr-<slug>/PR.md", () => {
    strictEqual(prSlug("feat/Dev workflow#2"), "feat-Dev-workflow-2");
    strictEqual(prSlug("///"), "change");
    strictEqual(prBodyPath("workbench", "feat-x"), "workbench/pr-feat-x/PR.md");
  });

  it("renders every heading of the template, `None.` where there is nothing to say", () => {
    const body = renderPrBody({ batch: "`feat/x` — fix(api): handle null", layers: [{ layer: "Changed", paths: ["src/a.ts", "b.md"] }] });
    deepStrictEqual(body.split("\n").filter((l) => l.startsWith("## ")), [
      "## Batch", "## Files, per layer", "## Validations", "## Assumptions to validate", "## Audit", "## Not run",
    ]);
    ok(body.includes("- Changed: `src/a.ts`, `b.md`"));
    strictEqual(body.split("None.").length - 1, 4);
  });

  it("renders the assumptions as a table and the validations as a list", () => {
    const body = renderPrBody({
      batch: "F1", layers: [], validations: ["`npm test` — exit 0"], assumptions: [{ id: "H1", assumption: "a", by: "b" }],
      audit: "Verdict: **VALID**", notRun: "None.",
    });
    ok(body.includes("- `npm test` — exit 0"));
    ok(body.includes("| H1 | a | b |"));
  });

  it("prints `gh pr create` with the base when known, the title single-quoted", () => {
    strictEqual(
      ghPrCreateCommand({ base: "main", head: "feat/x", title: "fix: it's done", bodyFile: "workbench/pr-feat-x/PR.md" }),
      "gh pr create --base main --head feat/x --title 'fix: it'\\''s done' --body-file workbench/pr-feat-x/PR.md",
    );
    strictEqual(
      ghPrCreateCommand({ base: null, head: "feat/x", title: "t", bodyFile: "/abs path/PR.md" }),
      "gh pr create --head feat/x --title 't' --body-file '/abs path/PR.md'",
    );
  });
});

describe("isPushed", () => {
  it("is true when HEAD and the remote-tracking ref are one hash", () => {
    strictEqual(gitPushedCheckCommand("feat/x"), "git rev-parse HEAD 'refs/remotes/origin/feat/x'");
    strictEqual(isPushed("abc\nabc\n"), true);
    strictEqual(isPushed("abc\ndef\n"), false);
    strictEqual(isPushed("abc\n"), false);
    strictEqual(isPushed(""), false);
  });
});
