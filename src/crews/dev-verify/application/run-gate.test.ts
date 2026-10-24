// Unit tests for runGate over FakeFiles and FakeShell. Run:
//   node --test src/crews/dev-verify/application/run-gate.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { gateRoots, runGate } from "./run-gate.ts";
import type { DevVerifyTarget } from "./run-gate.ts";

function pack(yaml: string): RepoPack {
  const r = parseRepoPack(yaml);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

const PACK = pack("layout:\n  domain: src\n  tests: tests\n  build_outputs: [bin, obj]\ntests:\n  rule_trait: BR\n");
const EX = "':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'";
const UNTRACKED = `git ls-files --others --exclude-standard -- . ${EX}`;
const TRAIT_GREP = `git grep --untracked -I -noE -e '\\[Trait\\("BR", *"(BR|UC|CH)-[0-9]+"\\)\\]' -- src tests ${EX}`;

const SHEET = "# DEMO-PLAN-F2 — Command\n| Applied rules | DDD-01 |\n## TDD sequence\n| # | Test |\n|---|---|\n" +
  "| 1 | `ShowsTheState` BR-01 |\nTDD: RED [x] GREEN [x] COST [x]\n";
const PLAN = "# DEMO-PLAN\nNon-applicable rules: DDD-02 DDD-03 DDD-04 DDD-05 DDD-06 DDD-07 DDD-08 DDD-09 DDD-10 DDD-11 " +
  "APP-01 APP-02 APP-03 APP-04 APP-05 PERF-01\n";

function target(over: Partial<DevVerifyTarget> = {}): DevVerifyTarget {
  return {
    batch: "F2", code: "demo", prefix: "DEMO", workShown: "workbench", planDirShown: "workbench/demo",
    sheetShown: "workbench/demo/DEMO-PLAN-F2.md", pack: PACK, packShown: ".orkeon/repo.yaml", ...over,
  };
}

function fakes() {
  const files = new FakeFiles();
  files.files.set("/workspace/workbench/demo/DEMO-PLAN-F2.md", SHEET);
  files.files.set("/workspace/workbench/demo/DEMO-PLAN.md", PLAN);
  files.listings.set("/workspace/workbench/demo", ["DEMO-PLAN-F2.md", "DEMO-PLAN.md", "logs", "notes.txt"]);
  const shell = new FakeShell();
  shell.results["git diff --name-only HEAD"] = { stdout: "src/b.ts\nsrc/a.ts\n" };
  shell.results[UNTRACKED] = { stdout: "tests/a.test.ts\nsrc/a.ts\n" };
  shell.results[TRAIT_GREP] = { stdout: 'tests/a.test.ts:3:[Trait("BR", "BR-01")]\n' };
  return { files, shell };
}

describe("gateRoots", () => {
  it("lists the set layout roots once, production first, tests last", () => {
    deepStrictEqual(gateRoots(pack("layout:\n  tests: t\n  domain: d\n  application: d\n  infrastructure: i\n")), ["d", "i", "t"]);
    deepStrictEqual(gateRoots(null), []);
  });
});

describe("runGate", () => {
  it("issues the git calls in order and returns a green report", async () => {
    const { files, shell } = fakes();
    const out = await runGate({ files, shell }, target());
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
    const { files, shell } = fakes();
    const out = await runGate({ files, shell }, target({ pack: pack("layout:\n  domain: src\n") }));
    strictEqual(shell.commands.some((c) => c.startsWith("git grep")), false);
    deepStrictEqual(shell.commands, ["git diff --name-only HEAD", "git ls-files --others --exclude-standard -- .", "git diff --check HEAD"]);
    strictEqual(out.ok && out.run.traitHits, null);
  });
  it("runs no trait grep when the sheet names no id, and greps . without roots", async () => {
    const { files, shell } = fakes();
    files.files.set("/workspace/workbench/demo/DEMO-PLAN-F2.md", SHEET.replace(" BR-01", ""));
    await runGate({ files, shell }, target());
    strictEqual(shell.commands.some((c) => c.startsWith("git grep")), false);
    const bare = fakes();
    await runGate(bare, target({ pack: pack("tests:\n  rule_trait: BR\n") }));
    strictEqual(bare.shell.commands[2], `git grep --untracked -I -noE -e '\\[Trait\\("BR", *"(BR|UC|CH)-[0-9]+"\\)\\]' -- .`);
  });
  it("reads git grep's exit 1 with no output as no hit: the id is untested", async () => {
    const { files, shell } = fakes();
    shell.results[TRAIT_GREP] = { stdout: "", exitCode: 1 };
    const out = await runGate({ files, shell }, target());
    strictEqual(out.ok, true);
    if (!out.ok) return;
    deepStrictEqual(out.run.report.untested, ["BR-01"]);
    strictEqual(out.run.report.green, false);
  });
  it("turns a failed git call into the gate's error text", async () => {
    const { files, shell } = fakes();
    shell.errors[UNTRACKED] = new Error("command not allowed\nmore");
    deepStrictEqual(await runGate({ files, shell }, target()),
      { ok: false, error: `the gate could not run '${UNTRACKED}': command not allowed` });
  });
  it("turns a non-zero exit of a git call into the gate's error text", async () => {
    const { files, shell } = fakes();
    shell.results[UNTRACKED] = { stdout: "", stderr: "fatal: not a git repository\nmore", exitCode: 128 };
    deepStrictEqual(await runGate({ files, shell }, target()),
      { ok: false, error: `the gate could not run '${UNTRACKED}': exit 128 (fatal: not a git repository)` });
  });
  it("fails the gate when a git output stops at 4 000 characters without a final newline", async () => {
    const { files, shell } = fakes();
    const cut = `${"src/x.ts\n".repeat(444)}src/`;
    strictEqual(cut.length, 4_000);
    shell.results["git diff --name-only HEAD"] = { stdout: cut };
    const out = await runGate({ files, shell }, target());
    strictEqual(out.ok, true);
    if (!out.ok) return;
    strictEqual(out.run.report.green, false);
    const line = "  FAIL the output of 'git diff --name-only HEAD' stops at 4000 characters without a final newline: " +
      "the list may be cut, run the gate again on a smaller change";
    strictEqual(out.run.report.lines.at(-2), line);
    strictEqual(out.run.report.lines.at(-1), "GATE — batch F2: RED — fix and run again, no audit before");
    shell.results["git diff --name-only HEAD"] = { stdout: `${cut.slice(0, 3_999)}\n` };
    const whole = await runGate({ files, shell }, target());
    strictEqual(whole.ok && whole.run.report.lines.includes(line), false);
  });
  it("fails the rule-trait check when no root can be quoted", async () => {
    const { files, shell } = fakes();
    const out = await runGate({ files, shell }, target({ pack: pack("layout:\n  domain: \"it's\"\ntests:\n  rule_trait: BR\n") }));
    strictEqual(shell.commands.some((c) => c.startsWith("git grep")), false);
    strictEqual(out.ok && out.run.report.lines.includes("  FAIL rule traits: not captured: unquotable scope"), true);
    strictEqual(out.ok && out.run.report.green, false);
  });
  it("reads the *-PLAN*.md files first and names a file left beyond 60", async () => {
    const { files, shell } = fakes();
    const notes = Array.from({ length: 59 }, (_, i) => `A-note-${String(i).padStart(2, "0")}.md`);
    for (const n of notes) files.files.set(`/workspace/workbench/demo/${n}`, "# note\n");
    files.listings.set("/workspace/workbench/demo", [...notes, "DEMO-PLAN-F2.md", "DEMO-PLAN.md"]);
    const out = await runGate({ files, shell }, target());
    strictEqual(out.ok, true);
    if (!out.ok) return;
    deepStrictEqual(out.run.report.missingDesignIds, []);
    deepStrictEqual(out.run.report.lines.filter((l) => l.includes("not read")),
      ["       plan folder: A-note-58.md not read (beyond the first 60 .md files, *-PLAN*.md first)"]);
    strictEqual(out.run.report.green, true);
  });
  it("counts a throwing git diff --check as exit 1", async () => {
    const { files, shell } = fakes();
    shell.errors["git diff --check HEAD"] = new Error("boom");
    const out = await runGate({ files, shell }, target());
    strictEqual(out.ok && out.run.report.green, false);
  });
  it("refuses a bad build output before any shell call", async () => {
    const { files, shell } = fakes();
    const out = await runGate({ files, shell }, target({ pack: pack("layout:\n  build_outputs: [bin, out/obj]\n") }));
    deepStrictEqual(out, { ok: false, error: "layout.build_outputs takes folder names, not paths: out/obj" });
    deepStrictEqual(shell.commands, []);
  });
  it("refuses an unreadable sheet with the first line of the error", async () => {
    const { files, shell } = fakes();
    files.files.delete("/workspace/workbench/demo/DEMO-PLAN-F2.md");
    deepStrictEqual(await runGate({ files, shell }, target()), {
      ok: false,
      error: "the sheet workbench/demo/DEMO-PLAN-F2.md cannot be read (file not found: /workspace/workbench/demo/DEMO-PLAN-F2.md)",
    });
    deepStrictEqual(shell.commands, []);
  });
  it("skips an unreadable plan file", async () => {
    const { files, shell } = fakes();
    files.readErrors.set("/workspace/workbench/demo/DEMO-PLAN.md", new Error("denied"));
    const out = await runGate({ files, shell }, target());
    strictEqual(out.ok && out.run.report.missingDesignIds.length, 16);
    deepStrictEqual(files.writes, []);
  });
});
