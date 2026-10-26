// run_tests and run_build over FakeShell and FakeFiles: the pack's commands only, the
// integration rule, no restore but the one of a cold tree, the step's rules, the log. Run:
//   node --test tests/shared/application/dev/wrapped-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeShell } from "../../../support/doubles/fake-shell.ts";
import { createWrappedTools } from "../../../../src/shared/application/dev/wrapped-tools.ts";
import {
  alwaysCold, CLASS_RUN, COLD, coldOnce, COMMANDS, LOGS, RED_CLASS_RUN, REFUSED_RUNS, setup,
} from "./wrapped-tools.fixtures.ts";

describe("run_tests", () => {
  it("runs one of the pack's narrow commands with 600 s and hands back the failed tests, the tail and the log", async () => {
    // Arrange
    const f = setup();
    f.shell.results[CLASS_RUN] = { exitCode: 1, stdout: "  Failed Tests.LineTests.Empty [3 ms]\nFailed!  - Failed: 1, Passed: 3\n" };

    // Act
    const out = await f.tools.runTests({ command: CLASS_RUN });

    // Assert
    deepStrictEqual(out, RED_CLASS_RUN);
    deepStrictEqual(f.shell.calls, [{ command: CLASS_RUN, options: { timeoutSeconds: 600 } }]);
    const log = f.files.files.get(`${LOGS}/run_tests-1.log`);
    ok(log?.startsWith(`$ ${CLASS_RUN}\nexit 1\n`), log);
  });

  it("names its log after the batch when given one: two batches of a wave never share a log name", async () => {
    // Arrange
    const shell = new FakeShell();
    const files = new FakeFiles();
    shell.results[CLASS_RUN] = { exitCode: 0, stdout: "ok\n" };
    const tools = createWrappedTools({ shell, files }, { commands: COMMANDS, rules: [], logFolder: LOGS, batch: "F2" });

    // Act
    const out = await tools.runTests({ command: CLASS_RUN });

    // Assert
    strictEqual((out as { log?: string }).log, `${LOGS}/F2-run_tests-1.log`);
    ok(files.files.has(`${LOGS}/F2-run_tests-1.log`), [...files.files.keys()].join("\n"));
  });

  for (const c of REFUSED_RUNS) {
    it(`refuses ${c.name}, running nothing`, async () => {
      // Arrange
      const f = setup();

      // Act
      const out = await f.tools.runTests(c.input);

      // Assert
      strictEqual(out.ok, false);
      deepStrictEqual(f.shell.commands, []);
    });
  }

  it("refuses a command the step's rules deny, and says so", async () => {
    // Arrange
    const f = setup([{ effect: "deny", tool: "shell_command", argument: "command", pattern: "dotnet test tests/A.Tests*" }]);

    // Act
    const out = await f.tools.runTests({ command: CLASS_RUN });

    // Assert
    deepStrictEqual(out, { ok: false, refused: `the rules of this step deny the shell command '${CLASS_RUN}'` });
    deepStrictEqual(f.shell.commands, []);
  });

  it("turns a command the runtime refuses into a refusal, never a throw", async () => {
    // Arrange
    const f = setup();
    f.shell.errors[CLASS_RUN] = new Error("command not allowed: dotnet\nmore");

    // Act
    const out = await f.tools.runTests({ command: CLASS_RUN });

    // Assert
    deepStrictEqual(out, { ok: false, refused: "not run: command not allowed: dotnet" });
  });
});

describe("run_build", () => {
  it("builds with the pack's command, never restoring on a warm tree", async () => {
    // Arrange
    const f = setup();
    f.shell.results[COMMANDS.build as string] = { exitCode: 1, stdout: "error CS1002: ; expected\n" };

    // Act
    const out = await f.tools.runBuild({});

    // Assert
    ok(out.ok);
    strictEqual(out.ok && out.restored, false);
    strictEqual(out.ok && out.exit, 1);
    deepStrictEqual(f.shell.calls, [{ command: COMMANDS.build, options: { timeoutSeconds: 900 } }]);
  });

  it("restores once and builds again when a red build says the tree was never restored", async () => {
    // Arrange
    const f = setup();
    const build = "dotnet build tests/A.Tests --no-restore";
    coldOnce(f.shell, build);

    // Act
    const out = await f.tools.runBuild({ project: "tests/A.Tests" });

    // Assert
    deepStrictEqual(f.shell.commands, [build, COMMANDS.restore, build]);
    ok(out.ok);
    strictEqual(out.ok && out.restored, true);
    strictEqual(out.ok && out.exit, 0);
    strictEqual(out.ok && out.tail, "Build succeeded.");
    const log = f.files.files.get(`${LOGS}/run_build-1.log`) ?? "";
    ok(log.includes(`$ ${COMMANDS.restore}`) && log.includes("NETSDK1004"), log);
  });

  it("never restores when the step restored the tree itself", async () => {
    // Arrange
    const shell = new FakeShell();
    const tools = createWrappedTools({ shell, files: new FakeFiles() }, { commands: COMMANDS, rules: [], logFolder: LOGS, restored: true });
    shell.results[COMMANDS.build as string] = { exitCode: 1, stdout: COLD };

    // Act
    const out = await tools.runBuild({});

    // Assert
    strictEqual(out.ok && out.restored, false);
    deepStrictEqual(shell.commands, [COMMANDS.build]);
  });

  it("restores at most once for the step, even when the tree stays cold", async () => {
    // Arrange
    const f = setup();
    const build = "dotnet build Orkeon.sln --no-restore";
    alwaysCold(f.shell, build);
    await f.tools.runBuild({});

    // Act
    const second = await f.tools.runBuild({});

    // Assert
    deepStrictEqual(f.shell.commands, [build, COMMANDS.restore, build, build]);
    strictEqual(second.ok && second.restored, false);
  });

  it("does not restore a cold tree when the step's rules deny the restore", async () => {
    // Arrange
    const f = setup([{ effect: "deny", tool: "shell_command", argument: "command", pattern: "dotnet restore*" }]);
    f.shell.results[COMMANDS.build as string] = { exitCode: 1, stdout: COLD };

    // Act
    const out = await f.tools.runBuild({});

    // Assert
    deepStrictEqual(f.shell.commands, [COMMANDS.build]);
    strictEqual(out.ok && out.restored, false);
    const log = f.files.files.get(`${LOGS}/run_build-1.log`) ?? "";
    ok(log.includes("restore not run: the rules of this step deny"), log);
  });

  it("refuses a project that is not a plain relative path", async () => {
    // Arrange
    const f = setup();

    // Act
    const out = await f.tools.runBuild({ project: "../x" });

    // Assert
    strictEqual(out.ok, false);
    deepStrictEqual(f.shell.commands, []);
  });

  it("still answers when the log cannot be written", async () => {
    // Arrange
    const f = setup();
    f.files.write = async () => { throw new Error("read-only mount"); };

    // Act
    const out = await f.tools.runBuild({});

    // Assert
    strictEqual(out.ok && out.log, null);
  });
});
