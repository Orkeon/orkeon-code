// /diff (commands/_lib/git/diff.ts): the option and pathspec allowlist, and runDiff
// over FakeShell. Run:
//   node --test src/commands/_lib/git/diff.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok, deepStrictEqual } from "node:assert";

import {
  planDiff, describeDiffScope, NO_CHANGES_MESSAGE, ALLOWED_DIFF_FLAGS,
} from "./diff.ts";
import { BAD_PATHSPECS, GIT_FAILURE_CASES, PATHSPEC_CASES, READER_FLAGS, diffHarness } from "./diff.fixtures.ts";

describe("/diff — planDiff", () => {
  it("passes the baseline's --staged flag", () => {
    // Arrange
    const tokens = ["--staged"];

    // Act
    const p = planDiff(tokens);

    // Assert
    strictEqual(p.staged, true);
    strictEqual(p.args, "--staged");
  });

  it("reports the scope of the --staged flag", () => {
    // Arrange
    const p = planDiff(["--staged"]);

    // Act
    const scope = describeDiffScope(p);

    // Assert
    strictEqual(scope, "staged changes");
  });

  it("treats --cached as --staged, since git does", () => {
    // Arrange
    const tokens = ["--cached"];

    // Act
    const p = planDiff(tokens);

    // Assert
    strictEqual(p.staged, true);
  });

  it("defaults to the working tree", () => {
    // Arrange
    const tokens: string[] = [];

    // Act
    const p = planDiff(tokens);

    // Assert
    strictEqual(p.staged, false);
    strictEqual(p.args, "");
  });

  it("reports the working tree as the default scope", () => {
    // Arrange
    const p = planDiff([]);

    // Act
    const scope = describeDiffScope(p);

    // Assert
    ok(scope.includes("working-tree"), scope);
  });

  it("refuses an option outside the allowlist, BY NAME", () => {
    // Arrange
    // The pre-B-11 handler appended every token verbatim. Not an injection (the
    // shell tool bans operators) but unbounded: `--output=` is a plain git option
    // that writes a file.
    const tokens = ["--output=/tmp/x"];

    // Act
    const p = planDiff(tokens);

    // Assert
    strictEqual(p.args, "");
    strictEqual(p.rejected.length, 1);
    ok(p.rejected[0].reason.includes("not an allowed diff option"));
  });

  for (const flag of READER_FLAGS) {
    it(`keeps the flags a diff reader actually uses: ${flag}`, () => {
      // Arrange
      const tokens = [flag];

      // Act
      const p = planDiff(tokens);

      // Assert
      ok(ALLOWED_DIFF_FLAGS.includes(flag), flag);
      strictEqual(p.rejected.length, 0, flag);
    });
  }

  it("accepts an option with a value (--unified=3)", () => {
    // Arrange
    const tokens = ["--unified=3"];

    // Act
    const p = planDiff(tokens);

    // Assert
    strictEqual(p.args, "--unified=3");
  });

  for (const c of PATHSPEC_CASES) {
    it(`separates pathspecs with -- so a path is never read as a ref: ${c.name}`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const p = planDiff(tokens);

      // Assert
      strictEqual(p.args, c.args);
    });
  }

  for (const bad of BAD_PATHSPECS) {
    it(`refuses a pathspec with traversal or shell metacharacters: ${JSON.stringify(bad)}`, () => {
      // Arrange
      const tokens = [bad];

      // Act
      const p = planDiff(tokens);

      // Assert
      strictEqual(p.args.includes(bad), false, bad);
      ok(p.rejected.length > 0, bad);
    });
  }

  it("says 'No changes to show.' — the baseline's wording", () => {
    // Arrange
    // "(no output)" reads like the command failed to produce any.
    const expected = "No changes to show.";

    // Act
    const message = NO_CHANGES_MESSAGE;

    // Assert
    strictEqual(message, expected);
  });
});

describe("/diff — runDiff", () => {
  it("writes the scope then the diff, and closes without a message", async () => {
    // Arrange
    const { shell, run } = diffHarness({ "git diff --staged": { stdout: "diff --git a/x b/x\n" } });

    // Act
    const view = await run("--staged");

    // Assert
    deepStrictEqual(view, { lines: ["── staged changes", "diff --git a/x b/x\n"] });
    deepStrictEqual(shell.commands, ["git diff --staged"]);
  });

  it("says there is nothing to show, with the scope", async () => {
    // Arrange
    const { shell, run } = diffHarness();

    // Act
    const view = await run();

    // Assert
    deepStrictEqual(view, { text: `${NO_CHANGES_MESSAGE} (working-tree changes since the last commit)` });
    deepStrictEqual(shell.commands, ["git diff"]);
  });

  it("logs each ignored argument before the call and counts them in the closing message", async () => {
    // Arrange
    const { log, run } = diffHarness({ "git diff -- src": { stdout: "d" } });

    // Act
    const view = await run("--output=/tmp/x", "src");

    // Assert
    deepStrictEqual(view, {
      lines: ["── working-tree changes since the last commit", "d"],
      text: "1 argument(s) ignored — see the log.",
    });
    strictEqual(log.lines.length, 1);
    ok(log.lines[0].startsWith("warn: /diff ignored '--output=/tmp/x' — not an allowed diff option"));
  });

  for (const c of GIT_FAILURE_CASES) {
    it(c.name, async () => {
      // Arrange
      const { run } = diffHarness({ "git diff": c.answer });

      // Act
      const view = await run();

      // Assert
      deepStrictEqual(view, { text: c.text });
    });
  }
});
