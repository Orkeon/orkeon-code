// /branch (commands/_lib/branch.ts): the dirty-tree guard, the name check, and
// runBranch over FakeShell. Run:
//   node --test tests/commands-branch.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  planBranch, hasUncommittedChanges, describeDirtyTreeRefusal, runBranch,
} from "../src/commands/_lib/branch.ts";
import { FakeLogger } from "./support/fake-logger.ts";
import { FakeShell } from "./support/fake-shell.ts";

describe("/branch — the dirty-tree guard", () => {
  it("detects any changed path in porcelain output", () => {
    ok(hasUncommittedChanges(" M src/index.ts"));
    ok(hasUncommittedChanges("?? new.ts\n M old.ts"));
  });

  it("treats blank output as clean", () => {
    for (const clean of ["", "   ", "\n\n", null, undefined]) {
      strictEqual(hasUncommittedChanges(clean), false, JSON.stringify(clean));
    }
  });

  it("refuses with the count, a sample and both ways out", () => {
    const porcelain = [" M a.ts", " M b.ts", "?? c.ts"].join("\n");
    const msg = describeDirtyTreeRefusal("feature", porcelain);
    ok(msg.includes("refusing to check out 'feature'"));
    ok(msg.includes("3 uncommitted change(s)"));
    ok(msg.includes("a.ts"));
    ok(msg.includes("/commit"));
    ok(msg.includes("stash"));
  });

  it("caps the sample and says how many were elided", () => {
    const porcelain = Array.from({ length: 9 }, (_, i) => ` M f${i}.ts`).join("\n");
    const msg = describeDirtyTreeRefusal("x", porcelain);
    ok(msg.includes("… and 4 more"), msg);
  });

  it("shows the current branch on a bare invocation", () => {
    deepStrictEqual(planBranch([]), { action: "show" });
  });

  it("refuses an option masquerading as a branch name", () => {
    // `git checkout --orphan` typed as a "branch" is a different operation than
    // the one the operator asked for.
    const p = planBranch(["--orphan"]);
    strictEqual(p.action, "refuse");
    ok(p.action === "refuse" && p.reason.includes("looks like an option"));
  });

  it("refuses a name with shell metacharacters", () => {
    strictEqual(planBranch(["a;b"]).action, "refuse");
    strictEqual(planBranch(["$(id)"]).action, "refuse");
  });

  it("accepts the names git accepts", () => {
    for (const good of ["main", "feature/x-1", "release-1.2", "user_x"]) {
      deepStrictEqual(planBranch([good]), { action: "checkout", branch: good }, good);
    }
  });
});

describe("/branch — runBranch", () => {
  function setup() {
    const shell = new FakeShell();
    const log = new FakeLogger();
    return { shell, log, run: (...tokens: string[]) => runBranch(tokens, { shell, log }) };
  }

  it("shows the current branch, else git's message, else a detached HEAD", async () => {
    const { shell, run } = setup();
    shell.results["git branch --show-current"] = { stdout: "main\n" };
    deepStrictEqual(await run(), { text: "main" });
    shell.results["git branch --show-current"] = { stderr: "fatal: no repo\n", exitCode: 128 };
    deepStrictEqual(await run(), { text: "fatal: no repo" });
    shell.results["git branch --show-current"] = {};
    deepStrictEqual(await run(), { text: "(detached HEAD)" });
  });

  it("refuses an option-like name without running git", async () => {
    const { shell, run } = setup();
    deepStrictEqual(await run("--orphan"), { text: "'--orphan' looks like an option, not a branch name" });
    deepStrictEqual(shell.commands, []);
  });

  it("refuses a dirty tree, logs it and never checks out", async () => {
    const { shell, log, run } = setup();
    shell.results["git status --porcelain"] = { stdout: " M a.ts\n" };
    deepStrictEqual(await run("feature"), { text: describeDirtyTreeRefusal("feature", " M a.ts\n") });
    deepStrictEqual(shell.commands, ["git status --porcelain"]);
    deepStrictEqual(log.lines, ["warn: /branch refused: uncommitted changes block the checkout of 'feature'"]);
  });

  it("checks out on a clean tree, with git's message or its own", async () => {
    const { shell, run } = setup();
    shell.results["git checkout feature"] = { stderr: "Switched to branch 'feature'\n" };
    deepStrictEqual(await run("feature"), { text: "Switched to branch 'feature'" });
    deepStrictEqual(shell.commands, ["git status --porcelain", "git checkout feature"]);
    shell.results["git checkout feature"] = {};
    deepStrictEqual(await run("feature"), { text: "switched to 'feature'" });
  });

  it("checks out when the status cannot be read, and reports a failed checkout", async () => {
    const { shell, run } = setup();
    shell.results["git status --porcelain"] = { stdout: " M a.ts", exitCode: 128 };
    shell.results["git checkout feature"] = { exitCode: 1, stderr: "error: pathspec 'feature' did not match\n" };
    deepStrictEqual(await run("feature"), { text: "checkout failed: error: pathspec 'feature' did not match" });
    shell.results["git checkout feature"] = { exitCode: 1 };
    deepStrictEqual(await run("feature"), { text: "checkout failed: exit code 1" });
  });
});
