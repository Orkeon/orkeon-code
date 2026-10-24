// Unit tests for writeCapture over FakeFiles and FakeShell. Run:
//   node --test src/crews/dev-verify/application/capture.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { traitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import { sheetFacts } from "../domain/sheet-facts.ts";
import {
  findNewer, gitDiffTracked, gitDiffUntracked, gitMethodGrep, gitStatusShort, gitTestFilesNaming,
} from "../domain/commands.ts";
import { MAX_SECTION_CHARS } from "../domain/capture-sections.ts";
import type { DevVerifyTarget, GateRun } from "./run-gate.ts";
import { BUILD_TIMEOUT_SECONDS, writeCapture } from "./capture.ts";

const DIR = "/workspace/workbench/demo/capture-F2";
const BUILD = "dotnet build Demo.sln -c Release";
const BUILD_LOG = "/workspace/workbench/demo/logs/F2-build.txt";

function pack(yaml: string): RepoPack {
  const r = parseRepoPack(yaml);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

const PACK = pack(`layout:\n  domain: src\n  tests: tests\ncommands:\n  build: ${BUILD}\ntests:\n  rule_trait: BR\n`);
const SHEET = "# DEMO-PLAN-F2 — Lines\n| Applied rules | DDD-01 |\n## TDD sequence\n| # | Test |\n|---|---|\n" +
  "| 1 | `Adds_a_line` BR-01 |\nTDD: RED [x] GREEN [x] COST [x]\n";

function target(over: Partial<DevVerifyTarget> = {}): DevVerifyTarget {
  return {
    batch: "F2", code: "demo", prefix: "DEMO", workShown: "workbench", planDirShown: "workbench/demo",
    sheetShown: "workbench/demo/DEMO-PLAN-F2.md", pack: PACK, packShown: ".orkeon/repo.yaml", ...over,
  };
}

function gate(changedFiles: string[], untrackedFiles: string[] = []): GateRun {
  return {
    report: { green: true, lines: [], checks: [], missingDesignIds: [], outside: [], untested: [], stray: [] },
    sheet: SHEET, facts: sheetFacts(SHEET),
    roots: ["src", "tests"], excludes: [],
    changedFiles, untrackedFiles,
    trait: traitMarker("BR", undefined), traitHits: ['tests/LineTests.cs:7:[Trait("BR", "BR-01")]'],
  };
}

const CHANGED = ["src/Order.cs", "tests/LineTests.cs", "workbench/demo/DEMO-PLAN-F2.md"];

function fakes() {
  const files = new FakeFiles();
  files.files.set("/workspace/src/Order.cs", "public class Order {}\n");
  files.files.set("/workspace/tests/LineTests.cs", "public class LineTests { void Adds_a_line() {} }\n");
  files.files.set(BUILD_LOG, "Build succeeded.\nexit=0\n");
  const shell = new FakeShell();
  shell.results[gitDiffTracked("src/Order.cs") as string] = { stdout: "+public class Order {}\n" };
  shell.results[gitMethodGrep(["Adds_a_line"], ["tests"], []) as string] = { stdout: "tests/LineTests.cs:1:Adds_a_line\n" };
  return { files, shell };
}

function written(files: FakeFiles, name: string): string {
  return files.files.get(`${DIR}/${name}`) ?? "(absent)";
}

describe("writeCapture", () => {
  it("writes every section under the capture folder, the index first in the list and table.md last", async () => {
    const { files, shell } = fakes();
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED, ["tests/LineTests.cs"]), "2026-10-22 14:05");
    strictEqual(capture.folder, DIR);
    strictEqual(capture.folderShown, "workbench/demo/capture-F2");
    deepStrictEqual(capture.files.map((p) => p.slice(DIR.length + 1)), [
      "index.txt", "manifest.txt", "status.txt", "changed-files.txt", "diff-001.txt", "diff-002.txt", "build.txt",
      "cost.txt", "traits.txt", "test-tail.txt", "test-classes.txt", "table.md",
    ]);
    for (const w of files.writes) ok(w.path.startsWith(`${DIR}/`));
    ok(shell.commands.includes(gitStatusShort([])));
    ok(shell.commands.includes(gitDiffUntracked("tests/LineTests.cs") as string));
    strictEqual(written(files, "diff-001.txt"), "# diff src/Order.cs (1 lines)\n+public class Order {}\n");
    ok(written(files, "changed-files.txt").startsWith("src/Order.cs → diff-001.txt (1 lines)\n"));
    const index = written(files, "index.txt").split("\n");
    deepStrictEqual(index.slice(0, 5), [
      "# Audit capture — batch F2", "sheet: workbench/demo/DEMO-PLAN-F2.md", "generated: 2026-10-22 14:05", "gate: green", "files:",
    ]);
    strictEqual(index[index.length - 2], `- table.md (${capture.table.length} chars)`);
    strictEqual(written(files, "traits.txt"),
      'marker: [Trait("BR", "<id>")]\nids of the sheet: BR-01\ntests/LineTests.cs:7 [Trait("BR", "BR-01")]\n');
    strictEqual(written(files, "test-classes.txt"),
      "src/Order.cs -> tests naming Order: none\ntests/LineTests.cs: LineTests\n");
    ok(shell.commands.includes(gitTestFilesNaming("Order", ["tests"], "cs", []) as string));
    strictEqual(capture.rows[2].result, "ok");
    deepStrictEqual(capture.testRoots, ["tests"]);
  });

  it("reuses a green log no changed file is newer than: no build call", async () => {
    const { files, shell } = fakes();
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    ok(shell.commands.includes(findNewer(["src/Order.cs", "tests/LineTests.cs"], "workbench/demo/logs/F2-build.txt") as string));
    strictEqual(shell.commands.includes(BUILD), false);
    deepStrictEqual(capture.build, { state: "reused", log: "workbench/demo/logs/F2-build.txt" });
    strictEqual(written(files, "build.txt"), `command: ${BUILD}\nexit: 0 (reused workbench/demo/logs/F2-build.txt: ends green, no changed file newer — one build per batch)\n`);
    strictEqual(capture.rows[0].evidence, "`exit: 0` (reused F2-build.txt)");
  });

  it("builds again when the log holds an error, with the build timeout", async () => {
    const { files, shell } = fakes();
    files.files.set(BUILD_LOG, "a.cs(1,1): error CS1002: ; expected\n");
    shell.results[BUILD] = { exitCode: 1, stdout: "Restoring\nsrc/Order.cs(3,9): error CS0103: unknown name\n" };
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    deepStrictEqual(shell.calls.find((c) => c.command === BUILD), { command: BUILD, options: { timeoutSeconds: BUILD_TIMEOUT_SECONDS } });
    strictEqual(BUILD_TIMEOUT_SECONDS, 900);
    strictEqual(written(files, "build.txt"),
      `log not reused (the log holds an error): built again\ncommand: ${BUILD}\nexit: 1\nsrc/Order.cs(3,9): error CS0103: unknown name\n`);
    deepStrictEqual([capture.rows[0].result, capture.rows[0].evidence], ["gap", "`exit: 1` — src/Order.cs(3,9): error CS0103: unknown name"]);
  });

  it("says when a changed file is newer than the log", async () => {
    const { files, shell } = fakes();
    shell.results[findNewer(["src/Order.cs", "tests/LineTests.cs"], "workbench/demo/logs/F2-build.txt") as string] = { stdout: "src/Order.cs\n" };
    await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    ok(written(files, "build.txt").startsWith("log not reused (changed after it: src/Order.cs): built again\n"));
  });

  it("marks a timed-out build not checked", async () => {
    const { files, shell } = fakes();
    files.files.delete(BUILD_LOG);
    shell.results[BUILD] = { timedOut: true, exitCode: -1 };
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    ok(written(files, "build.txt").includes("exit: none — timed out after 900 s\n"));
    ok(written(files, "build.txt").startsWith("log not reused (log missing or empty: workbench/demo/logs/F2-build.txt)"));
    deepStrictEqual([capture.rows[0].result, capture.rows[0].evidence], ["not checked", "timed out after 900 s"]);
  });

  it("turns a refused build into the refused state", async () => {
    const { files, shell } = fakes();
    files.files.delete(BUILD_LOG);
    shell.errors[BUILD] = new Error("command not allowed\nmore");
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    deepStrictEqual(capture.build, { state: "refused", message: "command not allowed" });
    ok(written(files, "build.txt").endsWith("not run — the shell refused it: command not allowed\n"));
  });

  it("says when there is no test log, and reads one when there is", async () => {
    const { files, shell } = fakes();
    await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    strictEqual(written(files, "test-tail.txt"),
      "no test log: neither workbench/demo/logs/F2-test-affected.txt nor workbench/demo/logs/F2-test.txt\n");
    files.files.set("/workspace/workbench/demo/logs/F2-test.txt", "run\nℹ pass 4\nℹ fail 0\n");
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    strictEqual(written(files, "test-tail.txt"), "file: workbench/demo/logs/F2-test.txt\nrun\nℹ pass 4\nℹ fail 0\n");
    deepStrictEqual([capture.rows[3].result, capture.rows[3].evidence], ["ok", "passed 4, failed 0, no `exit=` line — F2-test.txt"]);
  });

  it("splits a 40 000-character diff in two files", async () => {
    const { files, shell } = fakes();
    shell.results[gitDiffTracked("src/Order.cs") as string] = { stdout: `${"+x".repeat(9)}\n`.repeat(2_000) + "y".repeat(20_000) };
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    ok(capture.files.includes(`${DIR}/diff-001.txt`));
    ok(capture.files.includes(`${DIR}/diff-001-2.txt`));
    for (const w of files.writes) ok(w.content.length <= MAX_SECTION_CHARS, `${w.path} is ${w.content.length}`);
  });

  it("captures 40 diffs out of 41 changed files", async () => {
    const { files, shell } = fakes();
    const many = Array.from({ length: 41 }, (_, i) => `src/F${String(i).padStart(2, "0")}.cs`);
    const capture = await writeCapture({ files, shell }, target(), gate(many), "w");
    strictEqual(capture.files.filter((p) => /\/diff-\d{3}\.txt$/.test(p)).length, 40);
    ok(written(files, "changed-files.txt").includes("src/F40.cs → no diff captured (beyond the first 40 files)\n"));
  });

  it("flags a diff the runtime may have cut", async () => {
    const { files, shell } = fakes();
    shell.results[gitDiffTracked("src/Order.cs") as string] = { stdout: "d".repeat(4_000) };
    await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    ok(written(files, "changed-files.txt").startsWith("src/Order.cs → diff-001.txt (1 lines) (possibly cut by the runtime)\n"));
  });

  it("writes a failed section as not captured, and the row that depends on it not checked", async () => {
    const { files, shell } = fakes();
    shell.errors[gitStatusShort([])] = new Error("refused");
    shell.errors[gitMethodGrep(["Adds_a_line"], ["tests"], []) as string] = new Error("grep refused");
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");
    strictEqual(written(files, "status.txt"), `not captured: '${gitStatusShort([])}' failed (refused)\n`);
    deepStrictEqual([capture.rows[2].result, capture.rows[2].evidence],
      ["not checked", `not captured: '${gitMethodGrep(["Adds_a_line"], ["tests"], [])}' failed (grep refused)`]);
  });

  it("diffs no file under the plan folder: the capture, the verdict and the logs live there", async () => {
    const { files, shell } = fakes();
    const changed = ["src/Order.cs", "workbench/demo/capture-F2/diff-001.txt", "workbench/demo/DEMO-VERDICT-F2.md", "workbench/demo/logs/F2-build.txt"];
    await writeCapture({ files, shell }, target(), gate(changed, changed.slice(1)), "w");
    strictEqual(written(files, "changed-files.txt"), "src/Order.cs → diff-001.txt (1 lines)\n");
    ok(!shell.commands.some((c) => c.startsWith("git diff") && c.includes("workbench/demo/")));
  });

  it("names only this run's files in the manifest and the list handed to the brief", async () => {
    const { files, shell } = fakes();
    shell.results[gitDiffTracked("tests/LineTests.cs") as string] = { stdout: "+x\n" };
    await writeCapture({ files, shell }, target(), gate(["src/Order.cs", "tests/LineTests.cs"]), "first");
    ok(files.files.has(`${DIR}/diff-002.txt`));
    const second = await writeCapture({ files, shell }, target(), gate(["src/Order.cs"]), "second");
    ok(files.files.has(`${DIR}/diff-002.txt`), "the earlier run's file stays on disk");
    ok(!second.files.includes(`${DIR}/diff-002.txt`));
    const manifest = written(files, "manifest.txt").trimEnd().split("\n");
    deepStrictEqual(manifest, second.files.map((p) => p.slice(DIR.length + 1)));
    ok(!manifest.includes("diff-002.txt"));
  });

  it("keeps the test-classes lines collected before a failed git grep", async () => {
    const { files, shell } = fakes();
    files.files.set("/workspace/src/Line.cs", "public class Line {}\n");
    const failing = gitTestFilesNaming("Order", ["tests"], "cs", []) as string;
    shell.errors[failing] = new Error("grep refused");
    await writeCapture({ files, shell }, target(), gate(["src/Line.cs", "src/Order.cs"]), "w");
    strictEqual(written(files, "test-classes.txt"),
      `src/Line.cs -> tests naming Line: none\nnot captured: '${failing}' failed (grep refused)\n`);
  });

  it("marks the methods row not checked when no method name can be quoted", async () => {
    const { files, shell } = fakes();
    const run = { ...gate(CHANGED), facts: { ...sheetFacts(SHEET), methods: ["it's"] } };
    const capture = await writeCapture({ files, shell }, target(), run, "w");
    const row = capture.rows.find((r) => r.evidence === "not captured: unquotable scope");
    strictEqual(row?.result, "not checked");
  });

  it("lets a failed write propagate", async () => {
    const { files, shell } = fakes();
    files.write = async () => { throw new Error("read-only"); };
    await writeCapture({ files, shell }, target(), gate(CHANGED), "w").then(
      () => { throw new Error("expected a throw"); },
      (error: Error) => strictEqual(error.message, "read-only"),
    );
  });
});
