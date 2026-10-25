// The guard chain of the tools Orkeon Code defines (run_validation, run_tests, run_build). The host
// gate is asked once, for the tool call itself; the shell commands the tool's body then runs are
// not asked again (toolBuilder, orkeon.d.ts), so the body applies the rules it is given before each
// one, with the gate's own reading (matchesRule). A guard returns a refusal or null; the first
// refusal is terminal and a guard that throws refuses (fail-closed). Pure.
import type { PermissionRule } from "../agent-policy/permission.ts";
import { ruleDecision, shellCommandForms } from "../agent-policy/permission.ts";
import { gitConfigSets, holdsGitReadonly } from "../agent-policy/rule-sets.ts";
import { WORKSPACE } from "../vfs.ts";

/** One check of a call: the reason it is refused, or null when it passes. */
export type Guard<T> = (call: T) => string | null;

/** The first refusal of `guards`, in order; a guard that throws refuses with its message. */
export function runGuards<T>(guards: ReadonlyArray<Guard<T>>, call: T): string | null {
  for (const guard of guards) {
    let refusal: string | null;
    try {
      refusal = guard(call);
    } catch (error) {
      refusal = `a guard failed: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (refusal !== null) return refusal;
  }
  return null;
}

/** Refuses a shell command a deny rule covers, as the gate would refuse the model's own shell_command, in any of
 *  the forms the program receives it in (shellCommandForms). */
export function shellRuleGuard(rules: readonly PermissionRule[]): Guard<string> {
  const gitConfig = holdsGitReadonly(rules);
  return (command) =>
    shellCommandForms(command).some((form) =>
      ruleDecision(rules, "shell_command", { command: form, working_directory: WORKSPACE }) === "deny")
      || (gitConfig && gitConfigSets(command))
      ? `the rules of this step deny the shell command '${command}'`
      : null;
}

/** The longest text a tool's string argument may be. */
export const MAX_ARGUMENT_CHARS = 400;

/** The string `key` of a tool's input, or the reason it is not one line of at most 400 characters. */
export function stringArgument(input: unknown, key: string, required: boolean): { value?: string } | { refused: string } {
  const value = input !== null && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
  if (value === undefined || value === null || value === "") {
    return required ? { refused: `'${key}' is required` } : {};
  }
  if (typeof value !== "string") return { refused: `'${key}' is not a string` };
  if (/[\r\n]/.test(value) || value.length > MAX_ARGUMENT_CHARS) {
    return { refused: `'${key}' is not one line of at most ${MAX_ARGUMENT_CHARS} characters` };
  }
  return { value: value.trim() };
}

const TAIL_LINES = 15;
const TAIL_CHARS = 1_500;

/** At most 15 lines and 1 500 characters of the output, stderr after stdout: what a tool hands back. */
export function outputTail(stdout: string, stderr: string): string {
  const joined = [stdout.trimEnd(), stderr.trimEnd()].filter((t) => t !== "").join("\n");
  const text = joined === "" ? "" : joined.split(/\r?\n/).slice(-TAIL_LINES).join("\n");
  return text.length <= TAIL_CHARS ? text : text.slice(-TAIL_CHARS);
}
