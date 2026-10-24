// scripts/dev-run.sh over a fake runner (DEV_RUN_RUNNER): each case scripts what each step
// prints, appends to the work code's event log and exits with. No orkeon, no network. Run:
//   node --test tests/dev-run.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("../scripts/dev-run.sh", import.meta.url));

// The fake runner: step k (1-based, counted in <dir>/count) reads line k of <dir>/plan,
// `<rc>|<line appended to batches-state.md or empty>|<output>`, and records its arguments.
const RUNNER = `#!/usr/bin/env bash
set -u
dir="$FAKE_DIR"
n=$(( $(cat "$dir/count" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$dir/count"
printf '%s\\n' "$*" >> "$dir/args"
spec=$(sed -n "\${n}p" "$dir/plan")
rc="\${spec%%|*}"; rest="\${spec#*|}"; line="\${rest%%|*}"; out="\${rest#*|}"
if [ -n "$line" ]; then mkdir -p "$ORKEON_CODE_WORKSPACE/.orkeon/dev/demo"; printf '%s\\n' "$line" >> "$ORKEON_CODE_WORKSPACE/.orkeon/dev/demo/batches-state.md"; fi
printf 'working\\n%s\\n' "$out"
exit "$rc"
`;

function run(plan: string[], args: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), "dev-run-"));
  try {
    const project = join(dir, "project");
    spawnSync("mkdir", ["-p", project]);
    writeFileSync(join(dir, "plan"), plan.join("\n") + "\n");
    writeFileSync(join(dir, "runner.sh"), RUNNER, { mode: 0o755 });
    const withInputs = args.includes("--inputs") ? args : ["--inputs", `{"code":"demo"}`, ...args];
    const r = spawnSync("bash", [SCRIPT, "dev-verify", "demo", "--wait", "0", ...withInputs], {
      encoding: "utf-8",
      env: { ...process.env, DEV_RUN_RUNNER: join(dir, "runner.sh"), FAKE_DIR: dir, ORKEON_CODE_WORKSPACE: project },
    });
    const runs = join(project, ".orkeon/dev/demo/runs");
    const logs = existsSync(runs) ? readdirSync(runs).sort() : [];
    const count = existsSync(join(dir, "count")) ? Number(readFileSync(join(dir, "count"), "utf-8")) : 0;
    const firstArgs = existsSync(join(dir, "args")) ? readFileSync(join(dir, "args"), "utf-8").split("\n")[0] : "";
    const firstLog = logs.length > 0 ? readFileSync(join(runs, logs[0]), "utf-8") : "";
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, logs, count, firstArgs, firstLog };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("scripts/dev-run.sh", () => {
  it("parses as bash", () => {
    strictEqual(spawnSync("bash", ["-n", SCRIPT]).status, 0);
  });

  it("runs steps until the log says closed, each output in its own log file, the last line shown", () => {
    const r = run(["0|- 2026-10-24 09:00 F1 launched|step one done", "0|- 2026-10-24 09:30 closed|all closed"]);
    strictEqual(r.status, 0, r.stdout + r.stderr);
    strictEqual(r.count, 2);
    deepStrictEqual(r.logs, ["dev-verify-1.log", "dev-verify-2.log"]);
    strictEqual(r.firstLog, "working\nstep one done\n");
    ok(r.stdout.includes("  last line: step one done"), r.stdout);
    ok(!r.stdout.includes("working"), "the whole output stays in the log");
    ok(r.firstArgs.endsWith(`/src/crews/dev-verify/crew.ork.ts --inputs {"code":"demo"}`), r.firstArgs);
  });

  it("passes the inputs given", () => {
    const r = run(["0|- 2026-10-24 09:30 closed|"], ["--inputs", `{"batch":"F2"}`]);
    strictEqual(r.status, 0, r.stdout + r.stderr);
    ok(r.firstArgs.endsWith(`/src/crews/dev-verify/crew.ork.ts --inputs {"batch":"F2"}`), r.firstArgs);
  });

  it("stops with 3 when a human must decide (GAPS or BLOCKED)", () => {
    strictEqual(run(["0|- 2026-10-24 09:00 F1 returned GAPS|"]).status, 3);
    strictEqual(run(["0|- 2026-10-24 09:00 F1 stopped BLOCKED|"]).status, 3);
    strictEqual(run(["0|- 2026-10-24 09:00 F3 launched after GAPS fix|", "0|- 2026-10-24 09:30 closed|"]).status, 0);
  });

  it("reads the event log --log names, inside the project only", () => {
    const r = run(["0|- 2026-10-24 09:30 closed|"], ["--log", "workbench/demo/DEMO-BATCHES-STATE.md"]);
    strictEqual(r.status, 4, "the fake writes Code's own log, not the one named: nothing moved there");
    strictEqual(run(["0||"], ["--log", "/etc/passwd"]).status, 64);
    strictEqual(run(["0||"], ["--log", "../x.md"]).status, 64);
  });

  it("stops with 4 when a step moved nothing, never looping", () => {
    const r = run(["0|- 2026-10-24 09:00 F1 launched|", "0||", "0||"]);
    strictEqual(r.status, 4);
    strictEqual(r.count, 2);
  });

  it("waits and runs a rate-limited step again, then goes on", () => {
    const r = run(["2||HTTP 429 Too Many Requests", "0|- 2026-10-24 09:30 closed|"]);
    strictEqual(r.status, 0, r.stdout);
    strictEqual(r.count, 2);
    ok(r.stdout.includes("rate limited"));
  });

  it("stops with 2 after the retries, and at once on another runtime error", () => {
    const limited = run(["2||rate limit", "2||rate limit", "2||rate limit", "0||"], ["--retries", "2"]);
    strictEqual(limited.status, 2);
    strictEqual(limited.count, 3);
    const other = run(["2||the provider refused the key after 1429 ms", "0||"]);
    strictEqual(other.status, 2);
    strictEqual(other.count, 1);
  });

  it("stops with the crew's 1 and the cancel's 130", () => {
    strictEqual(run(["1||TypeError"]).status, 1);
    strictEqual(run(["130||cancelled"]).status, 130);
  });

  it("stops with 5 at --max-steps", () => {
    const r = run(["0|- 2026-10-24 09:00 F1 launched|", "0|- 2026-10-24 09:10 F2 launched|", "0||"], ["--max-steps", "2"]);
    strictEqual(r.status, 5);
    strictEqual(r.count, 2);
  });

  it("refuses bad arguments with 64, running nothing", () => {
    for (const args of [["--max-steps", "x"], ["--bogus"], ["--max-steps", "0"], ["--inputs", ""]]) {
      const r = run(["0||"], args);
      strictEqual(r.status, 64, args.join(" "));
      strictEqual(r.count, 0);
    }
    strictEqual(spawnSync("bash", [SCRIPT, "dev-verify", "../x"], { encoding: "utf-8" }).status, 64);
    strictEqual(spawnSync("bash", [SCRIPT, "no-such-crew", "demo", "--inputs", "{}"], { encoding: "utf-8" }).status, 64);
  });
});
