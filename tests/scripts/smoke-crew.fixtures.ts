// scripts/smoke-crew.sh over a fake runner (SMOKE_CREW_RUNNER): the runner records what the smoke
// gives it, then follows FAKE_PLAN, `<rc>|<subject it commits in the workspace, or empty>`. No orkeon, no network.
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const SCRIPT = fileURLToPath(new URL("../../scripts/smoke-crew.sh", import.meta.url));
/** The first line of the one answer in tests/fixtures/llm-mock/git-commit.jsonl. */
export const MOCK_SUBJECT = "chore(sample): note the smoke in the readme";

// The fake runner: records its arguments, the workspace's status and the settings it was given,
// commits the plan's subject when there is one, exits with the plan's code.
const RUNNER = `#!/usr/bin/env bash
set -u
dir="$FAKE_DIR"
printf '%s\\n' "$*" > "$dir/args"
git -C "$ORKEON_CODE_WORKSPACE" status --porcelain > "$dir/status"
cp "$ORKEON_CODE_SETTINGS" "$dir/settings.json"
rc="\${FAKE_PLAN%%|*}"; subject="\${FAKE_PLAN#*|}"
if [ -n "$subject" ]; then git -C "$ORKEON_CODE_WORKSPACE" add -A && git -C "$ORKEON_CODE_WORKSPACE" commit -q -m "$subject"; fi
echo '"finalOutput": "fake"'
exit "$rc"
`;

export interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  /** The arguments the runner received, space-joined. */
  args: string;
  /** `git status --porcelain` of the workspace as the runner saw it. */
  workspaceStatus: string;
  /** The Llm section of the settings the runner was given. */
  llm: Record<string, unknown>;
}

export interface ExitCase {
  name: string;
  plan: string;
  status: number;
}

/** What the smoke concludes from how the runner ended and what it left in the fixture. */
export const EXITS: ExitCase[] = [
  { name: "passes when the runner committed the mock's subject", plan: `0|${MOCK_SUBJECT}`, status: 0 },
  { name: "fails when the runner exits with an error", plan: "7|", status: 1 },
  { name: "fails when the runner exits 0 without committing", plan: "0|", status: 1 },
  { name: "fails when the runner committed another subject", plan: "0|chore: something else", status: 1 },
];

/** Runs the smoke over the fake runner following `plan`. */
export function run(plan: string): RunResult {
  const dir = mkdtempSync(join(tmpdir(), "smoke-crew-"));
  try {
    const runner = join(dir, "runner.sh");
    writeFileSync(runner, RUNNER);
    chmodSync(runner, 0o755);
    const r = spawnSync("bash", [SCRIPT], {
      encoding: "utf8",
      env: { ...process.env, SMOKE_CREW_RUNNER: runner, FAKE_DIR: dir, FAKE_PLAN: plan },
    });
    const read = (name: string) => (existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : "");
    const settings = read("settings.json");
    return {
      status: r.status,
      stdout: r.stdout,
      stderr: r.stderr,
      args: read("args").trim(),
      workspaceStatus: read("status").trim(),
      llm: settings === "" ? {} : (JSON.parse(settings).Llm as Record<string, unknown>),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
