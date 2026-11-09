// scripts/smoke-validate.sh over a fake runner (SMOKE_VALIDATE_RUNNER): the runner records what the
// smoke gives it at each call, then follows FAKE_PLAN, `<rc>|<the line it prints, or empty>`. No
// orkeon, no network.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT = fileURLToPath(new URL("../../scripts/smoke-validate.sh", import.meta.url));
const CREWS_DIR = fileURLToPath(new URL("../../src/crews/", import.meta.url));

/** What the runtime prints for a crew of this project: a script that never assigns globalThis.crew itself. */
export const OK_LINE = "VALIDATION OK: crew.ork.ts (procedural script: bundled, not run)";
export const FAILED_LINE = "VALIDATION FAILED: type errors";

/** The crews the smoke must validate: every src/crews/<name>/crew.ork.ts, the `_` probes left out. */
export const CREWS: string[] = readdirSync(CREWS_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("_") && existsSync(join(CREWS_DIR, e.name, "crew.ork.ts")))
  .map((e) => `src/crews/${e.name}/crew.ork.ts`)
  .sort();

// The fake runner: appends its arguments (one line per call), keeps the settings it was given,
// prints the plan's line when there is one, exits with the plan's code.
const RUNNER = `#!/usr/bin/env bash
set -u
dir="$FAKE_DIR"
printf '%s\\n' "$*" >> "$dir/args"
cp "$ORKEON_CODE_SETTINGS" "$dir/settings.json"
rc="\${FAKE_PLAN%%|*}"; line="\${FAKE_PLAN#*|}"
if [ -n "$line" ]; then echo "$line"; fi
exit "$rc"
`;

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** The arguments of each runner call, space-joined, one entry per call. */
  calls: string[];
  /** The Llm section of the settings the runner was given. */
  llm: Record<string, unknown>;
}

export interface ExitCase {
  name: string;
  plan: string;
  status: number;
}

/** What the smoke concludes from how the runner ended and what it printed, the same for every crew. */
export const EXITS: ExitCase[] = [
  { name: "passes when the runner validates every crew", plan: `0|${OK_LINE}`, status: 0 },
  { name: "fails when the runner exits with an error", plan: `1|${FAILED_LINE}`, status: 1 },
  { name: "fails when the runner exits 0 without a VALIDATION OK line", plan: "0|", status: 1 },
  { name: "fails when the runner reports a failed validation yet exits 0", plan: `0|${FAILED_LINE}`, status: 1 },
];

/** Runs the smoke over the fake runner following `plan`. */
export function run(plan: string): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "smoke-validate-"));
  try {
    const runner = join(dir, "runner.sh");
    writeFileSync(runner, RUNNER);
    chmodSync(runner, 0o755);
    const r = spawnSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, SMOKE_VALIDATE_RUNNER: runner, FAKE_DIR: dir, FAKE_PLAN: plan },
    });
    const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "");
    const settings = read("settings.json");
    return {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      calls: read("args").split("\n").filter((l) => l !== ""),
      llm: settings === "" ? {} : (JSON.parse(settings).Llm as Record<string, unknown>),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
