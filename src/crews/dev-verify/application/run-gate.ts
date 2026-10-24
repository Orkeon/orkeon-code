// Gathers what the gate needs - the sheet, the texts of the plan folder, the changed files,
// the trait hits, the whitespace check - with git calls only, then runs the five checks.
// Fast and side-effect free: no build, no write (`--gate-only` relies on it).
import type { Files, Shell } from "../../../shared/application/ports.ts";
import { firstLine, stdoutLines } from "../domain/text.ts";
import { runtimeCut } from "../domain/runtime-cut.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import type { TraitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import { traitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import type { GateLine, GateReport } from "../domain/gate.ts";
import { gateLineText, runGateChecks } from "../domain/gate.ts";
import type { SheetFacts } from "../domain/sheet-facts.ts";
import { sheetFacts } from "../domain/sheet-facts.ts";
import {
  GIT_CHANGED_TRACKED, GIT_DIFF_CHECK, UNQUOTABLE_SCOPE, buildOutputProblem, excludePathspecs, gitTraitGrep, gitUntracked,
} from "../domain/commands.ts";

export const WORKSPACE = "/workspace";
const MAX_PLAN_ENTRIES = 500;
const MAX_PLAN_FILES = 60;

/** What a run audits, resolved by run-dev-verify.ts (P4). */
export interface DevVerifyTarget {
  batch: string;            // "F2"
  code: string;             // the folder name, "demo"
  prefix: string;           // <CODE> of the file names, "DEMO"
  workShown: string;        // "workbench"
  planDirShown: string;     // "workbench/demo"
  sheetShown: string;       // "workbench/demo/DEMO-PLAN-F2.md"
  pack: RepoPack | null;
  packShown: string | null;
}

/** layout.domain, application, infrastructure, tests: set ones, de-duplicated, in that order (prod first, tests last: AC:36-37). */
export function gateRoots(pack: RepoPack | null): string[] {
  if (pack === null) return [];
  const { domain, application, infrastructure, tests } = pack.layout;
  const roots: string[] = [];
  for (const r of [domain, application, infrastructure, tests]) {
    if (r !== undefined && r !== "" && !roots.includes(r)) roots.push(r);
  }
  return roots;
}

export interface GateRun {
  report: GateReport;
  sheet: string; facts: SheetFacts;
  roots: string[]; excludes: string[];
  changedFiles: string[]; untrackedFiles: string[];
  trait: TraitMarker | null; traitHits: string[] | null;
}
export type GateOutcome = { ok: true; run: GateRun } | { ok: false; error: string };

function errorLine(error: unknown): string {
  return firstLine(error instanceof Error ? error.message : String(error));
}


function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

class GateCommandError extends Error {}

/**
 * The stdout of a git call, without the runtime's cut notice; a throw or an exit outside `okExits`
 * (-1: none reported) refuses the gate. `cut` is a FAIL line when the runtime cut the stdout.
 */
async function runOrRefuse(
  shell: Pick<Shell, "run">, command: string, okExits: readonly number[] = [0],
): Promise<{ stdout: string; cut: GateLine | null }> {
  let result;
  try {
    result = await shell.run(command);
  } catch (error) {
    throw new GateCommandError(`the gate could not run '${command}': ${errorLine(error)}`);
  }
  if (result.exitCode !== -1 && !okExits.includes(result.exitCode)) {
    const why = firstLine(result.stderr);
    throw new GateCommandError(`the gate could not run '${command}': exit ${result.exitCode}${why === "" ? "" : ` (${why})`}`);
  }
  const { kept, omitted } = runtimeCut(result.stdout);
  const cut = omitted > 0
    ? { kind: "FAIL" as const, text: `the output of '${command}' was cut by the runtime (${omitted} characters omitted): the list is incomplete, run the gate again on a smaller change` }
    : null;
  return { stdout: kept, cut };
}

/** The report with the run's own lines added after the checks, green and the last line recomputed. */
function withChecks(report: GateReport, input: { batch: string; sheetShown: string }, extra: readonly GateLine[]): GateReport {
  if (extra.length === 0) return report;
  const checks = [...report.checks, ...extra];
  const green = !checks.some((c) => c.kind === "FAIL");
  const lines = [
    `GATE — batch ${input.batch} — sheet ${input.sheetShown}`,
    ...checks.map(gateLineText),
    green ? `GATE — batch ${input.batch}: GREEN` : `GATE — batch ${input.batch}: RED — fix and run again, no audit before`,
  ];
  return { ...report, green, lines, checks };
}

async function planTexts(files: Pick<Files, "read" | "list">, planDir: string) {
  let names: string[];
  try {
    names = await files.list(planDir, MAX_PLAN_ENTRIES);
  } catch {
    names = [];
  }
  const sheets: string[] = [];
  const plans: string[] = [];
  const all: string[] = [];
  const warnings: GateLine[] = [];
  const isPlan = (n: string): boolean => /-PLAN[^/]*\.md$/.test(n);
  const md = names.filter((n) => n.endsWith(".md")).sort(byCodeUnit);
  const ordered = [...md.filter(isPlan), ...md.filter((n) => !isPlan(n))];
  for (const name of ordered.slice(MAX_PLAN_FILES)) {
    warnings.push({ kind: "note", text: `plan folder: ${name} not read (beyond the first ${MAX_PLAN_FILES} .md files, *-PLAN*.md first)` });
  }
  for (const name of ordered.slice(0, MAX_PLAN_FILES)) {
    let text: string;
    try {
      text = await files.read(`${planDir}/${name}`);
    } catch {
      continue;
    }
    all.push(text);
    if (/-PLAN-F\d+\.md$/.test(name)) sheets.push(text);
    if (/-PLAN\.md$/.test(name)) plans.push(text);
  }
  return { texts: { sheets, plans, all }, warnings };
}

export async function runGate(
  deps: { files: Pick<Files, "read" | "list">; shell: Pick<Shell, "run"> },
  target: DevVerifyTarget,
): Promise<GateOutcome> {
  const outputs = target.pack?.layout.buildOutputs ?? [];
  for (const o of outputs) {
    const problem = buildOutputProblem(o);
    if (problem !== undefined) return { ok: false, error: problem };
  }
  const excludes = excludePathspecs(outputs);
  const roots = gateRoots(target.pack);

  let sheet: string;
  try {
    sheet = await deps.files.read(`${WORKSPACE}/${target.sheetShown}`);
  } catch (error) {
    return { ok: false, error: `the sheet ${target.sheetShown} cannot be read (${errorLine(error)})` };
  }
  const { texts: plan, warnings } = await planTexts(deps.files, `${WORKSPACE}/${target.planDirShown}`);

  try {
    const extra: GateLine[] = [...warnings];
    const trackedRun = await runOrRefuse(deps.shell, GIT_CHANGED_TRACKED);
    const untrackedRun = await runOrRefuse(deps.shell, gitUntracked(excludes));
    const tracked = stdoutLines(trackedRun.stdout);
    const untrackedFiles = stdoutLines(untrackedRun.stdout);
    for (const r of [trackedRun, untrackedRun]) if (r.cut !== null) extra.push(r.cut);
    const changedFiles = [...new Set([...tracked, ...untrackedFiles])].sort(byCodeUnit);

    const facts = sheetFacts(sheet);
    const trait = traitMarker(target.pack?.tests.ruleTrait, target.pack?.tests.traitPattern);
    let traitHits: string[] | null = null;
    if (trait !== null && facts.ids.length > 0) {
      const command = gitTraitGrep(trait.ere, roots.length > 0 ? roots : ["."], excludes);
      if (command === null) {
        extra.push({ kind: "FAIL", text: `rule traits: ${UNQUOTABLE_SCOPE}` });
      } else {
        // git grep exits 1 when nothing matches.
        const grep = await runOrRefuse(deps.shell, command, [0, 1]);
        traitHits = stdoutLines(grep.stdout);
        if (grep.cut !== null) extra.push(grep.cut);
      }
    }

    let diffCheckExit: number;
    try {
      diffCheckExit = (await deps.shell.run(GIT_DIFF_CHECK)).exitCode;
    } catch {
      diffCheckExit = 1;
    }

    const report = withChecks(runGateChecks({
      batch: target.batch,
      sheetShown: target.sheetShown,
      sheet,
      facts,
      plan,
      planDirShown: target.planDirShown,
      planDirAbsolute: `${WORKSPACE}/${target.planDirShown}`,
      roots,
      changedFiles,
      trait,
      traitHits,
      diffCheckExit,
    }), target, extra);
    return { ok: true, run: { report, sheet, facts, roots, excludes, changedFiles, untrackedFiles, trait, traitHits } };
  } catch (error) {
    if (error instanceof GateCommandError) return { ok: false, error: error.message };
    throw error;
  }
}
