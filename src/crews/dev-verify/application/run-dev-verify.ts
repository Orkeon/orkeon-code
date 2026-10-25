// /dev-verify's use case: checks the inputs and the checkout, resolves the batch sheet,
// runs the gate, and on a green gate writes the capture, runs the whole suite under full,
// hands the batch to the read-only auditor and writes the verdict file. It returns the
// completion text the command prints. --gate-only stops after the gate: no model call,
// no write.
import type { CostIndex, Files, Llm, Logger, Shell } from "../../../shared/application/ports.ts";
import type { ConfigStore } from "../../../shared/application/config-store.ts";
import { loadDevContext } from "../../../shared/application/dev/load-dev-context.ts";
import type { DevContext } from "../../../shared/application/dev/load-dev-context.ts";
import { GIT_TOPLEVEL, workFolderLabel } from "../../../shared/application/dev/resolve-work-folder.ts";
import { costSummary } from "../../../shared/domain/dev/access-cost.ts";
import { classifyArtefact, isCode } from "../../../shared/domain/dev/artefacts.ts";
import type { RepoPack } from "../../../shared/domain/dev/repo-pack.ts";
import { AUDIT_UNFINISHED_GAP, isAuditUnfinishedGap, isUnfinishedSection, lastFinishedVerdict, lastVerdict, parseVerdictFile } from "../../../shared/domain/dev/verdict-format.ts";
import type { GapRow } from "../../../shared/domain/dev/verdict-format.ts";
import { AXES } from "../domain/audit-answer.ts";
import type { AuditRow, Axis } from "../domain/audit-answer.ts";
import { testRunSummary } from "../domain/capture-sections.ts";
import { cut, firstLine } from "../domain/text.ts";
import {
  carriedRows, formatWhen, renderVerdictSection, verdictFileName, writeVerdictFile,
} from "../domain/verdict.ts";
import { outputTail, recordingRunner, runAudit, shellValidationRunner } from "./audit.ts";
import type { UnfinishedAudit, ValidationRunner } from "./audit.ts";
import { stepRules } from "../../../shared/domain/dev/step-rules.ts";
import type { AuditBriefInput } from "./auditor-prompt.ts";
import { writeCapture } from "./capture.ts";
import { noPrecedents, precedentsLine, recallQuery, sheetTitle } from "../../../shared/application/dev/step-precedents.ts";
import type { StepPrecedents } from "../../../shared/application/dev/step-precedents.ts";
import type { WorkFolder } from "../../../shared/application/dev/resolve-work-folder.ts";
import { WORKSPACE, runGate } from "./run-gate.ts";
import type { DevVerifyTarget } from "./run-gate.ts";

export interface DevVerifyInputs { batch?: unknown; plan?: unknown; mode?: unknown; gateOnly?: unknown }
export interface DevVerifyDeps {
  files: Files; shell: Shell; config: Pick<ConfigStore, "readValue">;
  llm: Pick<Llm, "act" | "extract">; log: Logger; clock: () => Date;
  /** The run_validation tool's slot, when the crew offers the tool: bound to this audit's runner. */
  validationSlot?: { bind(runner: ValidationRunner): () => void };
  /** The access cost's code index; without it the Cost line says the crew wires none. */
  costIndex?: CostIndex;
  /** The shared memory's code-triggered recall (T4, before the audit); absent, nothing is recalled. */
  precedents?: StepPrecedents;
  /** After a GAPS verdict: the mistakes harvested into candidates and the /dev-learn nudge (M-7); absent, none. */
  harvest?: (work: Pick<WorkFolder, "folder" | "vfsPath">) => Promise<string[]>;
}
const FULL_SUITE_TIMEOUT_SECONDS = 900;

type Mode = "fast" | "full" | "resume";
interface Checked { batch: string; plan: string | null; mode: Mode; gateOnly: boolean }

const MAX_WARNINGS = 5;
const LIST_CAP = 500;
const ENTRIES_PROBED = 50;
const MAX_FILES_SHOWN = 10;
const MAX_GAP_CHARS = 120;
const MODES: readonly string[] = ["fast", "full", "resume"];
/** The exit code a shell result carries when the process reported none. */
const NO_EXIT_CODE = -1;

/** The row of an audit the step's budget stopped: Blocking, since nothing vouches for the batch; the replies are its evidence. */
export function unfinishedRow(unfinished: UnfinishedAudit, captureShown: string, batch: string): AuditRow {
  return {
    severity: "Blocking", axis: "Correctness",
    gap: AUDIT_UNFINISHED_GAP,
    evidence: `${unfinished.reason} — ${captureShown}/auditor-replies.txt`,
    fix: `audit the batch again (/dev-verify ${batch} resume), or split it if it spends the budget again`,
  };
}

const reasonOf = (error: unknown): string => firstLine(error instanceof Error ? error.message : String(error));

const bare = (entry: string): string => entry.replace(/\/+$/, "");
const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A write that fails names its path, so the BLOCKED line can say which. */
class WriteFailure extends Error {
  readonly path: string;
  constructor(path: string, cause: unknown) {
    super(reasonOf(cause));
    this.path = path;
  }
}

function recordingWriter(files: Files): Files {
  return {
    read: (path, max) => files.read(path, max),
    list: (path, max) => files.list(path, max),
    mounts: () => files.mounts(),
    write: async (path, content) => {
      try {
        await files.write(path, content);
      } catch (error) {
        throw new WriteFailure(path, error);
      }
    },
  };
}

function shown(path: string): string {
  return path.startsWith(`${WORKSPACE}/`) ? path.slice(WORKSPACE.length + 1) : path;
}

function checkInputs(input: DevVerifyInputs): Checked | string {
  const { batch, plan, mode, gateOnly } = input;
  if (typeof batch !== "string" || !/^F\d+$/.test(batch)) return "dev-verify: the input batch must be F<n>, e.g. F2";
  if (plan !== undefined && plan !== null && (typeof plan !== "string" || plan === "")) {
    return "dev-verify: the input plan must be a code or a <CODE>-PLAN.md path";
  }
  if (mode !== undefined && (typeof mode !== "string" || !MODES.includes(mode))) {
    return "dev-verify: the input mode must be fast, full or resume";
  }
  if (gateOnly !== undefined && typeof gateOnly !== "boolean") return "dev-verify: the input gateOnly must be true or false";
  return {
    batch, plan: typeof plan === "string" ? plan : null, mode: (mode ?? "fast") as Mode, gateOnly: gateOnly === true,
  };
}

function warningLines(warnings: readonly string[]): string[] {
  const lines = warnings.slice(0, MAX_WARNINGS).map((w) => `warning: ${w}`);
  if (warnings.length > MAX_WARNINGS) lines.push(`… ${warnings.length - MAX_WARNINGS} more warnings`);
  return lines;
}

async function listOrEmpty(files: Pick<Files, "list">, path: string): Promise<string[]> {
  try {
    return await files.list(path, LIST_CAP);
  } catch {
    return [];
  }
}

interface Sheet { planDir: string; name: string; prefix: string }

async function sheetsIn(files: Pick<Files, "list">, planDir: string, batch: string): Promise<Sheet[]> {
  const names = (await listOrEmpty(files, `${WORKSPACE}/${planDir}`)).map(bare).sort(byName);
  const out: Sheet[] = [];
  for (const name of names) {
    const a = classifyArtefact(name);
    if (a !== null && a.kind === "sheet" && a.batch === batch) out.push({ planDir, name, prefix: a.prefix });
  }
  return out;
}

function several(batch: string, sheets: readonly Sheet[]): string {
  return `dev-verify: several sheets for ${batch}: ${sheets.map((s) => `${s.planDir}/${s.name}`).join(", ")}: ` +
    `name the plan, e.g. /dev-verify ${batch} <code>`;
}

/** The sheet the plan token names, or the refusal text. */
async function resolveSheet(files: Pick<Files, "read" | "list">, work: string, args: Checked): Promise<Sheet | string> {
  const { batch, plan } = args;
  if (plan === null) {
    const entries = (await listOrEmpty(files, `${WORKSPACE}/${work}`)).map(bare).sort(byName).slice(0, ENTRIES_PROBED);
    const found: Sheet[] = [];
    for (const entry of entries) found.push(...(await sheetsIn(files, `${work}/${entry}`, batch)));
    if (found.length === 0) return `dev-verify: no ${work}/*/*-PLAN-${batch}.md: name the plan, e.g. /dev-verify ${batch} <code>`;
    if (found.length > 1) return several(batch, found);
    return found[0];
  }
  const neither = `dev-verify: '${plan}' is neither a code nor a <CODE>-PLAN.md path`;
  if (isCode(plan)) {
    const found = await sheetsIn(files, `${work}/${plan}`, batch);
    if (found.length === 0) return `dev-verify: ${work}/${plan}/ holds no *-PLAN-${batch}.md`;
    if (found.length === 1) return found[0];
    const named = found.filter((s) => s.prefix === plan.toUpperCase());
    return named.length === 1 ? named[0] : several(batch, found);
  }
  const relative = plan.startsWith(`${WORKSPACE}/`) ? plan.slice(WORKSPACE.length + 1) : plan;
  const slash = relative.lastIndexOf("/");
  if (relative.startsWith("/") || relative.split("/").includes("..") || slash <= 0) return neither;
  // The capture and the verdict are written beside the plan: a plan outside the work folder would put them elsewhere.
  if (!relative.startsWith(`${work}/`) || relative.split("/").some((s) => s === "" || s === ".")) {
    return `dev-verify: '${plan}' is not under the work folder ${work}/`;
  }
  const classified = classifyArtefact(relative.slice(slash + 1));
  if (classified === null || classified.kind !== "plan") return neither;
  const sheet: Sheet = { planDir: relative.slice(0, slash), name: `${classified.prefix}-PLAN-${batch}.md`, prefix: classified.prefix };
  try {
    await files.read(`${WORKSPACE}/${sheet.planDir}/${sheet.name}`);
  } catch {
    return `dev-verify: no ${sheet.planDir}/${sheet.name} beside ${relative}`;
  }
  return sheet;
}

function auditRowOf(row: GapRow): AuditRow {
  const axis: Axis = AXES.find((a) => a.toLowerCase() === row.axis.trim().toLowerCase()) ?? "Correctness";
  return { severity: row.severity, axis, gap: row.gap, evidence: row.evidence, fix: row.expectedFix };
}

interface SuiteRun {
  validation: string | null;
  notRun: string | null;
  row: AuditRow | null;
  brief: AuditBriefInput["suite"];
}

/** Under full: the pack's whole fast suite, once, with its own timeout. */
async function runSuite(shell: Pick<Shell, "run">, pack: RepoPack | null): Promise<SuiteRun> {
  const command = pack?.commands.test;
  if (command === undefined || command.trim() === "") {
    return { validation: null, notRun: "commands.test — the pack has none", row: null, brief: undefined };
  }
  let result;
  try {
    result = await shell.run(command, { timeoutSeconds: FULL_SUITE_TIMEOUT_SECONDS });
  } catch (error) {
    return { validation: null, notRun: `\`${command}\` — not run: ${reasonOf(error)}`, row: null, brief: undefined };
  }
  const tail = outputTail(result.stdout, result.stderr);
  if (result.timedOut === true) {
    const outcome = `timed out after ${FULL_SUITE_TIMEOUT_SECONDS} s`;
    const row: AuditRow = {
      severity: "Major", axis: "Test",
      gap: `the whole fast suite did not finish within ${FULL_SUITE_TIMEOUT_SECONDS} s`,
      evidence: `\`${command}\` ${outcome}, run by /dev-verify full`,
      fix: "make the suite finish within its timeout, or run it by hand and record the outcome",
    };
    return { validation: null, notRun: `\`${command}\` — ${outcome}`, row, brief: { command, outcome, tail } };
  }
  const exit = result.exitCode;
  const exitText = exit === NO_EXIT_CODE ? "no exit code reported" : `exit ${exit}`;
  const summary = testRunSummary(tail.split("\n"));
  const failed = summary.failed ?? 0;
  const row: AuditRow | null = exit !== 0 || failed > 0
    ? {
      severity: "Blocking", axis: "Test",
      gap: `the whole fast suite is red: ${exitText}${summary.failed === null ? "" : `, ${failed} failed`}`,
      evidence: `\`${command}\` ${exitText}, run by /dev-verify full`,
      fix: "make the suite green",
    }
    : null;
  return { validation: `whole fast suite — ${exitText}`, notRun: null, row, brief: { command, outcome: exitText, tail } };
}

function filesLine(changed: readonly string[], work: string): string {
  const outside = changed.filter((f) => !f.startsWith(`${work}/`));
  if (outside.length === 0) return "  files: none";
  const kept = outside.slice(0, MAX_FILES_SHOWN);
  if (outside.length > MAX_FILES_SHOWN) kept.push(`… ${outside.length - MAX_FILES_SHOWN} more`);
  return `  files: ${kept.join(", ")}`;
}

async function toplevelRefusal(shell: Pick<Shell, "run">): Promise<string | null> {
  let top: string;
  try {
    const r = await shell.run(GIT_TOPLEVEL);
    if (r.exitCode !== 0) return "dev-verify: not inside a git work tree";
    top = r.stdout.trim();
  } catch {
    return "dev-verify: not inside a git work tree";
  }
  if (top === "") return "dev-verify: not inside a git work tree";
  return top === WORKSPACE
    ? null
    : `dev-verify: the git work tree is ${top}, not ${WORKSPACE}: run Orkeon Code at the top of the repository`;
}

function target(ctx: DevContext, sheet: Sheet, batch: string): DevVerifyTarget {
  return {
    batch, code: sheet.planDir.slice(sheet.planDir.lastIndexOf("/") + 1), prefix: sheet.prefix,
    workShown: ctx.work.folder, planDirShown: sheet.planDir, sheetShown: `${sheet.planDir}/${sheet.name}`,
    pack: ctx.pack?.pack ?? null, packShown: ctx.pack?.shown ?? null,
  };
}

export async function runDevVerify(input: DevVerifyInputs, deps: DevVerifyDeps): Promise<string> {
  const args = checkInputs(input);
  if (typeof args === "string") return args;
  const top = await toplevelRefusal(deps.shell);
  if (top !== null) return top;

  const ctx = await loadDevContext(deps);
  const out = warningLines(ctx.warnings);
  const done = (...lines: string[]): string => [...out, ...lines].join("\n");
  const work = ctx.work.folder;
  if (ctx.work.outcome === "main-worktree") {
    return done(`dev-verify: the work folder ${work} is in the main worktree, outside the mounts: run /dev-verify from the main checkout`);
  }

  const sheet = await resolveSheet(deps.files, work, args);
  if (typeof sheet === "string") return done(sheet);
  const t = target(ctx, sheet, args.batch);
  out.push(`batch ${args.batch} — sheet ${t.sheetShown} — mode ${args.mode} — work folder ${workFolderLabel(ctx.work, t.packShown)}`);

  const verdictShown = `${t.planDirShown}/${verdictFileName(t.prefix, args.batch)}`;
  let previous: string | null = null;
  let previousGaps: AuditRow[] | null = null;
  /** The audit's own mode: a resume with no finished audit to resume audits the whole batch, and still appends. */
  let auditMode: Mode = args.mode;
  if (args.mode === "resume" && !args.gateOnly) {
    try {
      previous = await deps.files.read(`${WORKSPACE}/${verdictShown}`);
    } catch {
      return done(`dev-verify: resume needs ${verdictShown}: run /dev-verify ${args.batch} first`);
    }
    // An unfinished audit's row is no gap of the code: the resumed audit is not asked to judge it. After an audit the
    // budget stopped, the resume takes the gaps of the last audit that finished; with none, the whole batch is audited.
    const parsed = parseVerdictFile(previous);
    const last = lastVerdict(parsed);
    const finished = last !== null && isUnfinishedSection(last) ? lastFinishedVerdict(parsed) : last;
    if (finished === null) {
      auditMode = "fast";
      out.push("resume: no audit of this batch finished — the whole batch is audited (fast), the section appended");
    } else {
      if (finished !== last) out.push(`resume: the last audit did not finish — the gaps of the audit of ${finished.when ?? "before"} are resumed`);
      previousGaps = finished.rows.filter((r) => !isAuditUnfinishedGap(r.gap)).map(auditRowOf);
    }
  }

  const gate = await runGate(deps, t);
  if (!gate.ok) return done(`dev-verify: ${gate.error}`);
  const report = gate.run.report;
  if (!report.green) return done(...report.lines);
  if (args.gateOnly) return done(...report.lines, "dev-verify: --gate-only: the gate alone, no capture and no audit");
  const greenLine = report.lines[report.lines.length - 1];

  const files = recordingWriter(deps.files);
  const when = formatWhen(deps.clock());
  try {
    const capture = await writeCapture({ files, shell: deps.shell, costIndex: deps.costIndex }, t, gate.run, when);
    const costLine = costSummary(capture.cost);
    const suite = args.mode === "full" ? await runSuite(deps.shell, t.pack) : null;
    const commands = t.pack?.commands ?? {};
    // T4: the mistakes earlier audits found, from the sheet's title and the changed paths, before the auditor reads.
    const recalled = await (deps.precedents ?? noPrecedents)("T4", recallQuery([
      sheetTitle(gate.run.sheet), ...gate.run.changedFiles.filter((f) => !f.startsWith(`${work}/`)),
    ]));
    const brief: AuditBriefInput = {
      mode: auditMode, batch: args.batch, sheetPath: t.sheetShown, sheetText: gate.run.sheet, captureFiles: capture.files, captureTexts: capture.texts, table: capture.table,
      appliedRules: gate.run.facts.appliedIds.length > 0 ? gate.run.facts.appliedIds.join(", ") : "none",
      commands: { testClass: commands.testClass, testProject: commands.testProject, testIntegration: commands.testIntegration },
      previousGaps,
      ...(suite?.brief === undefined ? {} : { suite: suite.brief }),
      precedents: recalled.block,
    };
    // One runner for the tool and for code: a command the auditor ran through run_validation is not run again.
    // The step's rules apply to a validation as to the auditor's own shell_command (the gate does not see it).
    const runner = recordingRunner(shellValidationRunner(deps.shell, commands, stepRules("dev-verify")));
    const release = deps.validationSlot?.bind(runner);
    let audit: Awaited<ReturnType<typeof runAudit>>;
    try {
      audit = await runAudit({ llm: deps.llm, files, runner }, brief, capture.folder, capture.folderShown);
    } finally {
      release?.();
    }
    if (!audit.ok) {
      if (audit.unfinished === undefined) return done(greenLine, costLine, audit.text);
      const unfinished = audit.unfinished;
      // The budget ran out mid-audit: the verdict still says so, with the validations that ran, never a silent BLOCKED.
      const stopped = unfinishedRow(unfinished, capture.folderShown, args.batch);
      // The stopped row covers no mechanical gap: each one is carried, as no auditor weighed it.
      const answered = suite?.row ? [suite.row] : [];
      const section = renderVerdictSection({
        prefix: t.prefix, batch: args.batch, when, mode: auditMode,
        rows: [stopped, ...answered, ...carriedRows(answered, capture.rows)],
        validations: [...(suite?.validation ? [suite.validation] : []), ...unfinished.validations],
        notRun: [...(suite?.notRun ? [suite.notRun] : []), ...unfinished.notRun],
      });
      await files.write(`${WORKSPACE}/${verdictShown}`, writeVerdictFile(previous, section.text, args.mode));
      deps.log.info(`dev-verify: ${section.verdict} written to ${verdictShown} (the audit did not finish)`);
      return done(greenLine, costLine, ...section.text.trimEnd().split("\n"),
        `${audit.text}; ${section.verdict} written to ${verdictShown}: the audit did not finish`);
    }

    const answered = [...audit.answer.rows, ...audit.redRows, ...(suite?.row ? [suite.row] : [])];
    const section = renderVerdictSection({
      prefix: t.prefix, batch: args.batch, when, mode: auditMode,
      rows: [...answered, ...carriedRows(answered, capture.rows)],
      validations: [...(suite?.validation ? [suite.validation] : []), ...audit.validations],
      notRun: [...(suite?.notRun ? [suite.notRun] : []), ...audit.notRun],
    });
    if (audit.answer.verdict !== section.verdict) {
      deps.log.warn(`the auditor said ${audit.answer.verdict}; the rows make it ${section.verdict}`);
    }
    await files.write(`${WORKSPACE}/${verdictShown}`, writeVerdictFile(previous, section.text, args.mode));
    deps.log.info(`dev-verify: ${section.verdict} written to ${verdictShown}`);

    const lines = [greenLine, costLine, ...section.text.trimEnd().split("\n"), `written: ${verdictShown} — capture: ${capture.folderShown}/`];
    const recalledLine = precedentsLine([recalled]);
    if (recalledLine !== "") lines.push(recalledLine);
    if (section.verdict === "VALID") {
      lines.push(
        `→ Batch ${args.batch} VALID. The close commits the batch's files: /dev-implement ${args.batch} <code> --close ` +
          `(run by itself when /dev-implement launched this audit).`,
        filesLine(gate.run.changedFiles, work),
      );
    } else {
      const first = section.shown[0];
      lines.push(
        `→ /dev-implement ${args.batch} — correction: ${first.severity} ${first.axis}: ${cut(first.gap, MAX_GAP_CHARS)}`,
        `  it appends the gap to the sheet as a new step and runs it; the audit follows by itself (/dev-verify ${args.batch} resume)`,
      );
      // M-7: the verdict is written; the harvest reads it with the others and can only add lines.
      if (deps.harvest !== undefined) lines.push(...await deps.harvest(ctx.work));
    }
    return done(...lines);
  } catch (error) {
    if (error instanceof WriteFailure) return done(greenLine, `dev-verify: BLOCKED — ${shown(error.path)} cannot be written (${error.message})`);
    throw error;
  }
}
