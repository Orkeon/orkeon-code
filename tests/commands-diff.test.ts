// /diff (commands/_lib/diff.ts): the option and pathspec allowlist, and runDiff
// over FakeShell. Run:
//   node --test tests/commands-diff.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import {
  planDiff, describeDiffScope, runDiff, NO_CHANGES_MESSAGE, ALLOWED_DIFF_FLAGS,
} from "../src/commands/_lib/diff.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakeShell } from "./support/fake-shell.ts";

describe("/diff — planDiff", () => {
  it("passes the baseline's --staged flag and reports the scope", () => {
    const p = planDiff(["--staged"]);
    strictEqual(p.staged, true);
    strictEqual(p.args, "--staged");
    strictEqual(describeDiffScope(p), "staged changes");
  });

  it("treats --cached as --staged, since git does", () => {
    strictEqual(planDiff(["--cached"]).staged, true);
  });

  it("defaults to the working tree", () => {
    const p = planDiff([]);
    strictEqual(p.staged, false);
    strictEqual(p.args, "");
    ok(describeDiffScope(p).includes("working-tree"));
  });

  it("refuses an option outside the allowlist, BY NAME", () => {
    // The pre-B-11 handler appended every token verbatim. Not an injection (the
    // shell tool bans operators) but unbounded: `--output=` is a plain git option
    // that writes a file.
    const p = planDiff(["--output=/tmp/x"]);
    strictEqual(p.args, "");
    strictEqual(p.rejected.length, 1);
    ok(p.rejected[0].reason.includes("not an allowed diff option"));
  });

  it("keeps the flags a diff reader actually uses", () => {
    for (const flag of ["--stat", "--name-only", "-p", "--word-diff"]) {
      ok(ALLOWED_DIFF_FLAGS.includes(flag), flag);
      strictEqual(planDiff([flag]).rejected.length, 0, flag);
    }
  });

  it("accepts an option with a value (--unified=3)", () => {
    strictEqual(planDiff(["--unified=3"]).args, "--unified=3");
  });

  it("separates pathspecs with -- so a path is never read as a ref", () => {
    strictEqual(planDiff(["src/index.ts"]).args, "-- src/index.ts");
    strictEqual(planDiff(["--stat", "src/"]).args, "--stat -- src/");
  });

  it("refuses a pathspec with traversal or shell metacharacters", () => {
    for (const bad of ["../etc/passwd", "a;b", "$(id)", "a|b", "a b\tc"]) {
      const p = planDiff([bad]);
      strictEqual(p.args.includes(bad), false, bad);
      ok(p.rejected.length > 0, bad);
    }
  });

  it("says 'No changes to show.' — the baseline's wording", () => {
    // "(no output)" reads like the command failed to produce any.
    strictEqual(NO_CHANGES_MESSAGE, "No changes to show.");
  });
});

describe("/diff — runDiff", () => {
  function setup() {
    const shell = new FakeShell();
    const log = new FakeLogger();
    return { shell, log, run: (...tokens: string[]) => runDiff(tokens, { shell, log }) };
  }

  it("writes the scope then the diff, and closes without a message", async () => {
    const { shell, run } = setup();
    shell.results["git diff --staged"] = { stdout: "diff --git a/x b/x\n" };
    deepStrictEqual(await run("--staged"), { lines: ["── staged changes", "diff --git a/x b/x\n"] });
    deepStrictEqual(shell.commands, ["git diff --staged"]);
  });

  it("says there is nothing to show, with the scope", async () => {
    const { shell, run } = setup();
    deepStrictEqual(await run(), { text: `${NO_CHANGES_MESSAGE} (working-tree changes since the last commit)` });
    deepStrictEqual(shell.commands, ["git diff"]);
  });

  it("logs each ignored argument before the call and counts them in the closing message", async () => {
    const { shell, log, run } = setup();
    shell.results["git diff -- src"] = { stdout: "d" };
    deepStrictEqual(await run("--output=/tmp/x", "src"), {
      lines: ["── working-tree changes since the last commit", "d"],
      text: "1 argument(s) ignored — see the log.",
    });
    strictEqual(log.lines.length, 1);
    ok(log.lines[0].startsWith("warn: /diff ignored '--output=/tmp/x' — not an allowed diff option"));
  });

  it("reports git's failure, its stderr or its exit code", async () => {
    const { shell, run } = setup();
    shell.results["git diff"] = { exitCode: 128, stderr: "fatal: not a git repository\n" };
    deepStrictEqual(await run(), { text: "git diff failed: fatal: not a git repository" });
    shell.results["git diff"] = { exitCode: 2 };
    deepStrictEqual(await run(), { text: "git diff failed: exit code 2" });
  });
});
