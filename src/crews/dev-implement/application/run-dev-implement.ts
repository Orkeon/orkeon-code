// /dev-implement F<n>: the steps of one batch sheet, each as RED by the test author then GREEN by
// the implementer, two acts of the crew's one agent with their own tools and rules. Code makes
// each brief from the sheet, observes the tree before and after each act, runs the step's tests
// itself, and ticks a box only once what it stands for was seen. After the last step, the build
// and the whole suite run as shell jobs; a batch all ticked and green hands over to /dev-verify
// (the `next` of its answer). Any failed check stops the batch with BLOCKED and ticks nothing more.
//
// The answer is JSON: `{ lines, next? }`, read by the command's `completed`.
import type { Files, Llm, Logger, Shell, ShellJobs } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import type { PullRequestOpener } from "../../../shared/application/git/commit-files.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { createWrappedTools } from "../../../shared/application/dev/wrapped-tools.ts";
import type { WrappedRun, WrappedTools } from "../../../shared/application/dev/wrapped-tools.ts";
import { stepRules } from "../../../shared/domain/dev/step-rules.ts";
import { shellRuleGuard } from "../../../shared/domain/dev/tool-guards.ts";
import type { RepoPack, RepoPackLayout } from "../../../shared/domain/dev/repo-pack.ts";
import { greenContract, redContract, testCommandFor } from "../domain/contracts.ts";
import { openSteps, parseImplementSheet } from "../domain/step-section.ts";
import type { ImplementSheet, ImplementStep } from "../domain/step-section.ts";
import { changedPaths, greenProblem, readCost, redProblem, under } from "../domain/step-checks.ts";
import type { ObservedRun } from "../domain/step-checks.ts";
import { tickBox } from "../domain/sheet-ticks.ts";
import type { TddBox } from "../domain/sheet-ticks.ts";
import { IMPLEMENTER, TEST_AUTHOR } from "../domain/roles.ts";
import type { RoleName } from "../domain/roles.ts";
import { SLICE_SECONDS, SUITE_LIMIT_SECONDS } from "../domain/implement-budget.ts";
import { askLine, runRole } from "./run-role.ts";
import { snapshot } from "./observe.ts";
import { runSuite } from "./suite-job.ts";
import { locateSheet, WORKSPACE } from "./locate-sheet.ts";
import type { LocatedSheet } from "./locate-sheet.ts";
import { currentVerdictMark, readTouchedRecord, recordTouched } from "./touched.ts";
import { closeDevBatch } from "./close.ts";

export interface DevImplementInputs { batch?: unknown; plan?: unknown; close?: unknown; pr?: unknown; push?: unknown }

export interface DevImplementDeps {
  files: Files; shell: Shell; config: Pick<ConfigStore, "readValue">; jobs: ShellJobs;
  /** A role's Llm, built with that role's callbacks over the pack's layout; `wrote` hears the path of each
   *  file_write or edit_file call those callbacks let through. */
  roleLlm(role: RoleName, layout: RepoPackLayout, wrote: (path: string) => void): Pick<Llm, "act">;
  log: Logger;
  /** The slot run_tests and run_build read: bound to this run's wrapped tools. */
  toolSlot?: { bind(tools: WrappedTools): () => void };
  opener?: PullRequestOpener;
}

export interface ImplementAnswer {
  lines: string[];
  next?: { crew: "dev-verify"; input: { batch: string; plan: string } };
}

const RESTORE_TIMEOUT_SECONDS = 900;
const BATCH = /^F\d+$/;

const answer = (lines: string[], next?: ImplementAnswer["next"]): string =>
  JSON.stringify(next === undefined ? { lines } : { lines, next });
const blocked = (lines: string[], line: string): string => answer([...lines, `BLOCKED — ${line}`]);
const reasonOf = (e: unknown): string => String((e as Error)?.message ?? e).split("\n")[0];

interface Run {
  deps: DevImplementDeps;
  pack: RepoPack;
  testsFolder: string;
  located: LocatedSheet;
  sheetPath: string;
  sheetText: string;
  sheet: ImplementSheet;
  tools: WrappedTools;
  llms: Record<RoleName, Pick<Llm, "act">>;
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
  lines: string[];
}

function observedRun(run: WrappedRun): ObservedRun {
  return run.ok ? { ran: true, exit: run.exit, timedOut: run.timedOut, log: run.log } : { ran: false, reason: run.refused };
}

async function tick(run: Run, step: ImplementStep, box: TddBox): Promise<string | null> {
  const ticked = tickBox(run.sheetText, step.number, box);
  if (!ticked.ok) return ticked.problem;
  try {
    await run.deps.files.write(run.sheetPath, ticked.text);
  } catch (e) {
    return `the sheet could not be written: ${reasonOf(e)}`;
  }
  run.sheetText = ticked.text;
  return null;
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
async function act(run: Run, role: RoleName, prompt: string): Promise<{ text: string; changed: string[] } | string> {
  const before = await snapshot(run.deps);
  if (!before.ok) return before.problem;
  const spec = role === "test-author" ? TEST_AUTHOR : IMPLEMENTER;
  run.written.clear();
  const said = await runRole(run.llms[role], spec, prompt);
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
  return { text: said.text, changed };
}

async function runStep(run: Run, step: ImplementStep): Promise<string | null> {
  const command = testCommandFor(run.pack.commands, step);
  if (!command.ok) return `step ${step.number}: ${command.reason}`;
  const input = {
    code: run.located.code, sheetPath: `${run.located.dir}/${run.located.name}`, sheet: run.sheet, step,
    layout: run.pack.layout, testCommand: command.command,
  };
  let red: WrappedRun | null = null;
  if (!step.tdd?.red) {
    const done = await act(run, "test-author", redContract(input));
    if (typeof done === "string") return `step ${step.number} RED: ${done}`;
    red = await run.tools.runTests({ command: command.command });
    const problem = redProblem(done.changed, run.testsFolder, observedRun(red));
    if (problem !== null) return `step ${step.number} RED: ${problem}${logOf(red)}`;
    done.changed.forEach((p) => run.touched.add(p));
    const failed = await tick(run, step, "RED");
    if (failed !== null) return `step ${step.number} RED: ${failed}`;
    run.lines.push(`step ${step.number} RED ✓ — ${done.changed.join(", ")}`);
  }

  let costText: string | null = null;
  if (!step.tdd?.green) {
    red ??= await run.tools.runTests({ command: command.command });
    const redTail = red.ok ? { tail: red.tail, log: red.log } : { tail: `(not run: ${red.refused})`, log: null };
    const done = await act(run, "implementer", greenContract(input, redTail));
    if (typeof done === "string") return `step ${step.number} GREEN: ${done}`;
    const green = await run.tools.runTests({ command: command.command });
    const problem = greenProblem(done.changed, run.testsFolder, observedRun(green));
    if (problem !== null) return `step ${step.number} GREEN: ${problem}${logOf(green)}`;
    done.changed.forEach((p) => run.touched.add(p));
    const failed = await tick(run, step, "GREEN");
    if (failed !== null) return `step ${step.number} GREEN: ${failed}`;
    run.lines.push(`step ${step.number} GREEN ✓ — ${done.changed.join(", ") || "no file changed"}`);
    costText = done.text;
  }

  if (!step.tdd?.cost) {
    let cost = readCost(costText ?? "");
    if (!cost.ok && cost.line === undefined) {
      const asked = await askLine(run.llms.implementer, IMPLEMENTER,
        `Step ${step.number} of ${run.located.code} ${run.sheet.batch}: answer with one line only, ` +
        "`Cost: <reads> reads, <writes> writes; <where a port call sits in a loop, a lambda or a memory filter, or none>`.");
      if (!asked.ok) return `step ${step.number} COST: ${asked.reason}`;
      cost = readCost(asked.text);
    }
    if (!cost.ok) return `step ${step.number} COST: ${cost.problem}`;
    const failed = await tick(run, step, "COST");
    if (failed !== null) return `step ${step.number} COST: ${failed}`;
    run.lines.push(`step ${step.number} COST ✓ — ${cost.line}`);
  }
  return null;
}

function logOf(run: WrappedRun): string {
  return run.ok && run.log !== null ? ` (log: ${run.log.replace(`${WORKSPACE}/`, "")})` : "";
}

async function restore(run: Run): Promise<string | null> {
  const command = run.pack.commands.restore?.trim();
  if (!command) return null;
  const refusal = shellRuleGuard(stepRules("dev-implement"))(command);
  if (refusal !== null) return `restore: ${refusal}`;
  let r;
  try {
    r = await run.deps.shell.run(command, { timeoutSeconds: RESTORE_TIMEOUT_SECONDS });
  } catch (e) {
    return `restore: '${command}' could not run: ${reasonOf(e)}`;
  }
  const log = `${run.logFolder}/restore-${run.sheet.batch}.log`;
  try {
    await run.deps.files.write(log, `$ ${command}\nexit ${r.exitCode}\n${r.stdout.trimEnd()}\n${r.stderr.trimEnd()}\n`);
  } catch {
    // the log is a help, never a verdict
  }
  if (r.timedOut === true) return `restore: '${command}' still running after ${RESTORE_TIMEOUT_SECONDS} s`;
  if (r.exitCode !== 0) return `restore: '${command}' exited ${r.exitCode} (log: ${log.replace(`${WORKSPACE}/`, "")})`;
  run.lines.push(`restored once: ${command}`);
  return null;
}

/** The build, then the whole suite, as jobs; null when both are green. */
async function suites(run: Run): Promise<string | null> {
  const guard = shellRuleGuard(stepRules("dev-implement"));
  const plan: Array<{ label: "build" | "test"; command: string | undefined }> = [
    { label: "build", command: run.pack.commands.build?.trim() },
    { label: "test", command: run.pack.commands.test?.trim() },
  ];
  for (const { label, command } of plan) {
    if (!command) {
      run.lines.push(`${label}: not run — the pack has no commands.${label}`);
      continue;
    }
    const refusal = guard(command);
    if (refusal !== null) return `${label}: ${refusal}`;
    const log = `${run.logFolder}/${label}-${run.sheet.batch}.log`;
    const outcome = await runSuite(
      { jobs: run.deps.jobs, shell: run.deps.shell, files: run.deps.files },
      { label, command, log, limitSeconds: SUITE_LIMIT_SECONDS, sliceSeconds: SLICE_SECONDS },
    );
    const shown = (path: string | null): string => (path === null ? "" : ` (log: ${path.replace(`${WORKSPACE}/`, "")})`);
    if (outcome.status === "not-run") return outcome.reason;
    if (outcome.status === "running") return `${label} still running after ${outcome.seconds} s${shown(outcome.log)}`;
    if (outcome.status === "failed") return `${label}: '${command}' exited ${outcome.exit}${shown(outcome.log)}\n${outcome.tail}`;
    run.lines.push(`${label} ✓ — ${command}${outcome.how === "blocking" ? " (run blocking)" : ""}${shown(outcome.log)}`);
  }
  return null;
}

export async function runDevImplement(input: DevImplementInputs, deps: DevImplementDeps): Promise<string> {
  const batch = String(input.batch ?? "").trim();
  if (!BATCH.test(batch)) return blocked([], `the batch is F<n>, e.g. /dev-implement F1 <code>: got '${batch}'`);
  const plan = typeof input.plan === "string" && input.plan.trim() !== "" ? input.plan.trim() : null;

  const context = await loadDevContext({ files: deps.files, shell: deps.shell, config: deps.config });
  const lines = context.warnings.slice(0, 5).map((w) => `⚠ ${w}`);
  if (context.pack === null) return blocked(lines, "no repository pack (.orkeon/repo.yaml): its layout and commands drive the steps");
  if (context.work.vfsPath === null) return blocked(lines, `the work folder ${context.work.folder} is outside the mounts`);
  const pack = context.pack.pack;

  const located = await locateSheet(deps.files, context.work.folder, batch, plan);
  if (typeof located === "string") return blocked(lines, located);
  const sheetPath = `${WORKSPACE}/${located.dir}/${located.name}`;

  if (input.close === true) {
    const record = await readTouchedRecord(deps.files, located.code, batch);
    return answer([...lines, ...await closeDevBatch(deps, {
      pack, work: context.work, located, batch, touched: record.touched, verdictMark: record.verdictMark,
      openPr: input.pr === true, push: input.push !== false,
    })]);
  }

  const testsFolder = pack.layout.tests?.trim();
  if (!testsFolder) return blocked(lines, "the pack gives no layout.tests: code cannot tell a test file from a production one");
  let sheetText: string;
  try {
    sheetText = await deps.files.read(sheetPath);
  } catch (e) {
    return blocked(lines, `${located.dir}/${located.name} cannot be read: ${reasonOf(e)}`);
  }
  const sheet = parseImplementSheet(sheetText);
  if (sheet.problems.length > 0) return blocked(lines, `the sheet is malformed: ${sheet.problems.join("; ")}`);

  const logFolder = `${context.work.vfsPath}/${located.code}/logs`;
  const tools = createWrappedTools({ shell: deps.shell, files: deps.files }, { commands: pack.commands, rules: stepRules("dev-implement"), logFolder });
  const release = deps.toolSlot?.bind(tools) ?? (() => {});
  const written = new Set<string>();
  const wrote = (path: string): void => { if (path.trim() !== "") written.add(workspacePath(path)); };
  const record = await readTouchedRecord(deps.files, located.code, batch);
  const run: Run = {
    deps, pack, testsFolder, located, sheetPath, sheetText, sheet, tools,
    llms: { "test-author": deps.roleLlm("test-author", pack.layout, wrote), implementer: deps.roleLlm("implementer", pack.layout, wrote) },
    ownFolders: [context.work.folder, located.dir], planFolder: located.dir, planLogs: `${context.work.folder}/${located.code}/logs`,
    logFolder, written,
    verdictMark: await currentVerdictMark(deps.files, `${WORKSPACE}/${located.dir}/${located.prefix}-VERIFY-${batch}.md`),
    touched: new Set(record.touched), lines: [...lines, `dev-implement ${batch} (${located.code}): ${located.dir}/${located.name}`],
  };
  try {
    const open = openSteps(sheet);
    if (open.length > 0) {
      const restoreProblem = await restore(run);
      if (restoreProblem !== null) return blocked(run.lines, restoreProblem);
    }
    for (const step of open) {
      const problem = await runStep(run, step);
      await recordTouched(deps.files, located.code, batch, [...run.touched], run.verdictMark);
      if (problem !== null) return blocked(run.lines, problem);
    }
    const suiteProblem = await suites(run);
    if (suiteProblem !== null) return blocked(run.lines, suiteProblem);
  } finally {
    release();
  }
  const planArg = plan ?? located.code;
  run.lines.push(`→ Batch ${batch}: every step ticked, the build and the suite green. The audit follows: /dev-verify ${batch} ${planArg}`);
  return answer(run.lines, { crew: "dev-verify", input: { batch, plan: planArg } });
}
