// The pack's commands, the scripted shell and the files run_tests and run_build are tested with.
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import type { RepoPackCommands } from "../../domain/dev/repo-pack.ts";
import type { PermissionRule } from "../../domain/agent-policy/permission.ts";
import { createWrappedTools } from "./wrapped-tools.ts";
import { WORKSPACE } from "../../domain/vfs.ts";

export const COMMANDS: RepoPackCommands = {
  restore: "dotnet restore Orkeon.sln",
  build: "dotnet build Orkeon.sln --no-restore",
  buildTest: "dotnet build <test project> --no-restore",
  testClass: 'dotnet test <test project> --no-build --filter "FullyQualifiedName~<Class>"',
  testIntegration: 'dotnet test Orkeon.sln --no-build --filter "Category=Integration"',
};
export const LOGS = `${WORKSPACE}/todo/demo/logs`;
export const CLASS_RUN = 'dotnet test tests/A.Tests --no-build --filter "FullyQualifiedName~LineTests"';
/** What a build prints on a tree never restored. */
export const COLD = "error NETSDK1004: Assets file 'obj/project.assets.json' not found.";

/** The wrapped tools over a fresh shell and files, with the step's `rules`. */
export function setup(rules: PermissionRule[] = []) {
  const shell = new FakeShell();
  const files = new FakeFiles();
  return { shell, files, tools: createWrappedTools({ shell, files }, { commands: COMMANDS, rules, logFolder: LOGS }) };
}

/** Makes `build` fail on a cold tree the first time it runs on `shell`, then succeed. */
export function coldOnce(shell: FakeShell, build: string): void {
  let builds = 0;
  const run = shell.run.bind(shell);
  shell.run = async (command, options) => {
    const result = await run(command, options);
    if (command !== build) return result;
    builds += 1;
    return builds === 1 ? { ...result, exitCode: 1, stdout: COLD } : { ...result, exitCode: 0, stdout: "Build succeeded." };
  };
}

/** Makes `build` fail on a cold tree every time it runs on `shell`. */
export function alwaysCold(shell: FakeShell, build: string): void {
  const run = shell.run.bind(shell);
  shell.run = async (command, options) => {
    const result = await run(command, options);
    return command === build ? { ...result, exitCode: 1, stdout: COLD } : result;
  };
}

export const RED_CLASS_RUN = {
  ok: true, command: CLASS_RUN, exit: 1, timedOut: false, failed: ["Tests.LineTests.Empty"],
  tail: "  Failed Tests.LineTests.Empty [3 ms]\nFailed!  - Failed: 1, Passed: 3", log: `${LOGS}/run_tests-1.log`,
};

/** Calls of run_tests it refuses: a whole suite, the integration command, a command of its own, no command. */
export const REFUSED_RUNS: ReadonlyArray<{ name: string; input: { command?: string } }> = [
  { name: "a whole suite", input: { command: "dotnet test Orkeon.sln" } },
  { name: "the integration suite", input: { command: 'dotnet test Orkeon.sln --no-build --filter "Category=Integration"' } },
  { name: "a command of its own", input: { command: `${CLASS_RUN} && rm x` } },
  { name: "a missing command", input: {} },
];
