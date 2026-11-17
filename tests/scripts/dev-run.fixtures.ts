// scripts/dev-run.sh over a fake runner: the runner, the run that drives it, and the step plans the tests give it.
// A plan line is `<rc>|<line appended to batches-state.md or empty>|<output>`.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT = fileURLToPath(new URL("../../scripts/dev-run.sh", import.meta.url));

// The fake runner: step k (1-based, counted in <dir>/count) reads line k of <dir>/plan,
// `<rc>|<line appended to batches-state.md or empty>|<output>`, and records its arguments.
const RUNNER = `#!/usr/bin/env bash
set -u
dir="$FAKE_DIR"
n=$(( $(cat "$dir/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$dir/count"
printf '%s\\n' "$*" >> "$dir/args"
if [ "$(readlink -f /dev/stdin 2>/dev/null)" = /dev/null ] || { [ ! -d /proc/self ] && [ -c /dev/stdin ]; }; then echo device >> "$dir/stdin"; else echo other >> "$dir/stdin"; fi
spec=$(sed -n "\${n}p" "$dir/plan")
rc="\${spec%%|*}"; rest="\${spec#*|}"; line="\${rest%%|*}"; out="\${rest#*|}"
if [ -n "$line" ]; then mkdir -p "$ORKEON_CODE_WORKSPACE/.orkeon/dev/demo"; printf '%s\\n' "$line" >> "$ORKEON_CODE_WORKSPACE/.orkeon/dev/demo/batches-state.md"; fi
printf 'working\\n%s\\n' "$out"
exit "$rc"
`;

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** The step log files, sorted. */
  logs: string[];
  /** How many steps the runner ran. */
  count: number;
  /** The arguments of the first step. */
  firstArgs: string;
  firstLog: string;
  /** What each step's stdin was: `device` for /dev/null, `other` else. */
  stdin: string[];
}

/** Runs dev-run.sh for the work code `demo` over the fake runner, `plan` one line per step, then removes its folder. */
export function run(plan: readonly string[], args: readonly string[] = [], crew = "dev-verify"): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "dev-run-"));
  try {
    const project = join(dir, "project");
    spawnSync("mkdir", ["-p", project]);
    writeFileSync(join(dir, "plan"), plan.join("\n") + "\n");
    writeFileSync(join(dir, "runner.sh"), RUNNER, { mode: 0o755 });
    const withInputs = args.includes("--inputs") ? args : ["--inputs", `{"code":"demo"}`, ...args];
    const r = spawnSync("bash", [SCRIPT, crew, "demo", "--wait", "0", ...withInputs], {
      encoding: "utf-8",
      env: { ...process.env, DEV_RUN_RUNNER: join(dir, "runner.sh"), FAKE_DIR: dir, ORKEON_CODE_WORKSPACE: project },
    });
    const runs = join(project, ".orkeon/dev/demo/runs");
    const logs = existsSync(runs) ? readdirSync(runs).sort() : [];
    const count = existsSync(join(dir, "count")) ? Number(readFileSync(join(dir, "count"), "utf-8")) : 0;
    const firstArgs = existsSync(join(dir, "args")) ? readFileSync(join(dir, "args"), "utf-8").split("\n")[0] : "";
    const firstLog = logs.length > 0 ? readFileSync(join(runs, logs[0]), "utf-8") : "";
    const stdin = existsSync(join(dir, "stdin")) ? readFileSync(join(dir, "stdin"), "utf-8").trim().split("\n") : [];
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, logs, count, firstArgs, firstLog, stdin };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface UntrustedRun {
  status: number | null;
  stdout: string;
  stderr: string;
  project: string;
  /** The first step's log exists. */
  ranStep: boolean;
  /** The project holds a `.orkeon` folder. */
  createdOrkeon: boolean;
}

/** Runs dev-run.sh without DEV_RUN_RUNNER, ORKEON_CODE_TRUST nor CI, on a fresh project and no terminal. */
export function runUntrusted(): UntrustedRun {
  const dir = mkdtempSync(join(tmpdir(), "dev-run-trust-"));
  try {
    const project = join(dir, "project");
    spawnSync("mkdir", ["-p", project]);
    const env: NodeJS.ProcessEnv = { ...process.env, ORKEON_CODE_WORKSPACE: project, ORKEON_CODE_HOME: join(dir, "home") };
    for (const k of ["DEV_RUN_RUNNER", "ORKEON_CODE_TRUST", "CI"]) delete env[k];
    const r = spawnSync("bash", [SCRIPT, "dev-verify", "demo", "--inputs", "{}"], { encoding: "utf-8", env, input: "" });
    return {
      status: r.status, stdout: r.stdout, stderr: r.stderr, project,
      ranStep: existsSync(join(project, ".orkeon/dev/demo/runs/dev-verify-1.log")),
      createdOrkeon: existsSync(join(project, ".orkeon")),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const F1_LAUNCHED = "0|- 2026-10-24 09:00 F1 launched|";
export const CLOSED = "0|- 2026-10-24 09:30 closed|";
/** A step that moves nothing in the log and prints nothing. */
export const NOTHING = "0||";

/** A run of the fake runner and the exit it ends with; `count`, when given, is the number of steps run. */
export interface ExitCase {
  name: string;
  plan: readonly string[];
  args?: readonly string[];
  status: number;
  count?: number;
  /** Why this exit, when the check's message should say it. */
  why?: string;
}

export const CLOSED_READINGS: readonly ExitCase[] = [
  { name: "reads `closed` followed by a CR", plan: ["0|- 2026-10-24 09:30 closed\r|"], status: 0 },
  { name: "reads `closed` followed by trailing blanks", plan: ["0|- 2026-10-24 09:30 closed  |"], status: 0 },
  {
    name: "never reads an event whose detail ends in ' closed' as the close",
    plan: ["0|- 2026-10-24 09:00 F1 stopped the PR was closed|", NOTHING],
    status: 4,
  },
];

export const HUMAN_DECISIONS: readonly ExitCase[] = [
  { name: "stops with 3 when a batch returned GAPS", plan: ["0|- 2026-10-24 09:00 F1 returned GAPS|"], status: 3 },
  { name: "stops with 3 when a batch stopped BLOCKED", plan: ["0|- 2026-10-24 09:00 F1 stopped BLOCKED|"], status: 3 },
  { name: "stops with 3 when a step stopped on a question kept by checkpointing (exit 75)", plan: ["75||waiting_for_input"], status: 3 },
  { name: "goes on past an event that only mentions GAPS", plan: ["0|- 2026-10-24 09:00 F3 launched after GAPS fix|", CLOSED], status: 0 },
];

export const LOG_OPTION: readonly ExitCase[] = [
  {
    name: "reads the event log --log names, not Code's own",
    plan: [CLOSED],
    args: ["--log", "workbench/demo/DEMO-BATCHES-STATE.md"],
    status: 4,
    why: "the fake writes Code's own log, not the one named: nothing moved there",
  },
  { name: "refuses an absolute --log, outside the project, with 64", plan: [NOTHING], args: ["--log", "/etc/passwd"], status: 64 },
  { name: "refuses a --log that climbs out of the project with 64", plan: [NOTHING], args: ["--log", "../x.md"], status: 64 },
];

export const RUNTIME_ERRORS: readonly ExitCase[] = [
  {
    name: "stops with 2 after the retries of a rate-limited step",
    plan: ["2||rate limit", "2||rate limit", "2||rate limit", NOTHING],
    args: ["--retries", "2"],
    status: 2,
    count: 3,
  },
  { name: "stops with 2 at once on another runtime error", plan: ["2||the provider refused the key after 1429 ms", NOTHING], status: 2, count: 1 },
];

export const CREW_EXITS: readonly ExitCase[] = [
  { name: "stops with the crew's 1", plan: ["1||TypeError"], status: 1 },
  { name: "stops with the cancel's 130", plan: ["130||cancelled"], status: 130 },
];

export const BAD_ARGS: readonly ExitCase[] = [["--max-steps", "x"], ["--bogus"], ["--max-steps", "0"], ["--inputs", ""]].map(
  (args) => ({ name: `refuses ${JSON.stringify(args.join(" "))} with 64, running nothing`, plan: [NOTHING], args, status: 64, count: 0, why: args.join(" ") }),
);

/** Invocations refused before any runner is looked for: the arguments after the script. */
export const BAD_INVOCATIONS: readonly { name: string; argv: readonly string[] }[] = [
  { name: "refuses a work code that climbs out of the project with 64", argv: ["dev-verify", "../x"] },
  { name: "refuses a crew that does not exist with 64", argv: ["no-such-crew", "demo", "--inputs", "{}"] },
];

// An `orkeon` on PATH standing for the runner `orkeon-code run` finds first: it records its arguments and its working
// folder, then closes the batches, so that the chain ends after one step.
const ORKEON = `#!/usr/bin/env bash
printf '%s\\n' "$*" > "$FAKE_DIR/orkeon-args"
pwd -P > "$FAKE_DIR/orkeon-cwd"
mkdir -p .orkeon/dev/demo && printf '%s\\n' "- 2026-10-24 09:30 closed" >> .orkeon/dev/demo/batches-state.md
`;

export interface LauncherRun {
  status: number | null;
  output: string;
  /** What `orkeon` was given, and the folder it ran from. */
  orkeonArgs: string;
  orkeonCwd: string;
  project: string;
  settings: string;
  crew: string;
}

/** Runs dev-run.sh without DEV_RUN_RUNNER, on a trusted project (CI), through the launcher and an `orkeon` stand-in. */
export function runThroughLauncher(): LauncherRun {
  const dir = mkdtempSync(join(tmpdir(), "dev-run-launcher-"));
  try {
    const project = join(dir, "project");
    const bin = join(dir, "bin");
    spawnSync("mkdir", ["-p", project, bin]);
    writeFileSync(join(bin, "orkeon"), ORKEON, { mode: 0o755 });
    const settings = join(dir, "settings.json");
    writeFileSync(settings, '{ "Llm": { "Model": "m" } }\n');
    const env: NodeJS.ProcessEnv = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`, FAKE_DIR: dir, ORKEON_CODE_WORKSPACE: project,
      ORKEON_CODE_SETTINGS: settings, ORKEON_CODE_STATE: join(dir, "state"), ORKEON_CODE_HOME: join(dir, "home"),
      ORKEON_CODE_TRUST: "1", CI: "true",
    };
    for (const k of ["DEV_RUN_RUNNER", "ORKEON_CLI", "ORKEON_CODE_MODE"]) delete env[k];
    const r = spawnSync("bash", [SCRIPT, "dev-verify", "demo", "--wait", "0", "--inputs", '{"code":"demo"}'], { encoding: "utf-8", env });
    const read = (f: string) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf-8").trim() : "");
    const logs = join(project, ".orkeon/dev/demo/runs");
    const stepLog = existsSync(logs) ? readdirSync(logs).map((f) => readFileSync(join(logs, f), "utf-8")).join("\n") : "";
    return {
      status: r.status, output: `${r.stdout}${r.stderr}\n${stepLog}`, orkeonArgs: read("orkeon-args"), orkeonCwd: read("orkeon-cwd"),
      project: realpathSync(project), settings, crew: fileURLToPath(new URL("../../src/crews/dev-verify/crew.ork.ts", import.meta.url)),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
