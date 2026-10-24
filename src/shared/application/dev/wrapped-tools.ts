// The bodies of run_tests and run_build, the two tools a writing role of a dev step is offered in
// place of shell_command for its test runs and builds. Each runs one command of the pack, after the
// guard chain (shared/domain/dev/tool-guards.ts): the pack's own command or nothing (the integration
// rule of test-commands.ts, plain values in its placeholders), never a restore, never a command the
// step's rules deny. The whole output goes to a log file; the model gets its tail and the log's path.
// A refusal or a command that cannot run comes back as `{ok: false}`, never thrown: the tool's
// result is what the model reads. The tools themselves are built in
// shared/infrastructure/orkeon/script-tools.ts.
import type { Files, Shell, ShellResult } from "../ports.ts";
import type { PermissionRule } from "../../domain/agent-policy/permission.ts";
import type { RepoPackCommands } from "../../domain/dev/repo-pack.ts";
import { checkValidation } from "../../domain/dev/test-commands.ts";
import { buildCommandFor, coldTree, isRestore } from "../../domain/dev/build-commands.ts";
import { outputTail, runGuards, shellRuleGuard, stringArgument } from "../../domain/dev/tool-guards.ts";
import type { Guard } from "../../domain/dev/tool-guards.ts";

export const RUN_TESTS_TIMEOUT_SECONDS = 600;
export const RUN_BUILD_TIMEOUT_SECONDS = 900;

/** What a run_tests or run_build call hands back to the model. */
export type WrappedRun =
  | {
    ok: true;
    command: string;
    exit: number;
    timedOut: boolean;
    /** run_build only: true when a red build on a cold tree made it restore once and build again. */
    restored?: boolean;
    /** At most 15 lines and 1 500 characters of the last command's output. */
    tail: string;
    /** The whole output, `/workspace/…`; null when it could not be written. */
    log: string | null;
  }
  | { ok: false; refused: string };

/** What the tools are set up with, once the step knows its pack. */
export interface WrappedToolsSetup {
  commands: RepoPackCommands;
  /** The rules the step runs under: a shell command one of them denies is never run. */
  rules: readonly PermissionRule[];
  /** Where the logs go, e.g. `/workspace/todo/<code>/logs`. */
  logFolder: string;
}

export interface WrappedTools {
  runTests(input: unknown): Promise<WrappedRun>;
  runBuild(input: unknown): Promise<WrappedRun>;
}

const firstLine = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split("\n")[0];

function output(command: string, result: ShellResult): string {
  return [`$ ${command}`, `exit ${result.exitCode}${result.timedOut === true ? " (timed out)" : ""}`,
    result.stdout.trimEnd(), result.stderr.trimEnd()].filter((l) => l !== "").join("\n");
}

export function createWrappedTools(deps: { shell: Pick<Shell, "run">; files: Pick<Files, "write"> }, setup: WrappedToolsSetup): WrappedTools {
  let runs = 0;
  let restoreTried = false; // the one restore of the step, whatever came of it
  const notRestore: Guard<string> = (command) =>
    isRestore(command, setup.commands) ? `'${command}' restores: no role restores, the step did it once` : null;
  const shellGuards: ReadonlyArray<Guard<string>> = [notRestore, shellRuleGuard(setup.rules)];

  async function writeLog(tool: string, text: string): Promise<string | null> {
    runs += 1;
    const path = `${setup.logFolder}/${tool}-${runs}.log`;
    try {
      await deps.files.write(path, `${text}\n`);
      return path;
    } catch {
      return null;
    }
  }

  /** Runs `command`, or the reason it could not run. */
  async function run(command: string, timeoutSeconds: number): Promise<ShellResult | string> {
    try {
      return await deps.shell.run(command, { timeoutSeconds });
    } catch (error) {
      return `not run: ${firstLine(error)}`;
    }
  }

  return {
    async runTests(input) {
      const arg = stringArgument(input, "command", true);
      if ("refused" in arg) return { ok: false, refused: arg.refused };
      const check = checkValidation(arg.value as string, setup.commands);
      if (!check.ok) return { ok: false, refused: check.reason };
      const refusal = runGuards(shellGuards, check.command);
      if (refusal !== null) return { ok: false, refused: refusal };
      const result = await run(check.command, RUN_TESTS_TIMEOUT_SECONDS);
      if (typeof result === "string") return { ok: false, refused: result };
      return {
        ok: true, command: check.command, exit: result.exitCode, timedOut: result.timedOut === true,
        tail: outputTail(result.stdout, result.stderr), log: await writeLog("run_tests", output(check.command, result)),
      };
    },

    async runBuild(input) {
      const arg = stringArgument(input, "project", false);
      if ("refused" in arg) return { ok: false, refused: arg.refused };
      const build = buildCommandFor(setup.commands, arg.value);
      if (!build.ok) return { ok: false, refused: build.reason };
      const refusal = runGuards(shellGuards, build.command);
      if (refusal !== null) return { ok: false, refused: refusal };
      const first = await run(build.command, RUN_BUILD_TIMEOUT_SECONDS);
      if (typeof first === "string") return { ok: false, refused: first };
      const log = [output(build.command, first)];
      let last = first;
      let restored = false;
      const restore = setup.commands.restore?.trim();
      if (!restoreTried && first.exitCode !== 0 && first.timedOut !== true && restore && coldTree(`${first.stdout}\n${first.stderr}`)) {
        restoreTried = true;
        // The one restore: the tree was never restored, so no flag of the pack's build can pass.
        const denied = shellRuleGuard(setup.rules)(restore);
        const restoring = denied === null ? await run(restore, RUN_BUILD_TIMEOUT_SECONDS) : denied;
        if (typeof restoring === "string") {
          log.push(`restore not run: ${restoring}`);
        } else {
          log.push(output(restore, restoring));
          if (restoring.exitCode === 0) {
            restored = true;
            const again = await run(build.command, RUN_BUILD_TIMEOUT_SECONDS);
            if (typeof again === "string") log.push(again);
            else { log.push(output(build.command, again)); last = again; }
          }
        }
      }
      return {
        ok: true, command: build.command, exit: last.exitCode, timedOut: last.timedOut === true, restored,
        tail: outputTail(last.stdout, last.stderr), log: await writeLog("run_build", log.join("\n\n")),
      };
    },
  };
}
