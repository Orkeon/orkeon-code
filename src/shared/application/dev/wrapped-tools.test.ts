// run_tests and run_build over FakeShell and FakeFiles: the pack's commands only, the
// integration rule, no restore but the one of a cold tree, the step's rules, the log. Run:
//   node --test src/shared/application/dev/wrapped-tools.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import type { RepoPackCommands } from "../../domain/dev/repo-pack.ts";
import type { PermissionRule } from "../../domain/agent-policy/permission.ts";
import { createWrappedTools } from "./wrapped-tools.ts";

const COMMANDS: RepoPackCommands = {
  restore: "dotnet restore Orkeon.sln",
  build: "dotnet build Orkeon.sln --no-restore",
  buildTest: "dotnet build <test project> --no-restore",
  testClass: 'dotnet test <test project> --no-build --filter "FullyQualifiedName~<Class>"',
  testIntegration: 'dotnet test Orkeon.sln --no-build --filter "Category=Integration"',
};
const LOGS = "/workspace/todo/demo/logs";
const CLASS_RUN = 'dotnet test tests/A.Tests --no-build --filter "FullyQualifiedName~LineTests"';
const COLD = "error NETSDK1004: Assets file 'obj/project.assets.json' not found.";

function setup(rules: PermissionRule[] = []) {
  const shell = new FakeShell();
  const files = new FakeFiles();
  return { shell, files, tools: createWrappedTools({ shell, files }, { commands: COMMANDS, rules, logFolder: LOGS }) };
}

describe("run_tests", () => {
  it("runs one of the pack's narrow commands with 600 s and hands back the tail and the log", async () => {
    const f = setup();
    f.shell.results[CLASS_RUN] = { exitCode: 1, stdout: "Failed!  - Failed: 1, Passed: 3\n" };
    const out = await f.tools.runTests({ command: CLASS_RUN });
    deepStrictEqual(out, {
      ok: true, command: CLASS_RUN, exit: 1, timedOut: false, tail: "Failed!  - Failed: 1, Passed: 3", log: `${LOGS}/run_tests-1.log`,
    });
    deepStrictEqual(f.shell.calls, [{ command: CLASS_RUN, options: { timeoutSeconds: 600 } }]);
    ok(f.files.files.get(`${LOGS}/run_tests-1.log`)?.startsWith(`$ ${CLASS_RUN}\nexit 1\n`));
  });

  it("refuses a whole suite, a command of its own and a missing command, running nothing", async () => {
    const f = setup();
    for (const command of ["dotnet test Orkeon.sln", 'dotnet test Orkeon.sln --no-build --filter "Category=Integration"', `${CLASS_RUN} && rm x`]) {
      const out = await f.tools.runTests({ command });
      strictEqual(out.ok, false, command);
    }
    strictEqual((await f.tools.runTests({})).ok, false);
    deepStrictEqual(f.shell.commands, []);
  });

  it("refuses a command the step's rules deny, and says so", async () => {
    const f = setup([{ effect: "deny", tool: "shell_command", argument: "command", pattern: "dotnet test tests/A.Tests*" }]);
    const out = await f.tools.runTests({ command: CLASS_RUN });
    deepStrictEqual(out, { ok: false, refused: `the rules of this step deny the shell command '${CLASS_RUN}'` });
    deepStrictEqual(f.shell.commands, []);
  });

  it("turns a command the runtime refuses into a refusal, never a throw", async () => {
    const f = setup();
    f.shell.errors[CLASS_RUN] = new Error("command not allowed: dotnet\nmore");
    deepStrictEqual(await f.tools.runTests({ command: CLASS_RUN }), { ok: false, refused: "not run: command not allowed: dotnet" });
  });
});

describe("run_build", () => {
  it("builds with the pack's command, never restoring on a warm tree", async () => {
    const f = setup();
    f.shell.results[COMMANDS.build as string] = { exitCode: 1, stdout: "error CS1002: ; expected\n" };
    const out = await f.tools.runBuild({});
    ok(out.ok);
    strictEqual(out.ok && out.restored, false);
    strictEqual(out.ok && out.exit, 1);
    deepStrictEqual(f.shell.calls, [{ command: COMMANDS.build, options: { timeoutSeconds: 900 } }]);
  });

  it("restores once and builds again when a red build says the tree was never restored", async () => {
    const f = setup();
    const build = "dotnet build tests/A.Tests --no-restore";
    let builds = 0;
    const run = f.shell.run.bind(f.shell);
    f.shell.run = async (command, options) => {
      const result = await run(command, options);
      if (command !== build) return result;
      builds += 1;
      return builds === 1 ? { ...result, exitCode: 1, stdout: COLD } : { ...result, exitCode: 0, stdout: "Build succeeded." };
    };
    const out = await f.tools.runBuild({ project: "tests/A.Tests" });
    deepStrictEqual(f.shell.commands, [build, COMMANDS.restore, build]);
    ok(out.ok);
    strictEqual(out.ok && out.restored, true);
    strictEqual(out.ok && out.exit, 0);
    strictEqual(out.ok && out.tail, "Build succeeded.");
    const log = f.files.files.get(`${LOGS}/run_build-1.log`) ?? "";
    ok(log.includes(`$ ${COMMANDS.restore}`) && log.includes("NETSDK1004"), log);
  });

  it("restores at most once for the step, even when the tree stays cold", async () => {
    const f = setup();
    const build = "dotnet build Orkeon.sln --no-restore";
    const run = f.shell.run.bind(f.shell);
    f.shell.run = async (command, options) => {
      const result = await run(command, options);
      return command === build ? { ...result, exitCode: 1, stdout: COLD } : result;
    };
    await f.tools.runBuild({});
    const second = await f.tools.runBuild({});
    deepStrictEqual(f.shell.commands, [build, COMMANDS.restore, build, build]);
    strictEqual(second.ok && second.restored, false);
  });

  it("does not restore a cold tree when the step's rules deny the restore", async () => {
    const f = setup([{ effect: "deny", tool: "shell_command", argument: "command", pattern: "dotnet restore*" }]);
    f.shell.results[COMMANDS.build as string] = { exitCode: 1, stdout: COLD };
    const out = await f.tools.runBuild({});
    deepStrictEqual(f.shell.commands, [COMMANDS.build]);
    strictEqual(out.ok && out.restored, false);
    ok((f.files.files.get(`${LOGS}/run_build-1.log`) ?? "").includes("restore not run: the rules of this step deny"));
  });

  it("refuses a project that is not a plain relative path", async () => {
    const f = setup();
    strictEqual((await f.tools.runBuild({ project: "../x" })).ok, false);
    deepStrictEqual(f.shell.commands, []);
  });

  it("still answers when the log cannot be written", async () => {
    const f = setup();
    f.files.write = async () => { throw new Error("read-only mount"); };
    const out = await f.tools.runBuild({});
    strictEqual(out.ok && out.log, null);
  });
});
