// Checks on how scripts/dev-run.sh ended.
import { ok, strictEqual } from "node:assert";
import type { ExitCase, LauncherRun, RunResult } from "./dev-run.fixtures.ts";

/** The run ended with the case's exit and, when the case gives one, after its number of steps. */
export function assertExit(r: RunResult, expected: ExitCase): void {
  strictEqual(r.status, expected.status, expected.why ?? `exit ${r.status}: ${r.stdout}${r.stderr}`);
  if (expected.count !== undefined) strictEqual(r.count, expected.count, `${r.count} steps run, ${expected.count} expected`);
}

/** The step ran `orkeon run` through the launcher: the crew, the settings, the project on /workspace, the inputs, from
 *  the project. */
export function assertRanThroughLauncher(r: LauncherRun): void {
  strictEqual(r.status, 0, r.output);
  for (const part of [`run ${r.crew} -s ${r.settings} -m ${r.project}:/workspace:rw`, `--inputs {"code":"demo"}`]) {
    ok(r.orkeonArgs.includes(part), `orkeon was not given ${part}:\n${r.orkeonArgs}`);
  }
  strictEqual(r.orkeonCwd, r.project, "orkeon did not run from the project");
}
