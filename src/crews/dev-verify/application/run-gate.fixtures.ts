// The pack, sheet, plan and fakes runGate is tested on, the git lines it issues, and the recordings of
// tests/fixtures/dev/verify its parity with the harness's gate is checked on.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { parseRepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { DevVerifyTarget } from "./run-gate.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** The pack a YAML text describes; a text that is no pack throws. */
export function pack(yaml: string): RepoPack {
  const r = parseRepoPack(yaml);
  if (!r.ok) throw new Error(r.error.message);
  return r.pack;
}

export const PACK = pack("layout:\n  domain: src\n  tests: tests\n  build_outputs: [bin, obj]\ntests:\n  rule_trait: BR\n");
export const EX = "':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'";
export const UNTRACKED = `git ls-files --others --exclude-standard -- . ${EX}`;
export const TRAIT_GREP = `git grep --untracked -I -noE -e '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]' -- src tests ${EX}`;

export const SHEET = "# DEMO-PLAN-F2 — Command\n| Applied rules | DDD-01 |\n## TDD sequence\n| # | Test |\n|---|---|\n" +
  "| 1 | `ShowsTheState` BR-01 |\nTDD: RED [x] GREEN [x] COST [x]\n";
export const PLAN = "# DEMO-PLAN\nNon-applicable rules: DDD-02 DDD-03 DDD-04 DDD-05 DDD-06 DDD-07 DDD-08 DDD-09 DDD-10 DDD-11 " +
  "APP-01 APP-02 APP-03 APP-04 APP-05 PERF-01\n";

/** The notice the runtime appends to an output it cut. */
export const CUT_NOTICE = "\n\n[... truncated, 1234 chars omitted. Use more specific parameters to narrow results.]";

/** The gate's line on a git output the runtime cut. */
export const CUT_LINE = "  FAIL the output of 'git diff --name-only HEAD' was cut by the runtime (1234 characters omitted): " +
  "the list is incomplete, run the gate again on a smaller change";

/** Batch F2 of the plan folder workbench/demo, `over` replacing its fields. */
export function target(over: Partial<DevVerifyTarget> = {}): DevVerifyTarget {
  return {
    batch: "F2", code: "demo", prefix: "DEMO", workShown: "workbench", planDirShown: "workbench/demo",
    sheetShown: "workbench/demo/DEMO-PLAN-F2.md", pack: PACK, packShown: ".orkeon/repo.yaml", ...over,
  };
}

/** The sheet and plan on disk, and the git outputs of a green batch. */
export function fakes(): { files: FakeFiles; shell: FakeShell } {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/workbench/demo/DEMO-PLAN-F2.md`, SHEET);
  files.files.set(`${WORKSPACE}/workbench/demo/DEMO-PLAN.md`, PLAN);
  files.listings.set(`${WORKSPACE}/workbench/demo`, ["DEMO-PLAN-F2.md", "DEMO-PLAN.md", "logs", "notes.txt"]);
  const shell = new FakeShell();
  shell.results["git diff --name-only HEAD"] = { stdout: "src/b.ts\nsrc/a.ts\n" };
  shell.results[UNTRACKED] = { stdout: "tests/a.test.ts\nsrc/a.ts\n" };
  shell.results[TRAIT_GREP] = { stdout: 'tests/a.test.ts:3:[Trait("BR", "BR-01")]\n' };
  return { files, shell };
}

/** The fakes of a plan folder that holds 59 notes listed before the sheet and the plan. */
export function fakesWithNotes(): { files: FakeFiles; shell: FakeShell } {
  const { files, shell } = fakes();
  const notes = Array.from({ length: 59 }, (_, i) => `A-note-${String(i).padStart(2, "0")}.md`);
  for (const n of notes) files.files.set(`${WORKSPACE}/workbench/demo/${n}`, "# note\n");
  files.listings.set(`${WORKSPACE}/workbench/demo`, [...notes, "DEMO-PLAN-F2.md", "DEMO-PLAN.md"]);
  return { files, shell };
}

// The recordings of tests/fixtures/dev/verify: on each scenario, runGate over the recorded git outputs prints the
// very lines the harness gate printed.
//
// Recorded 2026-10-22 (git 2.39.5, GNU bash), again the same day once the trait ERE took its `-e`
// and the untracked-build-output and named-outside-roots scenarios were added; per scenario of scenarios.json:
//   T=$(mktemp -d <scratch>/top-<name>-XXXX); cd "$T"; git init -q
//   cp -r tests/fixtures/dev/verify/base/. "$T"
//   git add -A && git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm base
//   cp -r tests/fixtures/dev/verify/batch/. "$T"; then the scenario's edits (first occurrence of `find`, or `create`)
//   bash /workspace/temp/_sources/orkeon-workshop/.devcontainer/harness/packs/dev/claude/skills/dev-verify/scripts/audit-capture.sh \
//     F1 workbench/vdemo/VDEMO-PLAN-F1.md <scratch>/cap-<name>.txt --roots "src tests" --trait BR --build-outputs "bin obj"
// harness-gate.txt keeps its stdout from `GATE — batch F1 — sheet` through `GATE — batch F1:`, "$T" replaced by
// /workspace. git-outputs.json holds the stdout and exit code of each command runGate issued, run with
// `bash -c "<command>"` in "$T", with the pack of pack.yaml (the same roots, trait and build outputs).

const FIXTURE = new URL("../../../../tests/fixtures/dev/verify/", import.meta.url).pathname;
const read = (name: string): string => readFileSync(join(FIXTURE, name), "utf8");

export interface Edit { path: string; find?: string; replace?: string; create?: string }
export interface Scenario { name: string; edits: Edit[] }
export interface RecordedOutput { stdout: string; exitCode: number }

export const scenarios: Scenario[] = JSON.parse(read("scenarios.json"));
export const gitOutputs: Record<string, Record<string, RecordedOutput>> = JSON.parse(read("git-outputs.json"));

function loadPack(): RepoPack {
  const parsedPack = parseRepoPack(read("pack.yaml"));
  if (!parsedPack.ok) throw new Error(`pack.yaml: ${parsedPack.error.message}`);
  return parsedPack.pack;
}

/** The pack of pack.yaml: the roots, trait and build outputs the recordings were made with. */
export const RECORDED_PACK = loadPack();

/** Batch F1 of the plan folder workbench/vdemo, as the recordings ran it. */
export const RECORDED_TARGET: DevVerifyTarget = {
  batch: "F1", code: "vdemo", prefix: "VDEMO", workShown: "workbench", planDirShown: "workbench/vdemo",
  sheetShown: "workbench/vdemo/VDEMO-PLAN-F1.md", pack: RECORDED_PACK, packShown: ".orkeon/repo.yaml",
};

/** The lines the harness gate printed, per scenario name. */
export function harnessBlocks(): Map<string, string[]> {
  const blocks = new Map<string, string[]>();
  let current: string[] = [];
  for (const line of read("harness-gate.txt").split("\n")) {
    if (line.startsWith("=== ")) { current = []; blocks.set(line.slice(4), current); continue; }
    if (line !== "") current.push(line);
  }
  return blocks;
}

function tree(dir: string, rel = "", acc = new Map<string, string>()): Map<string, string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const r = rel === "" ? name : `${rel}/${name}`;
    if (statSync(p).isDirectory()) tree(p, r, acc);
    else acc.set(r, readFileSync(p, "utf8"));
  }
  return acc;
}

/** The base tree, the batch over it, then the scenario's edits, under /workspace with their listings. */
export function filesOf(edits: readonly Edit[]): FakeFiles {
  const files = new Map([...tree(join(FIXTURE, "base")), ...tree(join(FIXTURE, "batch"))]);
  for (const e of edits) {
    if (e.create !== undefined) { files.set(e.path, e.create); continue; }
    const text = files.get(e.path) ?? "";
    if (!text.includes(e.find ?? "")) throw new Error(`edit not applicable: ${e.path}`);
    files.set(e.path, text.replace(e.find ?? "", e.replace ?? ""));
  }
  const fake = new FakeFiles();
  const listings = new Map<string, string[]>();
  for (const [path, content] of files) {
    fake.files.set(`${WORKSPACE}/${path}`, content);
    const slash = path.lastIndexOf("/");
    const dir = `${WORKSPACE}/${path.slice(0, slash)}`;
    listings.set(dir, [...(listings.get(dir) ?? []), path.slice(slash + 1)]);
  }
  fake.listings = listings;
  return fake;
}
