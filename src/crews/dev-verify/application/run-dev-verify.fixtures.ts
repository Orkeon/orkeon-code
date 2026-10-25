// The demo plan folder runDevVerify reads over FakeFiles, FakeShell, FakeLlm and a config store on FakeFiles,
// whose gate is green; the auditor's answers, the earlier verdicts a resume reads, the doubles wrapped for one
// test (the validation slot, the code index, the harvest, a verdict that cannot be written) and the refusals.
import { FakeCostIndex } from "../../../../tests/support/fake-cost-index.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";
import { FakeShell } from "../../../../tests/support/fake-shell.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { GIT_TOPLEVEL } from "../../../shared/application/dev/resolve-work-folder.ts";
import { ORKEON_IGNORE_PROBE, checkIgnoreCommand } from "../../../shared/application/dev/load-dev-context.ts";
import type { ScriptToolSlot } from "../../../shared/application/dev/script-tool-slot.ts";
import { COST_NOT_WIRED, costSummary } from "../../../shared/domain/dev/access-cost.ts";
import { AUDIT_UNFINISHED_GAP } from "../../../shared/domain/dev/verdict-format.ts";
import { excludePathspecs, gitMethodGrep } from "../domain/commands.ts";
import type { ValidationRunner } from "./audit.ts";
import { runDevVerify } from "./run-dev-verify.ts";
import type { DevVerifyInputs } from "./run-dev-verify.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

export const DIR = `${WORKSPACE}/workbench/demo`;
export const VERDICT = `${DIR}/DEMO-VERIFY-F2.md`;
const EX = "':(exclude,glob)**/bin/**' ':(exclude,glob)**/obj/**'";
const UNTRACKED = `git ls-files --others --exclude-standard -- . ${EX}`;
const TRAIT_GREP = `git grep --untracked -I -noE -e '\\[Trait\\("BR", *"[BCU][CHR]-[0-9]+"\\)\\]' -- src tests ${EX}`;
export const PACK = "layout:\n  domain: src\n  tests: tests\n  build_outputs: [bin, obj]\ncommands:\n  test: npm test\n" +
  "  test_class: node --test <file>\ntests:\n  rule_trait: BR\ncontrib:\n  commit: conventional commits\n";
export const SHEET = "# DEMO-PLAN-F2 — Command\n| Applied rules | DDD-01 |\n## TDD sequence\n| # | Test |\n|---|---|\n" +
  "| 1 | `ShowsTheState` BR-01 |\nTDD: RED [x] GREEN [x] COST [x]\n";
const PLAN = "# DEMO-PLAN\nNon-applicable rules: DDD-02 DDD-03 DDD-04 DDD-05 DDD-06 DDD-07 DDD-08 DDD-09 DDD-10 DDD-11 " +
  "APP-01 APP-02 APP-03 APP-04 APP-05 PERF-01\n";
export const GREEN_LINE = "GATE — batch F2: GREEN";
export const COST_LINE = costSummary(COST_NOT_WIRED);
export const GATE_ONLY_LINE = "dev-verify: --gate-only: the gate alone, no capture and no audit";
export const TARGET = "batch F2 — sheet workbench/demo/DEMO-PLAN-F2.md — mode fast — work folder workbench/ (default)";
/** The validation the auditor runs through run_validation. */
export const VALIDATION = "node --test tests/a.test.ts";

export function setup() {
  const files = new FakeFiles();
  files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, PACK);
  files.files.set(`${DIR}/DEMO-PLAN-F2.md`, SHEET);
  files.files.set(`${DIR}/DEMO-PLAN.md`, PLAN);
  files.files.set(`${WORKSPACE}/tests/a.test.ts`, "describe(\"ShowsTheState\", () => {});\n");
  files.listings.set(WORKSPACE, ["workbench", "src", "tests"]);
  files.listings.set(`${WORKSPACE}/workbench`, ["demo"]);
  files.listings.set(DIR, ["DEMO-PLAN-F2.md", "DEMO-PLAN.md"]);
  const shell = new FakeShell();
  shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}\n` };
  shell.results["git diff --name-only HEAD"] = { stdout: "src/a.ts\nworkbench/demo/DEMO-PLAN-F2.md\n" };
  shell.results[UNTRACKED] = { stdout: "tests/a.test.ts\n" };
  shell.results[TRAIT_GREP] = { stdout: 'tests/a.test.ts:3:[Trait("BR", "BR-01")]\n' };
  shell.results[checkIgnoreCommand([ORKEON_IGNORE_PROBE, "workbench/"])] = { stdout: ".orkeon/config.json\nworkbench/\n" };
  shell.results[gitMethodGrep(["ShowsTheState"], ["tests"], excludePathspecs(["bin", "obj"])) ?? ""] =
    { stdout: "tests/a.test.ts:1:ShowsTheState\n" };
  const llm = new FakeLlm();
  const config = createConfigStore({ files, session: new FakeSessionStore() });
  const deps = { files, shell, llm, config, log: new FakeLogger(), clock: () => new Date(2026, 9, 22, 14, 5) };
  return { files, shell, llm, deps };
}

export type Setup = ReturnType<typeof setup>;

export const run = (deps: Setup["deps"], input: DevVerifyInputs) => runDevVerify(input, deps);

export const MINOR = { severity: "Minor", axis: "Simplification", gap: "a loop could be a map", evidence: "src/a.ts:4", fix: "use map" };
export const MAJOR = { severity: "Major", axis: "Reuse", gap: "parses dates by hand", evidence: "src/a.ts:9", fix: "call the parser" };
export const answer = (rows: unknown[], validations: string[] = []) => ({ verdict: rows.length ? "GAPS" : "VALID", rows, validations });

/** Makes every act of `llm` first run `command` through the runner `slot` holds, as run_validation's body does;
 * the reports land in the array returned ("unbound" when the slot holds none). */
export function runValidationOnAct(llm: FakeLlm, slot: ScriptToolSlot<ValidationRunner>, command: string): unknown[] {
  const reports: unknown[] = [];
  const act = llm.act.bind(llm);
  llm.act = async (prompt, request) => {
    const bound = slot.get();
    reports.push(bound === undefined ? "unbound" : (await bound.run(command)).report);
    return act(prompt, request);
  };
  return reports;
}

export const MEASURED = "Cost: 1 read + 0 writes through ports outside loops; in a loop, a lambda or a memory filter: none";

/** A code index measuring one port read in src/a.ts. */
export function measuringCostIndex(): FakeCostIndex {
  const costIndex = new FakeCostIndex();
  costIndex.report = {
    members: [{
      member: `${WORKSPACE}/src/a.ts::show`,
      portCalls: [{ receiver: "this.store", method: "load", line: 2, inLoop: false, inLambda: false }],
      memoryFilters: [], cost: { reads: 1, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 },
    }],
    cost: { reads: 1, writes: 0, loops: 0, lambdas: 0, memoryFilters: 0 },
  };
  return costIndex;
}

export const HARVEST_LINE = "shared memory: 1 mistake candidate harvested from the audits (x) → /memory-admit decides each one.";

/** A harvest returning HARVEST_LINE; `seen` records the folder of each call and whether the verdict was written then. */
export function recordingHarvest(files: FakeFiles) {
  const seen: Array<{ folder: string; verdict: boolean }> = [];
  const harvest = async (work: { folder: string; vfsPath: string | null }) => {
    seen.push({ folder: work.folder, verdict: files.files.has(VERDICT) });
    return [HARVEST_LINE];
  };
  return { harvest, seen };
}

/** A harvest counting its calls in `calls.count`. */
export function countingHarvest() {
  const calls = { count: 0 };
  const harvest = async () => { calls.count++; return ["x"]; };
  return { harvest, calls };
}

/** Makes the write of the verdict fail on a read-only mount; every other write lands. */
export function failVerdictWrite(files: FakeFiles): void {
  const write = files.write.bind(files);
  files.write = async (path, content) => {
    if (path === VERDICT) throw new Error("read-only mount\nmore");
    await write(path, content);
  };
}

export const EARLIER = "# DEMO-VERIFY-F2 — 2026-10-21 09:40 — fast\n\n## Verdict — GAPS\n\n" +
  "| Severity | Axis | Gap | Evidence | Expected fix |\n|----------|------|-----|----------|--------------|\n" +
  "| Major | reuse | parses dates by hand | src/a.ts:9 | call the parser |\n\nValidations: none — the capture's build and last test run stand\n";

export const UNFINISHED = "# DEMO-VERIFY-F2 — 2026-10-21 10:10 — resume\n\n## Verdict — GAPS\n\n" +
  "| Severity | Axis | Gap | Evidence | Expected fix |\n|----------|------|-----|----------|--------------|\n" +
  `| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | tokens: spent — capture-F2/auditor-replies.txt | audit again |\n`;

/** A second plan folder with a sheet for F2. */
function severalSheets(f: Setup): void {
  f.files.listings.set(`${WORKSPACE}/workbench`, ["demo", "other"]);
  f.files.listings.set(`${WORKSPACE}/workbench/other`, ["OTHER-PLAN-F2.md"]);
}

/** A plan and its F2 sheet under .claude/, outside the work folder. */
export function planOutsideWorkFolder(f: Setup): void {
  f.files.files.set(`${WORKSPACE}/.claude/x/X-PLAN.md`, "# X-PLAN\n");
  f.files.files.set(`${WORKSPACE}/.claude/x/X-PLAN-F2.md`, SHEET);
}

export interface RefusalCase {
  name: string;
  arrange: (f: Setup) => void;
  input: DevVerifyInputs;
  expected: string;
}

const nothing = (): void => {};

export const REFUSAL_CASES: RefusalCase[] = [
  {
    name: `refuses a work tree whose top is not ${WORKSPACE}`,
    arrange: (f) => { f.shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}/sub\n` }; },
    input: { batch: "F2" },
    expected: `dev-verify: the git work tree is ${WORKSPACE}/sub, not ${WORKSPACE}: run Orkeon Code at the top of the repository`,
  },
  {
    name: "refuses to run outside a git work tree",
    arrange: (f) => { f.shell.results[GIT_TOPLEVEL] = { exitCode: 128, stdout: "" }; },
    input: { batch: "F2" },
    expected: "dev-verify: not inside a git work tree",
  },
  {
    name: "refuses several sheets for one batch",
    arrange: severalSheets,
    input: { batch: "F2" },
    expected: "dev-verify: several sheets for F2: workbench/demo/DEMO-PLAN-F2.md, workbench/other/OTHER-PLAN-F2.md: " +
      "name the plan, e.g. /dev-verify F2 <code>",
  },
  {
    name: "refuses a batch no plan folder has a sheet for",
    arrange: severalSheets,
    input: { batch: "F9" },
    expected: "dev-verify: no workbench/*/*-PLAN-F9.md: name the plan, e.g. /dev-verify F9 <code>",
  },
  {
    name: "refuses a batch the plan named has no sheet for",
    arrange: severalSheets,
    input: { batch: "F9", plan: "demo" },
    expected: "dev-verify: workbench/demo/ holds no *-PLAN-F9.md",
  },
  {
    name: "refuses a plan path without the batch's sheet beside it",
    arrange: nothing,
    input: { batch: "F3", plan: "workbench/demo/DEMO-PLAN.md" },
    expected: "dev-verify: no workbench/demo/DEMO-PLAN-F3.md beside workbench/demo/DEMO-PLAN.md",
  },
  {
    name: "refuses a plan path climbing out with ..",
    arrange: nothing,
    input: { batch: "F2", plan: "../demo/DEMO-PLAN.md" },
    expected: "dev-verify: '../demo/DEMO-PLAN.md' is neither a code nor a <CODE>-PLAN.md path",
  },
  {
    name: "refuses a plan path that is not written under the work folder as is",
    arrange: planOutsideWorkFolder,
    input: { batch: "F2", plan: "workbench/./demo/DEMO-PLAN.md" },
    expected: "dev-verify: 'workbench/./demo/DEMO-PLAN.md' is not under the work folder workbench/",
  },
  {
    name: "refuses a batch that is not F<n>",
    arrange: nothing,
    input: { batch: "2" },
    expected: "dev-verify: the input batch must be F<n>, e.g. F2",
  },
  {
    name: "refuses a mode other than fast, full or resume",
    arrange: nothing,
    input: { batch: "F2", mode: "slow" },
    expected: "dev-verify: the input mode must be fast, full or resume",
  },
];
