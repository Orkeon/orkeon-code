// /dev-implement F<n>: the steps of one batch sheet, each as RED by the test author then GREEN by
// the implementer, two acts of the crew's one agent with their own tools and rules. Consecutive
// steps on one test file are one cycle: every RED first, then one GREEN and one Cost for them all.
// Code makes each brief from the sheet, observes the tree before and after each act, runs the
// tests itself, measures the cost of what changed, and ticks a box only once what it stands for was
// seen. After the last cycle the build, then the whole suite once per batch (the affected projects
// after), run as shell jobs and write the logs /dev-verify reads; a batch all ticked and green hands
// over to /dev-verify (the `next` of its answer, `resume` after a GAPS verdict). A correction
// (`— correction: <finding>`) is first appended to the sheet as a new step. Any failed check stops
// the batch with BLOCKED and ticks nothing more.
//
// The answer is JSON: `{ lines, next? }`, read by the command's `completed`.
import type { CostIndex, Files, Llm, Logger, Shell, ShellJobs } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { PullRequestOpener } from "../../../shared/application/git/commit-files.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { createWrappedTools } from "../../../shared/application/dev/wrapped-tools.ts";
import { measureAccessCost } from "../../../shared/application/dev/measure-access-cost.ts";
import type { CostFile } from "../../../shared/application/dev/measure-access-cost.ts";
import { addedLines } from "../../../shared/domain/dev/access-cost.ts";
import { hasTestLayout, isTestPath } from "../../../shared/domain/dev/test-paths.ts";
import { lastVerdict, parseVerdictFile } from "../../../shared/domain/dev/verdict-format.ts";
import { shellQuote } from "../../../shared/domain/git/close.ts";
import type { WrappedRun, WrappedTools } from "../../../shared/application/dev/wrapped-tools.ts";
import { stepRules } from "../../../shared/domain/dev/step-rules.ts";
import { policyFor } from "../../../shared/domain/agent-policy/mode-policy.ts";
import { parseSessionRules } from "../../../shared/domain/git/pull-request.ts";
import { shellRuleGuard } from "../../../shared/domain/dev/tool-guards.ts";
import type { RepoPack, RepoPackLayout } from "../../../shared/domain/dev/repo-pack.ts";
import { greenContract, projectCommandFor, redContract, stubsOf, testCommandFor } from "../domain/contracts.ts";
import { openSteps, parseImplementSheet } from "../domain/step-section.ts";
import type { ImplementSheet, ImplementStep } from "../domain/step-section.ts";
import { changedPaths, greenProblem, readCost, redProblem, under } from "../domain/step-checks.ts";
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
import { snapshot } from "./observe.ts";
import { logText, runSuite } from "./suite-job.ts";
import { locateSheet, WORKSPACE } from "./locate-sheet.ts";
import type { LocatedSheet } from "./locate-sheet.ts";
import { prContextOf, readTouchedRecord, recordTouched, verdictMarkOf } from "./touched.ts";
import type { PrContext } from "./touched.ts";
import { closeDevBatch } from "./close.ts";

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
  /** The code index the measured cost reads; none: the cost is not computed, the stated line decides. */
  costIndex?: CostIndex;
  /** Today, `YYYY-MM-DD` (the close's done marks). */
  today?: () => string;
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
  return { text: said.text, changed };
}

function contractInput(run: Run, step: ImplementStep, testCommand: string, cycle?: readonly ImplementStep[]) {
  return {
    code: run.located.code, sheetPath: `${run.located.dir}/${run.located.name}`, sheet: run.sheet, step,
    ...(cycle === undefined ? {} : { cycle }), layout: run.pack.layout, testCommand,
  };
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
  const cost = await measureAccessCost(run.deps.costIndex, run.pack, [], await costFiles(run, production));
  if (cost.state === "not-computed") return { line: `measured: not computed — ${cost.reason}` };
  if (cost.exit === 2) {
    return { problem: `measured ${cost.costLine}; flagged: ${cost.flagged.join("; ")} — back to /dev-plan (the design names the access, the code cannot move it)` };
  }
  return { line: `measured: ${cost.costLine}` };
}

async function runCycle(run: Run, cycle: Cycle): Promise<string | null> {
  const steps = cycle.steps;
  const label = stepsLabel(steps);
  const command = testCommandFor(run.pack.commands, steps[0]);
  if (!command.ok) return `${label}: ${command.reason}`;
  const production = new Set<string>();

  let red: WrappedRun | null = null;
  for (const step of steps.filter((s) => !s.tdd?.red)) {
    const stubs = stubsOf(step);
    const done = await act(run, "test-author", redContract(contractInput(run, step, command.command)), stubs);
    if (typeof done === "string") return `step ${step.number} RED: ${done}`;
    run.ran.push(step);
    red = await run.tools.runTests({ command: command.command });
    const problem = redProblem(done.changed, run.isTest, observedRun(red), stubs);
    if (problem !== null) return `step ${step.number} RED: ${problem}${logOf(red)}`;
    done.changed.forEach((p) => { run.touched.add(p); if (!run.isTest(p)) production.add(p); });
    const failed = await tick(run, step, "RED");
    if (failed !== null) return `step ${step.number} RED: ${failed}`;
    const stubbed = done.changed.filter((p) => !run.isTest(p));
    run.lines.push(`step ${step.number} RED ✓ — ${done.changed.filter(run.isTest).join(", ")}${stubbed.length === 0 ? "" : ` (stubs: ${stubbed.join(", ")})`}`);
  }

  let costText: string | null = null;
  const green = steps.filter((s) => !s.tdd?.green);
  if (green.length > 0) {
    red ??= await run.tools.runTests({ command: command.command });
    const redTail = red.ok ? { tail: red.tail, log: red.log } : { tail: `(not run: ${red.refused})`, log: null };
    const greenLabel = stepsLabel(green);
    const done = await act(run, "implementer", greenContract(contractInput(run, green[0], command.command, green), redTail));
    if (typeof done === "string") return `${greenLabel} GREEN: ${done}`;
    if (!run.ran.includes(green[0])) run.ran.push(...green);
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
    await run.deps.files.write(log, logText(command, [], output, r.timedOut === true ? null : r.exitCode));
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
 *  step when it ran none), their logs written together to `F<n>-test-affected.txt`. Null when they cannot be named. */
function affectedCommands(run: Run): string[] | null {
  if (!run.pack.commands.testProject?.trim()) return null;
  const steps = run.ran.length > 0 ? run.ran : run.sheet.steps.filter((s) => s.tdd !== null);
  const projects = [...new Set(steps.map((s) => s.tests[0]?.project ?? "").filter((p) => p !== ""))];
  const commands: string[] = [];
  for (const project of projects) {
    const c = projectCommandFor(run.pack.commands, project);
    if (!c.ok) return null;
    if (!commands.includes(c.command)) commands.push(c.command);
  }
  return commands.length === 0 ? null : commands;
}

/** The build, then the whole suite (the first time the batch goes green) or its affected projects, as jobs. */
async function suites(run: Run, suiteGreen: boolean): Promise<SuiteResult> {
  const guard = shellRuleGuard(stepRules("dev-implement"));
  const batch = run.sheet.batch;
  const affectedLog = `${run.logFolder}/${batch}-test-affected.txt`;

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

  const affected = suiteGreen ? affectedCommands(run) : null;
  if (affected !== null) {
    const texts: string[] = [];
    let exit = 0;
    for (const command of affected) {
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
    run.lines.push(`affected tests ✓ — ${affected.join("; ")} (the whole suite went green once for ${batch})${shownPath(affectedLog)}`);
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
  const again = suiteGreen ? " (the whole suite again: the pack has no commands.test_project)" : "";
  run.lines.push(`test ✓ — ${test}${outcome.how === "blocking" ? " (run blocking)" : ""}${again}${shownPath(outcome.log)}`);
  return { ok: true, whole: true };
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
  for (let i = sections.length - 1; i >= 0 && sections[i].verdict === "GAPS"; i--) gapsRounds++;
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
    return answer([...lines, ...await closeDevBatch({ ...deps, opener }, {
      pack, work: context.work, located, batch, touched: record.touched, verdictMark: record.verdictMark,
      openPr: input.pr === true, push: input.push !== false, today: (deps.today ?? isoToday)(),
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
    { commands: pack.commands, rules: stepRules("dev-implement"), logFolder, ...(restored ? { restored: true } : {}) },
  );
  const run: Run = {
    deps, pack, isTest: (p) => isTestPath(p, pack.layout), located, sheetPath, sheetText, sheet, tools, wrote,
    ownFolders: [context.work.folder, located.dir], planFolder: located.dir, planLogs: `${context.work.folder}/${located.code}/logs`,
    logFolder, written, verdictMark: verdicts.mark, touched: new Set(record.touched), ran: [], lines: runLines,
  };
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
