// Checks on what scripts/smoke-validate.sh gave its runner and how it ended.
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import type { ExitCase, RunResult } from "./smoke-validate.fixtures.ts";

/** The smoke ended with the case's exit. */
export function assertExit(r: RunResult, expected: ExitCase): void {
  strictEqual(r.status, expected.status, `exit ${r.status}: ${r.stdout}${r.stderr}`);
}

/** The runner was called once per crew of `crews`, in that order, and for no other script. */
export function assertEveryCrew(r: RunResult, crews: string[]): void {
  const asked = r.calls.map((call) => call.split(" ")[0].replace(/^.*\/src\/crews\//, "src/crews/"));
  deepStrictEqual(asked, crews, `the crews validated differ from src/crews/: ${r.calls.join("\n")}`);
}

/** Every call asked for a dry run and brought no model answers. */
export function assertValidateOnly(r: RunResult): void {
  ok(r.calls.length > 0, "the runner was never called");
  for (const call of r.calls) {
    ok(call.endsWith(" --validate"), `not a dry run: ${call}`);
    ok(!call.includes("--llm-mock") && !call.includes("--inputs"), `a run, not a validation: ${call}`);
  }
}

/** The settings carry the keyless Llm section of the other smokes, no key from the environment. */
export function assertKeylessSettings(r: RunResult): void {
  strictEqual(r.llm.Model, "smoke", `Llm.Model: ${JSON.stringify(r.llm)}`);
  strictEqual(r.llm.ApiKey, "smoke-not-a-key", `Llm.ApiKey: ${JSON.stringify(r.llm)}`);
  strictEqual(r.llm.ApiKeyEnvVar, undefined, "a key variable of the environment would reach the run");
}

/** The smoke reported `text`. */
export function assertReports(r: RunResult, text: string): void {
  ok(r.stdout.includes(text), `not reported: ${text}\n${r.stdout}${r.stderr}`);
}
