// Checks on what `orkeon-code run` handed its runner.
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import type { Run } from "./launcher.fixtures.ts";
import { runArgs } from "./launcher.run.fixtures.ts";

/** The runner received exactly `expected`. */
export function assertRunnerArgs(r: Run, expected: readonly string[]): void {
  strictEqual(r.status, 0, r.stderr);
  deepStrictEqual(r.args, expected);
}

/** No runner was started: nothing recorded its arguments. */
export function assertNothingRun(r: Run): void {
  deepStrictEqual(r.args, [], `a runner started: ${r.args.join(" ")}`);
}

/** The words `seq` appear in the runner's arguments, one after the other. */
export function assertArgsHold(r: Run, seq: readonly string[]): void {
  const at = r.args.findIndex((_, i) => seq.every((w, k) => r.args[i + k] === w));
  ok(at >= 0, `not in the runner's arguments: ${seq.join(" ")}\n${r.args.join(" ")}`);
}

/** The runner's arguments end with `tail`. */
export function assertArgsEndWith(r: Run, tail: readonly string[]): void {
  deepStrictEqual(r.args.slice(-tail.length), tail, `the arguments end otherwise: ${r.args.join(" ")}`);
}

/** The dotnet stand-in was called with these lines (`<cwd> <args>`), in order. */
export function assertCalls(r: Run, expected: readonly string[]): void {
  strictEqual(r.status, 0, r.stderr);
  deepStrictEqual(r.calls, expected);
}

/** The orkeon on PATH ran the crew, and no stand-in that records its calls (the downloaded runtime) started. */
export function assertPathOrkeonRan(r: Run): void {
  strictEqual(r.status, 0, r.stderr);
  deepStrictEqual(r.args, runArgs(r), "the orkeon on PATH was not handed the run");
  deepStrictEqual(r.calls, [], `another runner started: ${r.calls.join(", ")}`);
}
