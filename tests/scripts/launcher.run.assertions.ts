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

/** No container was run: the docker stand-in was asked at most whether its engine answers. */
export function assertNoContainerRun(r: Run): void {
  ok(!r.args.includes("run"), `a container ran: docker ${r.args.join(" ")}`);
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

/** The container gets the token's variable `name`, never its value, and joins the host's network when `hostNetwork`. */
export function assertBridgeArgs(r: Run, token: string, hostNetwork: boolean, name = "ORKEON_BRIDGE_TOKEN"): void {
  assertArgsHold(r, ["-e", name]);
  ok(!r.args.some((a) => a.includes(token)), `the token's value is in the docker arguments: ${r.args.join(" ")}`);
  const joined = r.args.some((a, i) => a === "--network" && r.args[i + 1] === "host");
  ok(joined === hostNetwork, `--network host ${hostNetwork ? "missing" : "unexpected"}: ${r.args.join(" ")}`);
}

/** A container ran with no bridge wired: neither the token's variable nor the host's network. */
export function assertNoBridgeArgs(r: Run): void {
  strictEqual(r.status, 0, r.stderr);
  assertArgsHold(r, ["run", "--rm"]);
  ok(!r.args.includes("ORKEON_BRIDGE_TOKEN") && !r.args.includes("--network"), `a bridge was wired: ${r.args.join(" ")}`);
}

/** The launcher refused with `said` and never printed `secret`. */
export function assertRefusedWithout(r: Run, said: readonly string[], secret: string): void {
  strictEqual(r.status, 1, r.stderr);
  for (const s of said) ok(r.stderr.includes(s), `not said: ${s}\n${r.stderr}`);
  ok(!(r.stderr + r.stdout).includes(secret), `the value was printed:\n${r.stderr}${r.stdout}`);
}
