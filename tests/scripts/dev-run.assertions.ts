// Checks on how scripts/dev-run.sh ended.
import { strictEqual } from "node:assert";
import type { ExitCase, RunResult } from "./dev-run.fixtures.ts";

/** The run ended with the case's exit and, when the case gives one, after its number of steps. */
export function assertExit(r: RunResult, expected: ExitCase): void {
  strictEqual(r.status, expected.status, expected.why ?? `exit ${r.status}: ${r.stdout}${r.stderr}`);
  if (expected.count !== undefined) strictEqual(r.count, expected.count, `${r.count} steps run, ${expected.count} expected`);
}
