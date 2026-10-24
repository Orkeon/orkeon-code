// The build run_build may run, and the one case it restores: pure. The pack's commands carry the
// restore rule themselves (`build: … --no-restore`, `build_test: … --no-restore`; repo.yaml): the
// tool runs them as written, never a restore of its own, but once, when a red build says the tree
// was never restored (a cold checkout or worktree), where the flag cannot succeed.
import type { RepoPackCommands } from "./repo-pack.ts";
import { PLACEHOLDER, plainWords, valueProblem } from "./test-commands.ts";

export type BuildCommand = { ok: true; command: string; key: "commands.build" | "commands.build_test" } | { ok: false; reason: string };

/** `commands.build` without a project; `commands.build_test` with its one placeholder filled by `project`. */
export function buildCommandFor(commands: RepoPackCommands, project?: string): BuildCommand {
  if (project === undefined) {
    const build = commands.build?.trim();
    return build ? { ok: true, command: build, key: "commands.build" } : { ok: false, reason: "the pack has no commands.build" };
  }
  const template = commands.buildTest?.trim();
  if (!template) return { ok: false, reason: "the pack has no commands.build_test to build one project" };
  const holes = template.match(PLACEHOLDER) ?? [];
  if (holes.length !== 1) {
    return { ok: false, reason: `commands.build_test has ${holes.length} placeholders, not one: '${template}'` };
  }
  const problem = valueProblem(project);
  if (problem !== null) return { ok: false, reason: problem };
  const command = template.replace(PLACEHOLDER, project);
  return plainWords(command)
    ? { ok: true, command, key: "commands.build_test" }
    : { ok: false, reason: "a shell operator outside double quotes" };
}

/** Whether `command` is the pack's restore, or a restore by its verb (`dotnet restore`, `npm ci`, `npm install`). */
export function isRestore(command: string, commands: RepoPackCommands): boolean {
  const c = command.trim();
  const restore = commands.restore?.trim();
  if (restore && c === restore) return true;
  return /(^|\s)(dotnet\s+restore|npm\s+(ci|install)|pnpm\s+install|yarn\s+install)(\s|$)/.test(c);
}

/** What a red build prints when its project was never restored: .NET's NETSDK1004 and its assets file. */
const COLD_TREE = [/NETSDK1004/, /project\.assets\.json'? not found/i, /run a NuGet package restore/i];

/** Whether a red build's output says the tree was never restored. */
export function coldTree(output: string): boolean {
  return COLD_TREE.some((pattern) => pattern.test(output));
}
