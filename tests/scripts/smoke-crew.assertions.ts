// Checks on what scripts/smoke-crew.sh gave its runner and how it ended.
import { ok, strictEqual } from "node:assert";
import type { ExitCase, RunResult } from "./smoke-crew.fixtures.ts";

/** The smoke ended with the case's exit. */
export function assertExit(r: RunResult, expected: ExitCase): void {
  strictEqual(r.status, expected.status, `exit ${r.status}: ${r.stdout}${r.stderr}`);
}

/** The runner was asked for the git-commit crew, under the mock answers, in bypass mode, with the workspace trusted. */
export function assertRunnerCall(r: RunResult): void {
  ok(r.args.includes("src/crews/git-commit/crew.ork.ts"), `the crew is not git-commit: ${r.args}`);
  ok(r.args.includes("--llm-mock ") && r.args.includes("tests/fixtures/llm-mock/git-commit.jsonl"), `no mock answers: ${r.args}`);
  ok(r.args.includes('--inputs {"permissionMode":"bypassPermissions"}'), `the shell would be refused: ${r.args}`);
  ok(r.args.includes("--trust"), `an untrusted workspace is refused without a terminal: ${r.args}`);
}

/** The settings carry the keyless Llm section of the REPL smoke, no key from the environment. */
export function assertKeylessSettings(r: RunResult): void {
  strictEqual(r.llm.Model, "smoke", `Llm.Model: ${JSON.stringify(r.llm)}`);
  strictEqual(r.llm.ApiKey, "smoke-not-a-key", `Llm.ApiKey: ${JSON.stringify(r.llm)}`);
  strictEqual(r.llm.ApiKeyEnvVar, undefined, "a key variable of the environment would reach the run");
}

/** The smoke reported `text`. */
export function assertReports(r: RunResult, text: string): void {
  ok(r.stdout.includes(text), `not reported: ${text}\n${r.stdout}${r.stderr}`);
}
