// Unit tests for runGate over FakeFiles and FakeShell. Run:
//   node --test src/crews/dev-verify/application/run-gate.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { gateRoots, runGate } from "./run-gate.ts";
import {
  CUT_LINE, CUT_NOTICE, SHEET, TRAIT_GREP, UNTRACKED, fakes, fakesWithNotes, pack, target,
} from "./run-gate.fixtures.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("gateRoots", () => {
  it("lists the set layout roots once, production first, tests last", () => {
    // Arrange
    const layout = pack("layout:\n  tests: t\n  domain: d\n  application: d\n  infrastructure: i\n");

    // Act
    const roots = gateRoots(layout);

    // Assert
    deepStrictEqual(roots, ["d", "i", "t"]);
  });

  it("lists no root without a pack", () => {
    // Arrange
    const noPack = null;

    // Act
    const roots = gateRoots(noPack);

    // Assert
    deepStrictEqual(roots, []);
  });
});

describe("runGate", () => {
  it("issues the git calls in order and returns a green report", async () => {
    // Arrange
    const { files, shell } = fakes();

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    strictEqual(out.ok, true);
    if (!out.ok) return;
    deepStrictEqual(shell.commands, ["git diff --name-only HEAD", UNTRACKED, TRAIT_GREP, "git diff --check HEAD"]);
    deepStrictEqual(out.run.changedFiles, ["src/a.ts", "src/b.ts", "tests/a.test.ts"]);
    deepStrictEqual(out.run.untrackedFiles, ["tests/a.test.ts", "src/a.ts"]);
    deepStrictEqual(out.run.roots, ["src", "tests"]);
    deepStrictEqual(out.run.excludes, ["':(exclude,glob)**/bin/**'", "':(exclude,glob)**/obj/**'"]);
    strictEqual(out.run.report.green, true);
    strictEqual(out.run.report.lines.at(-1), "GATE — batch F2: GREEN");
    deepStrictEqual(files.writes, []);
  });

  it("runs no trait grep without a marker", async () => {
    // Arrange
    const { files, shell } = fakes();

    // Act
    const out = await runGate({ files, shell }, target({ pack: pack("layout:\n  domain: src\n") }));

    // Assert
    strictEqual(shell.commands.some((c) => c.startsWith("git grep")), false);
    deepStrictEqual(shell.commands, ["git diff --name-only HEAD", "git ls-files --others --exclude-standard -- .", "git diff --check HEAD"]);
    strictEqual(out.ok && out.run.traitHits, null);
  });

  it("runs no trait grep when the sheet names no id", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.files.set(`${WORKSPACE}/workbench/demo/DEMO-PLAN-F2.md`, SHEET.replace(" BR-01", ""));

    // Act
    await runGate({ files, shell }, target());

    // Assert
    strictEqual(shell.commands.some((c) => c.startsWith("git grep")), false);
  });

  it("greps . without roots", async () => {
    // Arrange
    const bare = fakes();

    // Act
    await runGate(bare, target({ pack: pack("tests:\n  rule_trait: BR\n") }));

    // Assert
    strictEqual(bare.shell.commands[2], `git grep --untracked -I -noE -e '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]' -- .`);
  });

  it("reads git grep's exit 1 with no output as no hit: the id is untested", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results[TRAIT_GREP] = { stdout: "", exitCode: 1 };

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    strictEqual(out.ok, true);
    if (!out.ok) return;
    deepStrictEqual(out.run.report.untested, ["BR-01"]);
    strictEqual(out.run.report.green, false);
  });

  it("turns a failed git call into the gate's error text", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.errors[UNTRACKED] = new Error("command not allowed\nmore");

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    deepStrictEqual(out, { ok: false, error: `the gate could not run '${UNTRACKED}': command not allowed` });
  });

  it("turns a non-zero exit of a git call into the gate's error text", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results[UNTRACKED] = { stdout: "", stderr: "fatal: not a git repository\nmore", exitCode: 128 };

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    deepStrictEqual(out, { ok: false, error: `the gate could not run '${UNTRACKED}': exit 128 (fatal: not a git repository)` });
  });

  it("fails the gate when the runtime cut a git output, and does not take the notice for a path", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results["git diff --name-only HEAD"] = { stdout: `src/a.ts\nsrc/b.ts${CUT_NOTICE}` };

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    strictEqual(out.ok, true);
    if (!out.ok) return;
    strictEqual(out.run.changedFiles.some((f) => f === "" || f.includes("truncated")), false);
    strictEqual(out.run.changedFiles.includes("src/b.ts"), true);
    strictEqual(out.run.report.green, false);
    strictEqual(out.run.report.lines.at(-2), CUT_LINE);
    strictEqual(out.run.report.lines.at(-1), "GATE — batch F2: RED — fix and run again, no audit before");
  });

  it("does not fail the gate on a long git output that carries no notice", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results["git diff --name-only HEAD"] = { stdout: "src/x.ts".repeat(1_250) };

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    strictEqual(out.ok && out.run.report.lines.some((l) => l.includes("cut by the runtime")), false);
  });

  it("fails the rule-trait check when no root can be quoted", async () => {
    // Arrange
    const { files, shell } = fakes();

    // Act
    const out = await runGate({ files, shell }, target({ pack: pack("layout:\n  domain: \"it's\"\ntests:\n  rule_trait: BR\n") }));

    // Assert
    strictEqual(shell.commands.some((c) => c.startsWith("git grep")), false);
    strictEqual(out.ok && out.run.report.lines.includes("  FAIL rule traits: not captured: unquotable scope"), true);
    strictEqual(out.ok && out.run.report.green, false);
  });

  it("reads the *-PLAN*.md files first and names a file left beyond 60", async () => {
    // Arrange
    const { files, shell } = fakesWithNotes();

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    strictEqual(out.ok, true);
    if (!out.ok) return;
    deepStrictEqual(out.run.report.missingDesignIds, []);
    deepStrictEqual(out.run.report.lines.filter((l) => l.includes("not read")),
      ["       plan folder: A-note-58.md not read (beyond the first 60 .md files, *-PLAN*.md first)"]);
    strictEqual(out.run.report.green, true);
  });

  it("counts a throwing git diff --check as exit 1", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.errors["git diff --check HEAD"] = new Error("boom");

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    strictEqual(out.ok && out.run.report.green, false);
  });

  it("refuses a bad build output before any shell call", async () => {
    // Arrange
    const { files, shell } = fakes();

    // Act
    const out = await runGate({ files, shell }, target({ pack: pack("layout:\n  build_outputs: [bin, out/obj]\n") }));

    // Assert
    deepStrictEqual(out, { ok: false, error: "layout.build_outputs takes folder names, not paths: out/obj" });
    deepStrictEqual(shell.commands, []);
  });

  it("refuses an unreadable sheet with the first line of the error", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.files.delete(`${WORKSPACE}/workbench/demo/DEMO-PLAN-F2.md`);

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    deepStrictEqual(out, {
      ok: false,
      error: `the sheet workbench/demo/DEMO-PLAN-F2.md cannot be read (file not found: ${WORKSPACE}/workbench/demo/DEMO-PLAN-F2.md)`,
    });
    deepStrictEqual(shell.commands, []);
  });

  it("skips an unreadable plan file", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.readErrors.set(`${WORKSPACE}/workbench/demo/DEMO-PLAN.md`, new Error("denied"));

    // Act
    const out = await runGate({ files, shell }, target());

    // Assert
    strictEqual(out.ok && out.run.report.missingDesignIds.length, 16);
    deepStrictEqual(files.writes, []);
  });
});
