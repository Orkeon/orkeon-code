// /dev-implement F<n>: the steps of one batch sheet, each as RED by the test author then GREEN by
// the implementer, two acts of the crew's one agent with their own tools and rules. Consecutive
// steps on one test file are one cycle: every RED first, then one GREEN and one Cost for them all.
// Code makes each brief from the sheet, observes the tree before and after each act, runs the
// tests itself, measures the cost of what changed, and ticks a box only once what it stands for was
// seen. After the last cycle the batch's files are refreshed in the code index, then the build, then
// the whole suite once per batch (the affected projects after, the sheet's and the graph's), run as
// shell jobs and write the logs /dev-verify reads; a batch all ticked and green hands
// over to /dev-verify (the `next` of its answer, `resume` after a GAPS verdict). A correction
// (`— correction: <finding>`) is first appended to the sheet as a new step. Any failed check stops
// the batch with BLOCKED and ticks nothing more.
//
// The answer is JSON: `{ lines, next? }`, read by the command's `completed`.
import type { AffectedTests, CostIndex, Files, Llm, Logger, Shell, ShellJobs } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { PullRequestOpener } from "../../../shared/application/git/commit-files.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { createWrappedTools } from "../../../shared/application/dev/wrapped-tools.ts";
import { measureAccessCost } from "../../../shared/application/dev/measure-access-cost.ts";
import type { CostFile } from "../../../shared/application/dev/measure-access-cost.ts";
import { addedLines, INDEX_ROOT } from "../../../shared/domain/dev/access-cost.ts";
import { hasTestLayout, isTestPath } from "../../../shared/domain/dev/test-paths.ts";
import { isUnfinishedSection, lastVerdict, parseVerdictFile } from "../../../shared/domain/dev/verdict-format.ts";
import { shellQuote } from "../../../shared/domain/git/close.ts";
import type { CarriedText } from "../../../shared/domain/dev/carried-text.ts";
import { tidyWhitespace } from "../../../shared/domain/dev/whitespace.ts";
import type { WrappedRun, WrappedTools } from "../../../shared/application/dev/wrapped-tools.ts";
import { stepRules } from "../../../shared/domain/dev/step-rules.ts";
import { policyFor } from "../../../shared/domain/agent-policy/mode-policy.ts";
import { parseSessionRules } from "../../../shared/domain/git/pull-request.ts";
import { shellRuleGuard } from "../../../shared/domain/dev/tool-guards.ts";
import type { RepoPack, RepoPackLayout } from "../../../shared/domain/dev/repo-pack.ts";
import { testFileOf, greenContract, projectCommandFor, redContract, stubsOf, testCommandFor } from "../domain/contracts.ts";
import { openSteps, parseImplementSheet } from "../domain/step-section.ts";
import type { ImplementSheet, ImplementStep } from "../domain/step-section.ts";
import { addedFailure, changedPaths, failureCount, greenProblem, readCost, redProblem, under } from "../domain/step-checks.ts";
import { cyclesLine, cyclesOf, stepsLabel } from "../domain/cycles.ts";
import type { Cycle } from "../domain/cycles.ts";
import { addCorrection } from "../domain/correction.ts";
import { addAssumptions, assumptionsOf } from "../domain/sheet-edits.ts";
import type { ObservedRun } from "../domain/step-checks.ts";
import { tickBox } from "../domain/sheet-ticks.ts";
import type { TddBox } from "../domain/sheet-ticks.ts";
import { IMPLEMENTER, TEST_AUTHOR } from "../domain/roles.ts";
import type { RoleName } from "../domain/roles.ts";
import { SLICE_SECONDS, SUITE_LIMIT_SECONDS } from "../domain/implement-budget.ts";
import { askLine, runRole } from "./run-role.ts";
import { NOTHING_RECALLED, noPrecedents, precedentsLine, recallQuery, sheetTitle } from "../../../shared/application/dev/step-precedents.ts";
import type { Recalled, StepPrecedents } from "../../../shared/application/dev/step-precedents.ts";
import { snapshot } from "./observe.ts";
import { logText, NO_VERDICT_EXIT, runSuite } from "./suite-job.ts";
import { locateSheet, WORKSPACE } from "./locate-sheet.ts";
import type { LocatedSheet } from "./locate-sheet.ts";
import { prContextOf, readTouchedRecord, recordTouched, verdictMarkOf } from "./touched.ts";
import type { PrContext } from "./touched.ts";
import { closeDevBatch } from "./close.ts";
import { BATCHES_ACTIVE_RECORD, batchesRunCode } from "../../../shared/domain/dev/batches-state.ts";

export interface DevImplementInputs {
  batch?: unknown; plan?: unknown; close?: unknown; pr?: unknown; push?: unknown;
  /** The finding of a correction (`— correction: <finding>`): appended to the sheet as a new step first. */
  correction?: unknown;
  /** The session's mode and rules at the launch: a read-only mode is refused, a deny on the push keeps the commit local. */
  permissionMode?: unknown; permissionRules?: unknown;
  /** Whether the github tool is registered (the close opens the pull request itself). */
  githubTool?: unknown;
  /** Carried to the audit the run chains: the /hooks registry, the /effort level, and `memoryRecall: false`. */
  hooks?: unknown; effort?: unknown; memoryRecall?: unknown;
}

const flag = (v: unknown): boolean => v === true || v === "true";

/** The crew's inputs as the run reads them. `push: false` is kept: /dev-batches sends it on every batch's close, so
 *  that the plan's branch is pushed once, at the run's own close (L-7); any other value pushes, as before. */
export function implementInputs(args: Record<string, unknown>): DevImplementInputs {
  return {
    batch: args.batch, plan: args.plan, close: flag(args.close), pr: flag(args.pr), correction: args.correction,
    push: args.push === false || args.push === "false" ? false : undefined,
    permissionMode: args.permissionMode, permissionRules: args.permissionRules, githubTool: args.githubTool,
    hooks: args.hooks, effort: args.effort, memoryRecall: args.memoryRecall,
  };
}

export interface DevImplementDeps {
  files: Files; shell: Shell; config: Pick<ConfigStore, "readValue">; jobs: ShellJobs;
  /** A role's Llm, built with that role's callbacks over the pack's layout; `wrote` hears the path of each
   *  file_write or edit_file call those callbacks let through; `writable` names the paths the role's own denies
   *  leave open (the test author's stubs). */
  roleLlm(role: RoleName, layout: RepoPackLayout, wrote: (path: string) => void, writable: readonly string[]): Pick<Llm, "act">;
  log: Logger;
  /** The slot run_tests and run_build read: bound to this run's wrapped tools. */
  toolSlot?: { bind(tools: WrappedTools): () => void };
  /** The close's pull-request opener, for the context read at the launch; none: the command is handed over. */
  openerFor?(context: PrContext): PullRequestOpener | undefined;
  /** The code index the measured cost reads, refreshed after the batch, and asked for the affected tests; none: the
   *  cost is not computed (the stated line decides) and the affected tests are the sheet's. */
  costIndex?: CostIndex;
  /** Today, `YYYY-MM-DD` (the close's done marks). */
  today?: () => string;
  /** The shared memory's code-triggered recall (T3 before each red act, T5 on a correction); absent, none. */
  precedents?: StepPrecedents;
}

export interface ImplementAnswer {
  lines: string[];
  next?: { crew: "dev-verify"; input: { batch: string; plan: string; mode: "fast" | "resume"; hooks?: unknown; effort?: unknown; memoryRecall?: false } };
}

const RESTORE_TIMEOUT_SECONDS = 900;
const BATCH = /^F\d+$/;
const GAPS_ROUNDS_WARNED = 2;

const answer = (lines: string[], next?: ImplementAnswer["next"]): string =>
  JSON.stringify(next === undefined ? { lines } : { lines, next });
const blocked = (lines: string[], line: string): string => answer([...lines, `BLOCKED — ${line}`]);
const reasonOf = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];
const isoToday = (): string => new Date().toISOString().slice(0, 10);

interface Run {
  deps: DevImplementDeps;
  pack: RepoPack;
  isTest: (path: string) => boolean;
  located: LocatedSheet;
  sheetPath: string;
  sheetText: string;
  sheet: ImplementSheet;
  tools: WrappedTools;
  wrote: (path: string) => void;
  /** Folders whose writes are code's own (the work folder, the plan folder): never a role's change. */
  ownFolders: string[];
  /** The plan folder, relative to /workspace, and its logs folder, the one part of it a role's runs write. */
  planFolder: string;
  planLogs: string;
  logFolder: string;
  /** The paths the running act's write tools named, relative to /workspace. */
  written: Set<string>;
  verdictMark: string;
  touched: Set<string>;
  /** The steps this run ran an act of: the affected projects. */
  ran: ImplementStep[];
  lines: string[];
  /** T5: the mistakes recalled for the correction this run carries, in each role's prompt; every recall, for the end. */
  correction: Recalled;
  recalled: Recalled[];
}

/** A role's prompt with the precedents recalled for it, each block after the contract. */
function withPrecedents(prompt: string, recalled: readonly Recalled[]): string {
  const blocks = recalled.map((r) => r.block.trimEnd()).filter((b) => b !== "");
  return blocks.length === 0 ? prompt : [prompt.trimEnd(), ...blocks].join("\n\n");
}

/** T3, before a step's red act: the code structures and mistakes recalled from the sheet's title, the step's title
 *  and the paths it touches. */
async function recallForRed(run: Run, step: ImplementStep): Promise<Recalled> {
  const paths = [...(step.anchor?.testFiles ?? []), ...(step.anchor?.production ?? [])].map((a) => a.path);
  const recalled = await (run.deps.precedents ?? noPrecedents)("T3", recallQuery([sheetTitle(run.sheetText), step.title, ...paths]));
  run.recalled.push(recalled);
  return recalled;
}

function observedRun(run: WrappedRun): ObservedRun {
  return run.ok ? { ran: true, exit: run.exit, timedOut: run.timedOut, log: run.log } : { ran: false, reason: run.refused };
}

async function writeSheet(run: Run, text: string): Promise<string | null> {
  try {
    await run.deps.files.write(run.sheetPath, text);
  } catch (e) {
    return `the sheet could not be written: ${reasonOf(e)}`;
  }
  run.sheetText = text;
  return null;
}

async function tick(run: Run, step: ImplementStep, box: TddBox): Promise<string | null> {
  const ticked = tickBox(run.sheetText, step.number, box);
  if (!ticked.ok) return ticked.problem;
  return writeSheet(run, ticked.text);
}

/** Ticks `box` on every step, in order; the first problem stops. */
async function tickAll(run: Run, steps: readonly ImplementStep[], box: TddBox): Promise<string | null> {
  for (const step of steps) {
    const failed = await tick(run, step, box);
    if (failed !== null) return failed;
  }
  return null;
}

/** The `Assumption:` lines of a role's answer, written under `## Assumptions` once each. */
async function keepAssumptions(run: Run, text: string): Promise<void> {
  const { text: next, added } = addAssumptions(run.sheetText, assumptionsOf(text));
  if (added.length === 0) return;
  const failed = await writeSheet(run, next);
  run.lines.push(failed === null
    ? `assumption${added.length === 1 ? "" : "s"} written to ## Assumptions, to be validated by the user: ${added.join("; ")}`
    : `⚠ assumptions not written (${failed}): ${added.join("; ")}`);
}

/** A path a write tool named, relative to /workspace. */
export function workspacePath(path: string): string {
  return path.trim().replace(/^\/workspace\//, "").replace(/^(\.\/)+/, "").replace(/\/+$/, "");
}

/** Puts the sheet back as code last wrote it; a problem when it cannot. */
async function sheetPutBack(run: Run): Promise<string | null> {
  let now: string | null = null;
  try {
    now = await run.deps.files.read(run.sheetPath);
  } catch {
    now = null;
  }
  if (now === run.sheetText) return null;
  try {
    await run.deps.files.write(run.sheetPath, run.sheetText);
    return "the sheet was changed by the role, and put back";
  } catch (e) {
    return `the sheet was changed by the role and could not be put back: ${reasonOf(e)}`;
  }
}

/** One act of a role, between two snapshots: the paths it changed, or why not. A path is the role's when its
 *  write tools named it and the tree shows it changed (or it is too large to read); what its runs of run_tests
 *  or run_build produced is not. Any change to the plan folder but its logs stops the step, the sheet put back. */
async function act(
  run: Run, role: RoleName, prompt: string, writable: readonly string[] = [],
): Promise<{ text: string; changed: string[] } | string> {
  const before = await snapshot(run.deps);
  if (!before.ok) return before.problem;
  const spec = role === "test-author" ? TEST_AUTHOR : IMPLEMENTER;
  run.written.clear();
  const said = await runRole(run.deps.roleLlm(role, run.pack.layout, run.wrote, writable), spec, prompt);
  const after = await snapshot(run.deps);
  const seen = after.ok ? new Set(changedPaths(before.snapshot, after.snapshot)) : new Set<string>();
  const planChanges = [...new Set([...seen, ...run.written])]
    .filter((p) => under(p, run.planFolder) && !under(p, run.planLogs)).sort();
  const putBack = await sheetPutBack(run);
  if (planChanges.length > 0 || putBack !== null) {
    return `${role} changed the plan folder (${planChanges.join(", ") || run.located.name}): the sheet and the plan are code's own${putBack === null ? "" : `; ${putBack}`}`;
  }
  if (!said.ok) return said.reason;
  if (!after.ok) return after.problem;
  const unread = (p: string): boolean => after.snapshot.get(p) === null;
  const changed = [...run.written]
    .filter((p) => seen.has(p) || unread(p))
    .filter((p) => !run.ownFolders.some((f) => under(p, f)))
    .sort();
  await keepAssumptions(run, said.text);
  await tidyChanged(run, changed);
  return { text: said.text, changed };
}

/** The whitespace `git diff --check` would refuse, put right in the files the role changed: a node insert at the
 *  end of a module leaves a blank line after the last member, and the gate would stop the batch for it. */
async function tidyChanged(run: Run, changed: readonly string[]): Promise<void> {
  for (const path of changed) {
    let text: string;
    try {
      text = await run.deps.files.read(`${WORKSPACE}/${path}`);
    } catch {
      continue;
    }
    const tidy = tidyWhitespace(text);
    if (tidy.fixed.length === 0) continue;
    try {
      await run.deps.files.write(`${WORKSPACE}/${path}`, tidy.text);
      run.lines.push(`whitespace ✓ — ${path}: ${tidy.fixed.join(", ")}`);
    } catch (error) {
      run.lines.push(`⚠ whitespace — ${path}: ${tidy.fixed.join(", ")}, not written (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
    }
  }
}

function contractInput(run: Run, step: ImplementStep, testCommand: string, carried: readonly CarriedText[], cycle?: readonly ImplementStep[]) {
  return {
    code: run.located.code, sheetPath: `${run.located.dir}/${run.located.name}`, sheet: run.sheet, step,
    ...(cycle === undefined ? {} : { cycle }), layout: run.pack.layout, testCommand, carried,
  };
}

/** What a role's brief carries: the sheet, then each of `paths` that exists (a test file; one to create is left out). */
async function carriedFor(run: Run, paths: readonly (string | null)[]): Promise<CarriedText[]> {
  const out: CarriedText[] = [{ title: `${run.located.dir}/${run.located.name}`, text: run.sheetText }];
  for (const path of new Set(paths)) {
    if (path === null) continue;
    try {
      out.push({ title: path, text: await run.deps.files.read(`${WORKSPACE}/${path}`) });
    } catch {
      // To create, or unreadable: the role's own.
    }
  }
  return out;
}

/** The lines `git diff -U0` adds to each changed production file; an untracked file (no diff), or one whose diff
 *  cannot be read, counts whole. */
async function costFiles(run: Run, paths: readonly string[]): Promise<CostFile[]> {
  const out: CostFile[] = [];
  for (const path of paths) {
    let added: Set<number> | null = null;
    try {
      const r = await run.deps.shell.run(`git diff -U0 HEAD -- ${shellQuote(path)}`);
      if (r.exitCode === 0 && r.stdout.trim() !== "") added = addedLines(r.stdout);
    } catch {
      added = null;
    }
    out.push({ path, added });
  }
  return out;
}

/** The measured cost of the cycle's production changes, after its stated Cost line passed: a problem when the
 *  measure flags a port call or a memory filter on an added line; else the line it adds to the run's. */
async function measuredCost(run: Run, production: readonly string[]): Promise<{ problem: string } | { line: string }> {
  if (production.length === 0) return { line: "measured: not computed — no production file changed in this run" };
  const cost = await measureAccessCost(run.deps.costIndex, run.pack, [], await costFiles(run, production), run.isTest);
  if (cost.state === "not-computed") return { line: `measured: not computed — ${cost.reason}` };
  if (cost.exit === 2) {
    return { problem: `measured ${cost.costLine}; flagged: ${cost.flagged.join("; ")} — back to /dev-plan (the design names the access, the code cannot move it)` };
  }
  return { line: `measured: ${cost.costLine}` };
}

/** The step's `to create` production paths that are still to create: neither written in this run nor present in the
 *  tree. A path an earlier GREEN implemented is never a stub again. */
async function openStubs(run: Run, step: ImplementStep): Promise<string[]> {
  const out: string[] = [];
  for (const path of stubsOf(step)) {
    if (run.touched.has(path)) continue;
    try {
      await run.deps.files.read(`${WORKSPACE}/${path}`, 1);
    } catch {
      out.push(path);
    }
  }
  return out;
}

/** The failures each RED-ticked step of the batch left, by step number: a rerun's baseline (`<batch>-red-failures.json`
 *  in the logs folder). Unreadable, it is empty. */
const redCountsPath = (run: Run): string => `${run.logFolder}/${run.sheet.batch}-red-failures.json`;

async function readRedCounts(run: Run): Promise<Record<string, number>> {
  try {
    const parsed = JSON.parse(await run.deps.files.read(redCountsPath(run))) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((e): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) >= 0));
  } catch {
    return {};
  }
}

/** Records the failures a ticked RED left; a count the tail does not show, or a write that fails, records nothing
 *  (a rerun then takes the suite's own run as its baseline). */
async function recordRedCount(run: Run, step: ImplementStep, count: number | null): Promise<void> {
  if (count === null) return;
  const counts = { ...await readRedCounts(run), [String(step.number)]: count };
  try {
    await run.deps.files.write(redCountsPath(run), `${JSON.stringify(counts)}\n`);
  } catch {
    // the record is a help to a rerun, never a verdict
  }
}

async function runCycle(run: Run, cycle: Cycle): Promise<string | null> {
  const steps = cycle.steps;
  const label = stepsLabel(steps);
  const command = testCommandFor(run.pack.commands, steps[0]);
  if (!command.ok) return `${label}: ${command.reason}`;
  const production = new Set<string>();

  const toRed = steps.filter((s) => !s.tdd?.red);
  // A rerun after BLOCKED: a step of the cycle is RED-ticked already and its tests fail. One run before the first new
  // RED is the baseline its tests must add a failure to, as the run of that step would have been. The tests the
  // BLOCKED step wrote before it stopped fail in that run too: the count the last ticked step recorded, when lower,
  // is the baseline.
  let red: WrappedRun | null = null;
  let before: string | number | null = null;
  if (toRed.length > 0 && toRed.length < steps.length) {
    red = await run.tools.runTests({ command: command.command });
    const ticked = steps.filter((s) => s.tdd?.red).at(-1);
    const recorded = ticked === undefined ? undefined : (await readRedCounts(run))[String(ticked.number)];
    const observed = red.ok ? failureCount(red.tail) : null;
    before = recorded !== undefined && observed !== null && recorded < observed ? recorded : red.ok ? red.tail : null;
  }
  // A stub a RED of this cycle wrote stays open to its later REDs, this run's or a rerun's: the cycle's GREEN, the only
  // one that fills it, has not run.
  const stubbed = new Set(steps.filter((s) => s.tdd?.red).flatMap(stubsOf).filter((p) => run.touched.has(p)));
  for (const step of toRed) {
    const stubs = [...new Set([...await openStubs(run, step), ...stubbed])];
    const t3 = await recallForRed(run, step);
    const carried = await carriedFor(run, [testFileOf(step)]);
    const done = await act(run, "test-author", withPrecedents(redContract({ ...contractInput(run, step, command.command, carried), stubs }), [t3, run.correction]), stubs);
    if (typeof done === "string") return `step ${step.number} RED: ${done}`;
    run.ran.push(step);
    const earlier = before;
    red = await run.tools.runTests({ command: command.command });
    const problem = redProblem(done.changed, run.isTest, observedRun(red), stubs);
    if (problem !== null) return `step ${step.number} RED: ${problem}${logOf(red)}`;
    // A later step of the cycle: its file failed already, so its own tests must add a failure.
    const added = earlier !== null && red.ok ? addedFailure(earlier, red.tail) : "ok";
    if (typeof added === "object") return `step ${step.number} RED: ${added.problem}${logOf(red)}`;
    done.changed.forEach((p) => { run.touched.add(p); if (!run.isTest(p)) production.add(p); });
    const failed = await tick(run, step, "RED");
    if (failed !== null) return `step ${step.number} RED: ${failed}`;
    before = red.ok ? red.tail : null;
    await recordRedCount(run, step, red.ok ? failureCount(red.tail) : null);
    const wroteStubs = done.changed.filter((p) => !run.isTest(p));
    wroteStubs.forEach((p) => stubbed.add(p));
    const unchecked = added === "unknown" ? " (its own failure not checked: the run's tail shows no failure count)" : "";
    run.lines.push(`step ${step.number} RED ✓ — ${done.changed.filter(run.isTest).join(", ")}${wroteStubs.length === 0 ? "" : ` (stubs: ${wroteStubs.join(", ")})`}${unchecked}`);
  }

  let costText: string | null = null;
  const green = steps.filter((s) => !s.tdd?.green);
  if (green.length > 0) {
    red ??= await run.tools.runTests({ command: command.command });
    const redTail = red.ok ? { tail: red.tail, log: red.log } : { tail: `(not run: ${red.refused})`, log: null };
    const greenLabel = stepsLabel(green);
    const carried = await carriedFor(run, green.map(testFileOf));
    const done = await act(run, "implementer", withPrecedents(greenContract(contractInput(run, green[0], command.command, carried, green), redTail), [run.correction]));
    if (typeof done === "string") return `${greenLabel} GREEN: ${done}`;
    run.ran.push(...green.filter((s) => !run.ran.includes(s)));
    const after = await run.tools.runTests({ command: command.command });
    const problem = greenProblem(done.changed, run.isTest, observedRun(after), observedRun(red));
    if (problem !== null) return `${greenLabel} GREEN: ${problem}${logOf(after)}`;
    done.changed.forEach((p) => { run.touched.add(p); production.add(p); });
    const failed = await tickAll(run, green, "GREEN");
    if (failed !== null) return `${greenLabel} GREEN: ${failed}`;
    run.lines.push(`${greenLabel} GREEN ✓ — ${done.changed.join(", ") || "no file changed"}`);
    costText = done.text;
  }

  const costed = steps.filter((s) => !s.tdd?.cost);
  if (costed.length > 0) {
    const costLabel = stepsLabel(costed);
    let cost = readCost(costText ?? "");
    if (!cost.ok && cost.line === undefined) {
      const asked = await askLine(run.deps.roleLlm("implementer", run.pack.layout, run.wrote, []), IMPLEMENTER,
        `${label[0].toUpperCase()}${label.slice(1)} of ${run.located.code} ${run.sheet.batch}: answer with one line only, ` +
        "`Cost: <reads> reads, <writes> writes; <where a port call sits in a loop, a lambda or a memory filter, or none>`.");
      if (!asked.ok) return `${costLabel} COST: ${asked.reason}`;
      cost = readCost(asked.text);
    }
    if (!cost.ok) return `${costLabel} COST: ${cost.problem}`;
    const measured = await measuredCost(run, [...production].sort());
    if ("problem" in measured) return `${costLabel} COST: ${measured.problem}`;
    const failed = await tickAll(run, costed, "COST");
    if (failed !== null) return `${costLabel} COST: ${failed}`;
    run.lines.push(`${costLabel} COST ✓ — ${cost.line}; ${measured.line}`);
  }
  return null;
}

function logOf(run: WrappedRun): string {
  return run.ok && run.log !== null ? ` (log: ${run.log.replace(`${WORKSPACE}/`, "")})` : "";
}

const shownPath = (path: string | null): string => (path === null ? "" : ` (log: ${path.replace(`${WORKSPACE}/`, "")})`);

/** The pack's restore, once, before any act: true when it ran green, null when the pack has none. */
async function restore(
  run: Pick<Run, "deps" | "pack" | "logFolder" | "lines">, batch: string,
): Promise<{ problem: string } | { restored: boolean }> {
  const command = run.pack.commands.restore?.trim();
  if (!command) return { restored: false };
  const refusal = shellRuleGuard(stepRules("dev-implement"))(command);
  if (refusal !== null) return { problem: `restore: ${refusal}` };
  let r;
  try {
    r = await run.deps.shell.run(command, { timeoutSeconds: RESTORE_TIMEOUT_SECONDS });
  } catch (e) {
    return { problem: `restore: '${command}' could not run: ${reasonOf(e)}` };
  }
  const log = `${run.logFolder}/${batch}-restore.txt`;
  const output = [r.stdout.trimEnd(), r.stderr.trimEnd()].filter((t) => t !== "").join("\n");
  try {
    await run.deps.files.write(log, logText(command, r.timedOut === true ? [`still running after ${RESTORE_TIMEOUT_SECONDS} s: no verdict`] : [], output, r.timedOut === true ? NO_VERDICT_EXIT : r.exitCode));
  } catch {
    // the log is a help, never a verdict
  }
  if (r.timedOut === true) return { problem: `restore: '${command}' still running after ${RESTORE_TIMEOUT_SECONDS} s` };
  if (r.exitCode !== 0) return { problem: `restore: '${command}' exited ${r.exitCode}${shownPath(log)}` };
  run.lines.push(`restored once: ${command}`);
  return { restored: true };
}

type SuiteResult = { problem: string } | { ok: true; whole: boolean };

async function oneSuite(run: Run, label: string, command: string, log: string | null) {
  return runSuite(
    { jobs: run.deps.jobs, shell: run.deps.shell, files: run.deps.files },
    { label, command, log, limitSeconds: SUITE_LIMIT_SECONDS, sliceSeconds: SLICE_SECONDS },
  );
}

/** The affected tests: `commands.test_project` once per distinct Project cell of the steps this run ran (of every
 *  step when it ran none), then once per test project the graph adds, their logs written together to
 *  `F<n>-test-affected.txt`. Null when the sheet's cannot be named; a graph project that cannot be is left out, and named. */
function affectedCommands(
  run: Run, graph: readonly string[] = [],
): { commands: string[]; fromGraph: string[]; leftOut: string[] } | null {
  if (!run.pack.commands.testProject?.trim()) return null;
  const steps = run.ran.length > 0 ? run.ran : run.sheet.steps.filter((s) => s.tdd !== null);
  const projects = [...new Set(steps.flatMap((s) => s.tests.map((t) => t.project.trim())).filter((p) => p !== ""))];
  const commands: string[] = [];
  for (const project of projects) {
    const c = projectCommandFor(run.pack.commands, project);
    if (!c.ok) return null;
    if (!commands.includes(c.command)) commands.push(c.command);
  }
  if (commands.length === 0) return null;
  const fromGraph: string[] = [];
  const leftOut: string[] = [];
  for (const project of graph) {
    const c = projectCommandFor(run.pack.commands, project.trim());
    if (!c.ok) leftOut.push(`${project.trim()} (${c.reason})`);
    else if (!commands.includes(c.command)) { commands.push(c.command); fromGraph.push(project.trim()); }
  }
  return { commands, fromGraph, leftOut };
}

/** The batch's touched files refreshed in the code index (incremental_reindex), so that the graph the affected tests,
 *  the next batch and the audit read holds the tree as it is now. True when it was; never blocks: a line says what
 *  happened, none when no index is wired or nothing was touched. */
async function refreshIndex(run: Run): Promise<boolean> {
  const index = run.deps.costIndex;
  if (index === undefined || run.touched.size === 0) return false;
  const files = [...run.touched].sort().map((p) => `${INDEX_ROOT}/${p}`);
  try {
    const roots = (await index.roots()).map((r) => (r.length > 1 ? r.replace(/\/+$/, "") : r));
    if (!roots.includes(INDEX_ROOT)) {
      run.lines.push(`index: not refreshed — ${INDEX_ROOT} is not indexed`);
      return false;
    }
    const errors = await index.refresh(INDEX_ROOT, files);
    if (errors.length > 0) {
      run.lines.push(`index: not refreshed — incremental_reindex: ${reasonOf(errors[0])}`);
      return false;
    }
  } catch (e) {
    run.lines.push(`index: not refreshed — ${reasonOf(e)}`);
    return false;
  }
  run.lines.push(`index: ${files.length} file${files.length === 1 ? "" : "s"} of ${run.sheet.batch} refreshed`);
  return true;
}

/** What the graph says the batch's touched files reach (affected_tests), on a refreshed index; null when it cannot be
 *  asked or fails, said in a line: the sheet's Project cells then decide alone. */
async function graphAffected(run: Run): Promise<AffectedTests | null> {
  const index = run.deps.costIndex;
  if (index?.affected === undefined) return null;
  try {
    // Relative to the indexed root: affected_tests looks each file up as `<root>/<file>`, an absolute path never resolves.
    return await index.affected([...run.touched].sort());
  } catch (e) {
    run.lines.push(`affected tests: the graph was not read — ${reasonOf(e)}; the sheet's projects alone`);
    return null;
  }
}

/** The build, then the whole suite (the first time the batch goes green) or its affected projects, as jobs. */
async function suites(run: Run, suiteGreen: boolean): Promise<SuiteResult> {
  const guard = shellRuleGuard(stepRules("dev-implement"));
  const batch = run.sheet.batch;
  const affectedLog = `${run.logFolder}/${batch}-test-affected.txt`;

  // The tree changed whatever the build says: the index is refreshed first, so a red build leaves no stale graph.
  const indexed = await refreshIndex(run);
  const build = run.pack.commands.build?.trim();
  if (!build) run.lines.push("build: not run — the pack has no commands.build");
  else {
    const refusal = guard(build);
    if (refusal !== null) return { problem: `build: ${refusal}` };
    const outcome = await oneSuite(run, "build", build, `${run.logFolder}/${batch}-build.txt`);
    if (outcome.status === "not-run") return { problem: outcome.reason };
    if (outcome.status === "running") return { problem: `build still running after ${outcome.seconds} s${shownPath(outcome.log)}` };
    if (outcome.status === "failed") return { problem: `build: '${build}' exited ${outcome.exit}${shownPath(outcome.log)}\n${outcome.tail}` };
    run.lines.push(`build ✓ — ${build}${outcome.how === "blocking" ? " (run blocking)" : ""}${shownPath(outcome.log)}`);
  }

  const graph = suiteGreen && indexed ? await graphAffected(run) : null;
  const affected = suiteGreen && graph?.all !== true ? affectedCommands(run, graph?.projects ?? []) : null;
  if (affected !== null && affected.leftOut.length > 0) {
    run.lines.push(`affected tests: the graph's projects left out, no command can be named for them — ${affected.leftOut.join("; ")}`);
  }
  if (affected !== null) {
    const texts: string[] = [];
    let exit = 0;
    for (const command of affected.commands) {
      const refusal = guard(command);
      if (refusal !== null) return { problem: `affected tests: ${refusal}` };
      const outcome = await oneSuite(run, "affected tests", command, null);
      if (outcome.status === "not-run") return { problem: outcome.reason };
      texts.push(outcome.text.trimEnd());
      if (outcome.status === "running") {
        await writeLogQuietly(run, affectedLog, `${texts.join("\n")}\n`);
        return { problem: `affected tests still running after ${outcome.seconds} s${shownPath(affectedLog)}` };
      }
      if (outcome.status === "failed") {
        if (exit === 0) exit = outcome.exit;
        await writeLogQuietly(run, affectedLog, `${texts.join("\n")}\nexit=${exit}\n`);
        return { problem: `affected tests: '${command}' exited ${outcome.exit}${shownPath(affectedLog)}\n${outcome.tail}` };
      }
    }
    await writeLogQuietly(run, affectedLog, `${texts.join("\n")}\nexit=${exit}\n`);
    const byGraph = graph === null ? ""
      : `; the graph added ${affected.fromGraph.length === 0 ? "no project" : affected.fromGraph.join(", ")}${graph.classes.length === 0 ? "" : ` (${graph.classes.length} test class${graph.classes.length === 1 ? "" : "es"} reached)`}`;
    run.lines.push(`affected tests ✓ — ${affected.commands.join("; ")} (the whole suite went green once for ${batch}${byGraph})${shownPath(affectedLog)}`);
    return { ok: true, whole: false };
  }

  const test = run.pack.commands.test?.trim();
  if (!test) {
    run.lines.push("test: not run — the pack has no commands.test");
    return { ok: true, whole: false };
  }
  const refusal = guard(test);
  if (refusal !== null) return { problem: `test: ${refusal}` };
  // A whole-suite run empties the affected log: the audit then reads this one.
  await writeLogQuietly(run, affectedLog, "");
  const outcome = await oneSuite(run, "test", test, `${run.logFolder}/${batch}-test.txt`);
  if (outcome.status === "not-run") return { problem: outcome.reason };
  if (outcome.status === "running") return { problem: `test still running after ${outcome.seconds} s${shownPath(outcome.log)}` };
  if (outcome.status === "failed") return { problem: `test: '${test}' exited ${outcome.exit}${shownPath(outcome.log)}\n${outcome.tail}` };
  const again = !suiteGreen ? ""
    : graph?.all === true && graph.unresolved.length > 0
      ? ` (the whole suite again: the graph could not place ${cutList(graph.unresolved)})`
    : graph?.all === true ? " (the whole suite again: the graph reaches every test from these changes)"
    : " (the whole suite again: the pack has no commands.test_project)";
  run.lines.push(`test ✓ — ${test}${outcome.how === "blocking" ? " (run blocking)" : ""}${again}${shownPath(outcome.log)}`);
  return { ok: true, whole: true };
}

/** At most three paths, then how many more. */
function cutList(paths: readonly string[]): string {
  const shown = paths.slice(0, 3).join(", ");
  return paths.length > 3 ? `${shown} and ${paths.length - 3} more` : shown;
}

async function writeLogQuietly(run: Run, path: string, text: string): Promise<void> {
  try {
    await run.deps.files.write(path, text);
  } catch {
    // the log is a help, never a verdict
  }
}

/** The verdicts of the batch's verdict file: its mark, the last verdict, and the GAPS rounds since the last VALID. */
async function verdictState(files: Pick<Files, "read">, path: string): Promise<{ mark: string; last: "VALID" | "GAPS" | null; gapsRounds: number }> {
  let text: string | null;
  try {
    text = await files.read(path);
  } catch {
    text = null;
  }
  if (text === null) return { mark: verdictMarkOf(null), last: null, gapsRounds: 0 };
  const sections = parseVerdictFile(text).sections.filter((s) => s.verdict !== null);
  let gapsRounds = 0;
  // An audit the budget stopped judged nothing: it is no round of GAPS (its resume audits what came before).
  for (let i = sections.length - 1; i >= 0 && sections[i].verdict === "GAPS"; i--) if (!isUnfinishedSection(sections[i])) gapsRounds++;
  return { mark: verdictMarkOf(text), last: lastVerdict(parseVerdictFile(text))?.verdict ?? null, gapsRounds };
}

export async function runDevImplement(input: DevImplementInputs, deps: DevImplementDeps): Promise<string> {
  const batch = String(input.batch ?? "").trim();
  if (!BATCH.test(batch)) return blocked([], `the batch is F<n>, e.g. /dev-implement F1 <code>: got '${batch}'`);
  const plan = typeof input.plan === "string" && input.plan.trim() !== "" ? input.plan.trim() : null;
  const inputContext = prContextOf(input);
  const mode = typeof input.permissionMode === "string" ? input.permissionMode.trim() : "";
  if (mode !== "" && policyFor(mode).readOnly) {
    return blocked([], `the session mode ${mode} is read-only: /dev-implement writes files and commits (/mode default, then run it again)`);
  }

  const context = await loadDevContext({ files: deps.files, shell: deps.shell, config: deps.config });
  const lines = context.warnings.slice(0, 5).map((w) => `⚠ ${w}`);
  if (context.pack === null) return blocked(lines, "no repository pack (.orkeon/repo.yaml): its layout and commands drive the steps");
  if (context.work.vfsPath === null) return blocked(lines, `the work folder ${context.work.folder} is outside the mounts`);
  const pack = context.pack.pack;

  const located = await locateSheet(deps.files, context.work.folder, batch, plan);
  if (typeof located === "string") return blocked(lines, located);
  const sheetPath = `${WORKSPACE}/${located.dir}/${located.name}`;
  const record = await readTouchedRecord(deps.files, located.code, batch);

  if (input.close === true) {
    // The chained close names no context: the one the run saved in the batch record, read at its launch.
    const pr = inputContext ?? record.pr;
    const closeMode = pr?.permissionMode.trim() ?? "";
    if (closeMode !== "" && policyFor(closeMode).readOnly) {
      return blocked(lines, `the session mode ${closeMode} (read at the launch) is read-only: the close commits (/mode default, then /dev-implement ${batch} ${located.code} --close)`);
    }
    const opener = pr !== null && pr.githubTool ? deps.openerFor?.(pr) : undefined;
    // A batch of a /dev-batches run in progress is committed, never pushed, even when its close is typed (after a
    // GAPS stop, a refused hop): the run's own close pushes the plan's branch once.
    const inRun = input.push !== false && batchesRunCode(await deps.files.read(BATCHES_ACTIVE_RECORD).catch(() => "")) === located.code;
    if (inRun) lines.push(`not pushed: /dev-batches ${located.code} is in progress, its close pushes the plan's branch once`);
    return answer([...lines, ...await closeDevBatch({ ...deps, opener }, {
      pack, work: context.work, located, batch, touched: record.touched, verdictMark: record.verdictMark,
      openPr: input.pr === true, push: input.push !== false && !inRun, today: (deps.today ?? isoToday)(),
      ...(pr === null ? {} : { rules: parseSessionRules(pr.permissionRules) }),
    })]);
  }

  if (!hasTestLayout(pack.layout)) {
    return blocked(lines, "the pack gives neither layout.tests nor layout.test_files: code cannot tell a test file from a production one");
  }
  let sheetText: string;
  try {
    sheetText = await deps.files.read(sheetPath);
  } catch (e) {
    return blocked(lines, `${located.dir}/${located.name} cannot be read: ${reasonOf(e)}`);
  }
  const verdictPath = `${WORKSPACE}/${located.dir}/${located.prefix}-VERIFY-${batch}.md`;
  const verdicts = await verdictState(deps.files, verdictPath);

  const finding = typeof input.correction === "string" ? input.correction.trim() : "";
  if (finding !== "") {
    const edit = addCorrection(sheetText, finding);
    if (!edit.ok) return blocked(lines, `correction: ${edit.reason}`);
    if (edit.appended) {
      try {
        await deps.files.write(sheetPath, edit.text);
      } catch (e) {
        return blocked(lines, `correction: the sheet could not be written: ${reasonOf(e)}`);
      }
      lines.push(`correction appended to ${located.name} as step ${edit.step} — ${edit.title}`);
    } else {
      lines.push(`correction still open as step ${edit.step} — ${edit.title}: run again, nothing appended`);
    }
    sheetText = edit.text;
    if (verdicts.gapsRounds >= GAPS_ROUNDS_WARNED) {
      lines.push(`⚠ ${verdicts.gapsRounds} audit rounds in GAPS: the method hands the blocking gaps to you before a third`);
    }
  }
  const sheet = parseImplementSheet(sheetText);
  if (sheet.problems.length > 0) return blocked(lines, `the sheet is malformed: ${sheet.problems.join("; ")}`);

  const logFolder = `${context.work.vfsPath}/${located.code}/logs`;
  const written = new Set<string>();
  const wrote = (path: string): void => { if (path.trim() !== "") written.add(workspacePath(path)); };
  const pr = inputContext ?? record.pr;
  const runLines = [...lines, `dev-implement ${batch} (${located.code}): ${located.dir}/${located.name}`];
  const open = openSteps(sheet);
  let restored = false;
  if (open.length > 0) {
    const r = await restore({ deps, pack, logFolder, lines: runLines }, batch);
    if ("problem" in r) return blocked(runLines, r.problem);
    restored = r.restored;
  }
  // Built after the restore, which tells run_build the tree was restored already.
  const tools = createWrappedTools(
    { shell: deps.shell, files: deps.files },
    { commands: pack.commands, rules: stepRules("dev-implement"), logFolder, batch, ...(restored ? { restored: true } : {}) },
  );
  const run: Run = {
    deps, pack, isTest: (p) => isTestPath(p, pack.layout), located, sheetPath, sheetText, sheet, tools, wrote,
    ownFolders: [context.work.folder, located.dir], planFolder: located.dir, planLogs: `${context.work.folder}/${located.code}/logs`,
    logFolder, written, verdictMark: verdicts.mark, touched: new Set(record.touched), ran: [], lines: runLines,
    correction: NOTHING_RECALLED, recalled: [],
  };
  // T5: a correction run carries the mistakes recalled from its finding to both roles.
  if (finding !== "" && open.length > 0) {
    run.correction = await (deps.precedents ?? noPrecedents)("T5", recallQuery([finding]));
    run.recalled.push(run.correction);
  }
  const save = (suiteGreen: boolean): Promise<void> =>
    recordTouched(deps.files, located.code, batch, [...run.touched], run.verdictMark, { suiteGreen, pr });
  const release = deps.toolSlot?.bind(tools) ?? (() => {});
  try {
    const cycles = cyclesOf(open);
    if (cycles.length > 0) run.lines.push(cyclesLine(cycles));
    for (const cycle of cycles) {
      const problem = await runCycle(run, cycle);
      await save(record.suiteGreen);
      if (problem !== null) return blocked(run.lines, problem);
    }
    const result = await suites(run, record.suiteGreen);
    if ("problem" in result) {
      await save(record.suiteGreen);
      return blocked(run.lines, result.problem);
    }
    await save(record.suiteGreen || result.whole);
  } finally {
    release();
  }
  const recalledLine = precedentsLine(run.recalled);
  if (recalledLine !== "") run.lines.push(recalledLine);
  const planArg = plan ?? located.code;
  const auditMode = verdicts.last === "GAPS" ? "resume" : "fast";
  run.lines.push(`→ Batch ${batch}: every step ticked, the build and the tests green. The audit follows: /dev-verify ${batch} ${planArg}${auditMode === "resume" ? " resume" : ""}`);
  return answer(run.lines, {
    crew: "dev-verify",
    input: {
      batch, plan: planArg, mode: auditMode,
      ...(input.hooks === undefined ? {} : { hooks: input.hooks }), ...(input.effort === undefined || input.effort === null ? {} : { effort: input.effort }),
      ...(input.memoryRecall === false ? { memoryRecall: false as const } : {}),
    },
  });
}
