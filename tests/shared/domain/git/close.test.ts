// Unit tests for the git close rules. Run:
//   node --test src/shared/domain/git/close.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  COMMIT_MESSAGE_FILE, GIT_STATUS_COMMAND, IDENTITY_HANDOVER, changedPaths, indexDeletedPaths, ghPrCreateCommand, gitAddCommand, gitCommitCommand,
  gitDiffCommand, gitMergeFfOnly, isNotFastForward, isPushed, gitPushCommand, gitPushedCheckCommand, gitRebaseAbortIn, gitRebaseIn, identityStop, parseDefaultBranch,
  parseGitIdent, prBodyPath, prSlug, renderPrBody, selectCommitFiles, shellQuote, shellUnsafe,
} from "../../../../src/shared/domain/git/close.ts";
import {
  DEFAULT_BRANCHES, FULL_PR, GIT_REASON, IDENTITY_COMMANDS, MERGE_FAILURES, NOT_IDENTS, PR_COMMANDS, PR_HEADINGS, PUSHED_CHECKS, QUOTED,
  RENAME_STATUS, SAFE_ARGS, SHORT_PR, SLUGS, STAGED_STATUS, STATUS, UNSAFE_ARGS, UNSAFE_STATUS,
} from "./close.fixtures.ts";

describe("parseGitIdent", () => {
  it("reads the name and the email of `git var GIT_AUTHOR_IDENT`", () => {
    // Arrange
    const out = "Ada Lovelace <ada@example.com> 1700000000 +0100\n";

    // Act
    const ident = parseGitIdent(out);

    // Assert
    deepStrictEqual(ident, { name: "Ada Lovelace", email: "ada@example.com" });
  });

  for (const out of NOT_IDENTS) {
    it(`is null on an empty answer, a line without an email, and git's placeholder domain: '${out}'`, () => {
      // Arrange
      const answer = out;

      // Act
      const ident = parseGitIdent(answer);

      // Assert
      strictEqual(ident, null);
    });
  }
});

describe("identityStop", () => {
  it("names git's reason and hands over the two commands, one per line, without inventing an identity", () => {
    // Arrange
    const reason = GIT_REASON;

    // Act
    const text = identityStop(reason, "/commit");

    // Assert
    const lines = text.split("\n");
    ok(lines[0].includes("fatal: unable to auto-detect email address"));
    ok(lines[0].includes("/commit"));
    deepStrictEqual(lines.slice(1), IDENTITY_HANDOVER.map((c) => `  ${c}`));
    deepStrictEqual(IDENTITY_HANDOVER, IDENTITY_COMMANDS);
  });
});

describe("changedPaths", () => {
  it("lists every path once, both sides of a rename, quotes removed", () => {
    // Arrange
    const status = RENAME_STATUS;

    // Act
    const paths = changedPaths(status);

    // Assert
    deepStrictEqual(paths, ["a.ts", "old.ts", "new.ts", "with space.md", "gone.ts"]);
  });

  it("skips a file added then deleted from the worktree (`AD`): nothing of it is left to commit", () => {
    // Arrange
    const status = "AD ghost.ts\n M a.ts\n";

    // Act
    const paths = changedPaths(status);

    // Assert
    deepStrictEqual(paths, ["a.ts"]);
  });
});

describe("isNotFastForward", () => {
  for (const c of MERGE_FAILURES) {
    it(`tells git's not-a-fast-forward refusal from another failure: ${c.name}`, () => {
      // Arrange
      const { stderr } = c;

      // Act
      const refused = isNotFastForward(stderr);

      // Assert
      strictEqual(refused, c.notFastForward);
    });
  }
});

describe("indexDeletedPaths", () => {
  it("names a staged deletion and the old side of a staged rename, not a deletion left unstaged", () => {
    // Arrange
    const status = STAGED_STATUS;

    // Act
    const paths = indexDeletedPaths(status);

    // Assert
    deepStrictEqual(paths, ["gone.ts", "old.ts", "a.ts"]);
  });
});

describe("selectCommitFiles", () => {
  it("takes every changed path but the work folder's when no path is named", () => {
    // Arrange
    const request = { status: STATUS, workFolder: "workbench" };

    // Act
    const selection = selectCommitFiles(request);

    // Assert
    deepStrictEqual(selection, {
      files: ["src/a.ts", "src/new.ts", "docs/x.md"], leftOut: ["workbench/code/PLAN.md"],
      inWorkFolder: [], unchanged: [], unsafe: [],
    });
  });

  it("takes a named file, and the changed files under a named folder", () => {
    // Arrange
    const request = { status: STATUS, workFolder: "workbench", named: ["./src/", "docs/x.md"] };

    // Act
    const selection = selectCommitFiles(request);

    // Assert
    deepStrictEqual(selection.files, ["src/a.ts", "src/new.ts", "docs/x.md"]);
  });

  it("refuses a named path of the work folder and a named path with no change", () => {
    // Arrange
    const request = { status: STATUS, workFolder: "backstage/tasks", named: ["backstage/tasks/a.md", "README.md"] };

    // Act
    const s = selectCommitFiles(request);

    // Assert
    deepStrictEqual([s.files, s.inWorkFolder, s.unchanged], [[], ["backstage/tasks/a.md"], ["README.md"]]);
  });

  it("leaves the work folder out of a named parent folder", () => {
    // Arrange
    const request = { status: STATUS, workFolder: "workbench", named: ["."] };

    // Act
    const selection = selectCommitFiles(request);

    // Assert
    deepStrictEqual(selection.leftOut, ["workbench/code/PLAN.md"]);
  });

  it("excludes nothing for a work folder outside the checkout", () => {
    // Arrange
    const request = { status: STATUS, workFolder: "/home/main/workbench" };

    // Act
    const selection = selectCommitFiles(request);

    // Assert
    deepStrictEqual(selection.leftOut, []);
  });

  it("lets a path named inside the work folder through only when asked (/commit)", () => {
    // Arrange
    const request = { status: STATUS, workFolder: "workbench", named: ["workbench/code"], namedWorkFolder: true };

    // Act
    const s = selectCommitFiles(request);

    // Assert
    deepStrictEqual([s.files, s.inWorkFolder, s.leftOut], [["workbench/code/PLAN.md"], [], []]);
  });

  it("never lets the work folder into the default list, even when asked", () => {
    // Arrange
    const request = { status: STATUS, workFolder: "workbench", namedWorkFolder: true };

    // Act
    const selection = selectCommitFiles(request);

    // Assert
    deepStrictEqual(selection.leftOut, ["workbench/code/PLAN.md"]);
  });

  it("names the paths the runtime's shell cannot carry", () => {
    // Arrange
    const request = { status: UNSAFE_STATUS, workFolder: "" };

    // Act
    const selection = selectCommitFiles(request);

    // Assert
    deepStrictEqual(selection.unsafe, ["a\\\"b.ts", "x;y.ts"]);
  });
});

describe("shellUnsafe and shellQuote", () => {
  for (const s of UNSAFE_ARGS) {
    it(`refuses quotes, backslashes, newlines and the runtime's forbidden operators: ${JSON.stringify(s)}`, () => {
      // Arrange
      const arg = s;

      // Act
      const unsafe = shellUnsafe(arg);

      // Assert
      strictEqual(unsafe, true, s);
    });
  }

  for (const s of SAFE_ARGS) {
    it(`lets a plain argument through: ${JSON.stringify(s)}`, () => {
      // Arrange
      const arg = s;

      // Act
      const unsafe = shellUnsafe(arg);

      // Assert
      strictEqual(unsafe, false, s);
    });
  }

  for (const c of QUOTED) {
    it(`single-quotes an argument for a POSIX shell: ${c.arg}`, () => {
      // Arrange
      const { arg } = c;

      // Act
      const quoted = shellQuote(arg);

      // Assert
      strictEqual(quoted, c.quoted);
    });
  }
});

describe("the git commands", () => {
  it("adds the listed files only, after a `--`", () => {
    // Arrange
    const files = ["src/a.ts", "a b.md"];

    // Act
    const command = gitAddCommand(files);

    // Assert
    strictEqual(command, "git --literal-pathspecs add -- 'src/a.ts' 'a b.md'");
  });

  it("commits the listed files only, after a `--`", () => {
    // Arrange
    const files = ["a[1].ts"];

    // Act
    const command = gitCommitCommand(files);

    // Assert
    strictEqual(command, `git --literal-pathspecs commit -F ${COMMIT_MESSAGE_FILE} -- 'a[1].ts'`);
  });

  it("diffs the listed files only, after a `--`", () => {
    // Arrange
    const files = ["src/a.ts"];

    // Act
    const command = gitDiffCommand(files);

    // Assert
    strictEqual(command, "git --literal-pathspecs diff HEAD -- 'src/a.ts'");
  });

  it("reads the status with names unquoted, so an accented name is not refused as escaped", () => {
    // Arrange
    const expected = "git -c core.quotePath=false status --short --untracked-files=all";

    // Act
    const command = GIT_STATUS_COMMAND;

    // Assert
    strictEqual(command, expected);
  });

  it("pushes the branch to origin with its upstream", () => {
    // Arrange
    const branch = "feat/x";

    // Act
    const command = gitPushCommand(branch);

    // Assert
    strictEqual(command, "git push -u origin 'feat/x'");
  });

  it("merges by fast-forward only", () => {
    // Arrange
    const branch = "agent-1";

    // Act
    const command = gitMergeFfOnly(branch);

    // Assert
    strictEqual(command, "git merge --ff-only 'agent-1'");
  });

  it("rebases inside the batch worktree", () => {
    // Arrange
    const worktree = "/w/agent 1";

    // Act
    const command = gitRebaseIn(worktree, "feat/x");

    // Assert
    strictEqual(command, "git -C '/w/agent 1' rebase 'feat/x'");
  });

  it("aborts a rebase inside the batch worktree", () => {
    // Arrange
    const worktree = "/w/a";

    // Act
    const command = gitRebaseAbortIn(worktree);

    // Assert
    strictEqual(command, "git -C '/w/a' rebase --abort");
  });
});

describe("parseDefaultBranch", () => {
  for (const c of DEFAULT_BRANCHES) {
    it(`strips the remote's name, and is null when origin/HEAD is unset: ${c.name}`, () => {
      // Arrange
      const { out } = c;

      // Act
      const branch = parseDefaultBranch(out);

      // Assert
      strictEqual(branch, c.branch);
    });
  }
});

describe("the pull request", () => {
  for (const c of SLUGS) {
    it(`slugs the branch into a folder name: ${c.branch}`, () => {
      // Arrange
      const { branch } = c;

      // Act
      const slug = prSlug(branch);

      // Assert
      strictEqual(slug, c.slug);
    });
  }

  it("puts the body under <work>/pr-<slug>/PR.md", () => {
    // Arrange
    const work = "workbench";

    // Act
    const path = prBodyPath(work, "feat-x");

    // Assert
    strictEqual(path, "workbench/pr-feat-x/PR.md");
  });

  it("renders every heading of the template, `None.` where there is nothing to say", () => {
    // Arrange
    const pr = SHORT_PR;

    // Act
    const body = renderPrBody(pr);

    // Assert
    deepStrictEqual(body.split("\n").filter((l) => l.startsWith("## ")), PR_HEADINGS);
    ok(body.includes("- Changed: `src/a.ts`, `b.md`"));
    strictEqual(body.split("None.").length - 1, 4);
  });

  it("renders the assumptions as a table and the validations as a list", () => {
    // Arrange
    const pr = FULL_PR;

    // Act
    const body = renderPrBody(pr);

    // Assert
    ok(body.includes("- `npm test` — exit 0"));
    ok(body.includes("| H1 | a | b |"));
  });

  for (const c of PR_COMMANDS) {
    it(`prints \`gh pr create\` with the base when known, the title single-quoted: ${c.name}`, () => {
      // Arrange
      const { pr } = c;

      // Act
      const command = ghPrCreateCommand(pr);

      // Assert
      strictEqual(command, c.command);
    });
  }
});

describe("isPushed", () => {
  it("reads HEAD and the remote-tracking ref", () => {
    // Arrange
    const branch = "feat/x";

    // Act
    const command = gitPushedCheckCommand(branch);

    // Assert
    strictEqual(command, "git rev-parse HEAD 'refs/remotes/origin/feat/x'");
  });

  for (const c of PUSHED_CHECKS) {
    it(`is true when HEAD and the remote-tracking ref are one hash: ${c.name}`, () => {
      // Arrange
      const { out } = c;

      // Act
      const pushed = isPushed(out);

      // Assert
      strictEqual(pushed, c.pushed);
    });
  }
});
