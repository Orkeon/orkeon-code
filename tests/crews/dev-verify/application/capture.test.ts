// Unit tests for writeCapture over FakeFiles and FakeShell. Run:
//   node --test tests/crews/dev-verify/application/capture.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";

import { sheetFacts } from "../../../../src/crews/dev-verify/domain/sheet-facts.ts";
import {
  findNewer, gitDiffTracked, gitDiffUntracked, gitMethodGrep, gitStatusShort, gitTestFilesNaming,
} from "../../../../src/crews/dev-verify/domain/commands.ts";
import { MAX_SECTION_CHARS } from "../../../../src/crews/dev-verify/domain/capture-sections.ts";
import { BUILD_TIMEOUT_SECONDS, writeCapture } from "../../../../src/crews/dev-verify/application/capture.ts";
import {
  BUILD, BUILD_LOG, CHANGED, CUT_NOTICE, DIFF_ADDING_LINE_4, DIFF_OF_40_000, DIR, FORTY_ONE_FILES, INDEX_HEAD,
  PLAN_FOLDER_CHANGES, SECTION_FILES, SHEET, costIndexOf, fakes, gate, saveInALoop, target, written,
} from "./capture.fixtures.ts";
import { assertRan, assertWritesUnder, assertWritesWithin } from "./capture.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("writeCapture", () => {
  it("writes every section under the capture folder, the index first in the list and table.md last", async () => {
    // Arrange
    const { files, shell } = fakes();

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED, ["tests/LineTests.cs"]), "2026-10-22 14:05");

    // Assert
    strictEqual(capture.folder, DIR);
    strictEqual(capture.folderShown, "workbench/demo/capture-F2");
    deepStrictEqual(capture.files.map((p) => p.slice(DIR.length + 1)), [...SECTION_FILES]);
    // Each section file's text goes to the brief, in the order written; the table is in the brief already.
    deepStrictEqual(capture.texts.map((t) => t.path), capture.files.slice(2, -1));
    strictEqual(capture.texts[2].text, written(files, "diff-001.txt"));
    assertWritesUnder(files, DIR);
    assertRan(shell, [
      gitStatusShort([]), gitDiffUntracked("tests/LineTests.cs") as string, gitTestFilesNaming("Order", ["tests"], "cs", []) as string,
    ]);
    strictEqual(written(files, "diff-001.txt"), "# diff src/Order.cs (1 lines)\n+public class Order {}\n");
    ok(written(files, "changed-files.txt").startsWith("src/Order.cs → diff-001.txt (1 lines)\n"));
    const index = written(files, "index.txt").split("\n");
    deepStrictEqual(index.slice(0, 5), [...INDEX_HEAD]);
    strictEqual(index[index.length - 2], `- table.md (${capture.table.length} chars)`);
    strictEqual(written(files, "traits.txt"),
      'marker: [Trait("BR", "<id>")]\nids of the sheet: BR-01\ntests/LineTests.cs:7 [Trait("BR", "BR-01")]\n');
    strictEqual(written(files, "test-classes.txt"),
      "src/Order.cs -> tests naming Order: none\ntests/LineTests.cs: LineTests\n");
    strictEqual(capture.rows[2].result, "ok");
    deepStrictEqual(capture.testRoots, ["tests"]);
  });

  it("reuses a green log no changed file is newer than: no build call", async () => {
    // Arrange
    const { files, shell } = fakes();

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    assertRan(shell, [findNewer(["src/Order.cs", "tests/LineTests.cs"], "workbench/demo/logs/F2-build.txt") as string]);
    strictEqual(shell.commands.includes(BUILD), false);
    deepStrictEqual(capture.build, { state: "reused", log: "workbench/demo/logs/F2-build.txt" });
    strictEqual(written(files, "build.txt"), `command: ${BUILD}\nexit: 0 (reused workbench/demo/logs/F2-build.txt: ends green, no changed file newer — one build per batch)\n`);
    strictEqual(capture.rows[0].evidence, "`exit: 0` (reused F2-build.txt)");
  });

  it("builds again when the log holds an error, with the build timeout", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.files.set(BUILD_LOG, "a.cs(1,1): error CS1002: ; expected\n");
    shell.results[BUILD] = { exitCode: 1, stdout: "Restoring\nsrc/Order.cs(3,9): error CS0103: unknown name\n" };

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    deepStrictEqual(shell.calls.find((c) => c.command === BUILD), { command: BUILD, options: { timeoutSeconds: BUILD_TIMEOUT_SECONDS } });
    strictEqual(BUILD_TIMEOUT_SECONDS, 900);
    strictEqual(written(files, "build.txt"),
      `log not reused (the log holds an error): built again\ncommand: ${BUILD}\nexit: 1\nsrc/Order.cs(3,9): error CS0103: unknown name\n`);
    deepStrictEqual([capture.rows[0].result, capture.rows[0].evidence], ["gap", "`exit: 1` — src/Order.cs(3,9): error CS0103: unknown name"]);
  });

  it("says when a changed file is newer than the log", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results[findNewer(["src/Order.cs", "tests/LineTests.cs"], "workbench/demo/logs/F2-build.txt") as string] = { stdout: "src/Order.cs\n" };

    // Act
    await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    ok(written(files, "build.txt").startsWith("log not reused (changed after it: src/Order.cs): built again\n"));
  });

  it("marks a timed-out build not checked", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.files.delete(BUILD_LOG);
    shell.results[BUILD] = { timedOut: true, exitCode: -1 };

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    ok(written(files, "build.txt").includes("exit: none — timed out after 900 s\n"));
    ok(written(files, "build.txt").startsWith("log not reused (log missing or empty: workbench/demo/logs/F2-build.txt)"));
    deepStrictEqual([capture.rows[0].result, capture.rows[0].evidence], ["not checked", "timed out after 900 s"]);
  });

  it("turns a refused build into the refused state", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.files.delete(BUILD_LOG);
    shell.errors[BUILD] = new Error("command not allowed\nmore");

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    deepStrictEqual(capture.build, { state: "refused", message: "command not allowed" });
    ok(written(files, "build.txt").endsWith("not run — the shell refused it: command not allowed\n"));
  });

  it("says when there is no test log", async () => {
    // Arrange
    const { files, shell } = fakes();

    // Act
    await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    strictEqual(written(files, "test-tail.txt"),
      "no test log: neither workbench/demo/logs/F2-test-affected.txt nor workbench/demo/logs/F2-test.txt\n");
  });

  it("reads the test log when there is one", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.files.set(`${WORKSPACE}/workbench/demo/logs/F2-test.txt`, "run\nℹ pass 4\nℹ fail 0\n");

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    strictEqual(written(files, "test-tail.txt"), "file: workbench/demo/logs/F2-test.txt\nrun\nℹ pass 4\nℹ fail 0\n");
    deepStrictEqual([capture.rows[3].result, capture.rows[3].evidence], ["ok", "passed 4, failed 0, no `exit=` line — F2-test.txt"]);
  });

  it("splits a 40 000-character diff in two files", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results[gitDiffTracked("src/Order.cs") as string] = { stdout: DIFF_OF_40_000 };

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    ok(capture.files.includes(`${DIR}/diff-001.txt`));
    ok(capture.files.includes(`${DIR}/diff-001-2.txt`));
    assertWritesWithin(files, MAX_SECTION_CHARS);
  });

  it("captures 40 diffs out of 41 changed files", async () => {
    // Arrange
    const { files, shell } = fakes();

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(FORTY_ONE_FILES), "w");

    // Assert
    strictEqual(capture.files.filter((p) => /\/diff-\d{3}\.txt$/.test(p)).length, 40);
    ok(written(files, "changed-files.txt").includes("src/F40.cs → no diff captured (beyond the first 40 files)\n"));
  });

  it("flags a diff the runtime cut, and keeps the diff without its notice", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results[gitDiffTracked("src/Order.cs") as string] = { stdout: `+a\n+b${CUT_NOTICE}` };

    // Act
    await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    ok(written(files, "changed-files.txt").startsWith("src/Order.cs → diff-001.txt (2 lines) (cut by the runtime, 1234 characters omitted)\n"));
    strictEqual(written(files, "diff-001.txt"), "# diff src/Order.cs (2 lines)\n+a\n+b");
  });

  it("does not flag a long diff that carries no notice", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results[gitDiffTracked("src/Order.cs") as string] = { stdout: "d".repeat(10_000) };

    // Act
    await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    ok(written(files, "changed-files.txt").startsWith("src/Order.cs → diff-001.txt (1 lines)\n"));
  });

  it("writes a failed section as not captured, and the row that depends on it not checked", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.errors[gitStatusShort([])] = new Error("refused");
    shell.errors[gitMethodGrep(["Adds_a_line"], ["tests"], []) as string] = new Error("grep refused");

    // Act
    const capture = await writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    strictEqual(written(files, "status.txt"), `not captured: '${gitStatusShort([])}' failed (refused)\n`);
    deepStrictEqual([capture.rows[2].result, capture.rows[2].evidence],
      ["not checked", `not captured: '${gitMethodGrep(["Adds_a_line"], ["tests"], [])}' failed (grep refused)`]);
  });

  it("diffs no file under the plan folder: the capture, the verdict and the logs live there", async () => {
    // Arrange
    const { files, shell } = fakes();
    const changed = PLAN_FOLDER_CHANGES;

    // Act
    await writeCapture({ files, shell }, target(), gate(changed, changed.slice(1)), "w");

    // Assert
    strictEqual(written(files, "changed-files.txt"), "src/Order.cs → diff-001.txt (1 lines)\n");
    ok(!shell.commands.some((c) => c.startsWith("git diff") && c.includes("workbench/demo/")));
  });

  it("names only this run's files in the manifest and the list handed to the brief", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results[gitDiffTracked("tests/LineTests.cs") as string] = { stdout: "+x\n" };
    await writeCapture({ files, shell }, target(), gate(["src/Order.cs", "tests/LineTests.cs"]), "first");
    const firstWroteDiff2 = files.files.has(`${DIR}/diff-002.txt`);

    // Act
    const second = await writeCapture({ files, shell }, target(), gate(["src/Order.cs"]), "second");

    // Assert
    ok(firstWroteDiff2);
    ok(files.files.has(`${DIR}/diff-002.txt`), "the earlier run's file stays on disk");
    ok(!second.files.includes(`${DIR}/diff-002.txt`));
    const manifest = written(files, "manifest.txt").trimEnd().split("\n");
    deepStrictEqual(manifest, second.files.map((p) => p.slice(DIR.length + 1)));
    ok(!manifest.includes("diff-002.txt"));
  });

  it("keeps the test-classes lines collected before a failed git grep", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.files.set(`${WORKSPACE}/src/Line.cs`, "public class Line {}\n");
    const failing = gitTestFilesNaming("Order", ["tests"], "cs", []) as string;
    shell.errors[failing] = new Error("grep refused");

    // Act
    await writeCapture({ files, shell }, target(), gate(["src/Line.cs", "src/Order.cs"]), "w");

    // Assert
    strictEqual(written(files, "test-classes.txt"),
      `src/Line.cs -> tests naming Line: none\nnot captured: '${failing}' failed (grep refused)\n`);
  });

  it("lists the changed JavaScript files of a batch, not 'no changed source file'", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.files.set(`${WORKSPACE}/src/math.js`, "export const subtract = (a, b) => a - b;\n");
    files.files.set(`${WORKSPACE}/tests/math.test.js`, "describe(\"math\", () => {});\n");

    // Act
    await writeCapture({ files, shell }, target(), gate(["src/math.js", "tests/math.test.js"], ["tests/math.test.js"]), "w");

    // Assert
    assertRan(shell, [gitTestFilesNaming("math", ["tests"], "js", []) as string]);
    strictEqual(written(files, "test-classes.txt"), "src/math.js -> tests naming math: none\ntests/math.test.js: math\n");
  });

  it("marks the methods row not checked when no method name can be quoted", async () => {
    // Arrange
    const { files, shell } = fakes();
    const run = { ...gate(CHANGED), facts: { ...sheetFacts(SHEET), methods: ["it's"] } };

    // Act
    const capture = await writeCapture({ files, shell }, target(), run, "w");

    // Assert
    const row = capture.rows.find((r) => r.evidence === "not captured: unquotable scope");
    strictEqual(row?.result, "not checked");
  });

  it("lets a failed write propagate", async () => {
    // Arrange
    const { files, shell } = fakes();
    files.write = async () => { throw new Error("read-only"); };

    // Act
    const act = writeCapture({ files, shell }, target(), gate(CHANGED), "w");

    // Assert
    await rejects(act, { message: "read-only" });
  });

  it("blocks the cost only on a line the captured diff adds, and counts a file without a captured diff as added", async () => {
    // Arrange
    const { files, shell } = fakes();
    shell.results[gitDiffTracked("src/Order.cs") as string] = { stdout: DIFF_ADDING_LINE_4 };
    shell.errors[gitDiffTracked("src/Line.cs") as string] = new Error("refused");
    const costIndex = costIndexOf([
      saveInALoop(`${WORKSPACE}/src/Order.cs::Order::Place`, 4), saveInALoop(`${WORKSPACE}/src/Order.cs::Order::Old`, 9),
      saveInALoop(`${WORKSPACE}/src/Line.cs::Line::Add`, 2),
    ], 3);

    // Act
    const capture = await writeCapture({ files, shell, costIndex }, target(), gate(["src/Order.cs", "src/Line.cs"]), "w");

    // Assert
    deepStrictEqual(capture.cost.state === "measured" && capture.cost.flagged, [
      "src/Order.cs::Order::Place L4 _repository.Save in a loop",
      "src/Line.cs::Line::Add L2 _repository.Save in a loop",
    ]);
    ok(written(files, "cost.txt").includes("Ports in a loop (1): _repository.Save L9 (pre-existing)"), written(files, "cost.txt"));
    ok(written(files, "table.md").includes("| Cost | capture `cost` | gap | `exit: 2` src/Order.cs::Order::Place L4"));
  });

  it("counts a captured diff without a hunk as unknown lines, so its blocking call is flagged", async () => {
    // Arrange
    const { files, shell } = fakes();
    const costIndex = costIndexOf([saveInALoop(`${WORKSPACE}/src/Order.cs::Order::Place`, 9)], 1);

    // Act
    const capture = await writeCapture({ files, shell, costIndex }, target(), gate(CHANGED), "w");

    // Assert
    strictEqual(capture.cost.state === "measured" && capture.cost.exit, 2);
  });
});
