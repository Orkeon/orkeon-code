// /branch (commands/_lib/branch.ts): the dirty-tree guard, the name check, and
// runBranch over FakeShell. Run:
//   node --test src/commands/_lib/branch.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  planBranch, hasUncommittedChanges, describeDirtyTreeRefusal,
} from "./branch.ts";
import {
  CLEAN_CHECKOUT_CASES,
  CLEAN_OUTPUTS,
  DIRTY_OUTPUTS,
  FAILED_CHECKOUT_CASES,
  GOOD_NAMES,
  NINE_CHANGES,
  SHELL_META_NAMES,
  SHOW_CASES,
  THREE_CHANGES,
  UNREADABLE_STATUS,
  branchHarness,
} from "./branch.fixtures.ts";
import { assertMentions } from "../../../tests/support/assertions/text.ts";

describe("/branch — the dirty-tree guard", () => {
  for (const c of DIRTY_OUTPUTS) {
    it(`detects any changed path in porcelain output: ${c.name}`, () => {
      // Arrange
      const { porcelain } = c;

      // Act
      const dirty = hasUncommittedChanges(porcelain);

      // Assert
      ok(dirty);
    });
  }

  for (const clean of CLEAN_OUTPUTS) {
    it(`treats blank output as clean: ${JSON.stringify(clean)}`, () => {
      // Arrange
      const porcelain = clean;

      // Act
      const dirty = hasUncommittedChanges(porcelain);

      // Assert
      strictEqual(dirty, false, JSON.stringify(clean));
    });
  }

  it("refuses with the count, a sample and both ways out", () => {
    // Arrange
    const porcelain = THREE_CHANGES;

    // Act
    const msg = describeDirtyTreeRefusal("feature", porcelain);

    // Assert
    assertMentions(msg, ["refusing to check out 'feature'", "3 uncommitted change(s)", "a.ts", "/commit", "stash"]);
  });

  it("caps the sample and says how many were elided", () => {
    // Arrange
    const porcelain = NINE_CHANGES;

    // Act
    const msg = describeDirtyTreeRefusal("x", porcelain);

    // Assert
    ok(msg.includes("… and 4 more"), msg);
  });

  it("shows the current branch on a bare invocation", () => {
    // Arrange
    const tokens: string[] = [];

    // Act
    const plan = planBranch(tokens);

    // Assert
    deepStrictEqual(plan, { action: "show" });
  });

  it("refuses an option masquerading as a branch name", () => {
    // Arrange
    // `git checkout --orphan` typed as a "branch" is a different operation than
    // the one the operator asked for.
    const tokens = ["--orphan"];

    // Act
    const p = planBranch(tokens);

    // Assert
    strictEqual(p.action, "refuse");
    ok(p.action === "refuse" && p.reason.includes("looks like an option"));
  });

  for (const name of SHELL_META_NAMES) {
    it(`refuses a name with shell metacharacters: ${name}`, () => {
      // Arrange
      const tokens = [name];

      // Act
      const plan = planBranch(tokens);

      // Assert
      strictEqual(plan.action, "refuse");
    });
  }

  for (const good of GOOD_NAMES) {
    it(`accepts the names git accepts: ${good}`, () => {
      // Arrange
      const tokens = [good];

      // Act
      const plan = planBranch(tokens);

      // Assert
      deepStrictEqual(plan, { action: "checkout", branch: good }, good);
    });
  }
});

describe("/branch — runBranch", () => {
  for (const c of SHOW_CASES) {
    it(`${c.name} on a bare invocation`, async () => {
      // Arrange
      const { run } = branchHarness({ "git branch --show-current": c.answer });

      // Act
      const view = await run();

      // Assert
      deepStrictEqual(view, { text: c.text });
    });
  }

  it("refuses an option-like name without running git", async () => {
    // Arrange
    const { shell, run } = branchHarness();

    // Act
    const view = await run("--orphan");

    // Assert
    deepStrictEqual(view, { text: "'--orphan' looks like an option, not a branch name" });
    deepStrictEqual(shell.commands, []);
  });

  it("refuses a dirty tree, logs it and never checks out", async () => {
    // Arrange
    const { shell, log, run } = branchHarness({ "git status --porcelain": { stdout: " M a.ts\n" } });

    // Act
    const view = await run("feature");

    // Assert
    deepStrictEqual(view, { text: describeDirtyTreeRefusal("feature", " M a.ts\n") });
    deepStrictEqual(shell.commands, ["git status --porcelain"]);
    deepStrictEqual(log.lines, ["warn: /branch refused: uncommitted changes block the checkout of 'feature'"]);
  });

  for (const c of CLEAN_CHECKOUT_CASES) {
    it(c.name, async () => {
      // Arrange
      const { shell, run } = branchHarness({ "git checkout feature": c.answer });

      // Act
      const view = await run("feature");

      // Assert
      deepStrictEqual(view, { text: c.text });
      deepStrictEqual(shell.commands, ["git status --porcelain", "git checkout feature"]);
    });
  }

  for (const c of FAILED_CHECKOUT_CASES) {
    it(c.name, async () => {
      // Arrange
      const { run } = branchHarness({ "git status --porcelain": UNREADABLE_STATUS, "git checkout feature": c.answer });

      // Act
      const view = await run("feature");

      // Assert
      deepStrictEqual(view, { text: c.text });
    });
  }
});
