// The audit itself: the auditor reads the capture under its charter and answers. It runs its
// validations itself through the run_validation tool when the crew offers it (the runner below,
// bound to the tool); those it names in its answer and has not run, code runs through the same
// runner and asks it once more with their outputs, and that second answer is final. Every run,
// by the tool or by code, is cited in the verdict. A failed run leaves the auditor's replies in
// the capture folder and returns the BLOCKED line; no verdict is decided here.
import type { Files, Llm, Shell } from "../../../shared/application/ports.ts";
import { runSubAgent } from "../../../shared/application/agents/run-sub-agent.ts";
import type { SubAgentOutcome } from "../../../shared/application/agents/run-sub-agent.ts";
import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import type { AuditAnswer } from "../domain/audit-answer.ts";
import { AUDIT_ANSWER_SCHEMA, MAX_VALIDATIONS, checkAuditAnswer } from "../domain/audit-answer.ts";
import { AUDITOR_CHARTER } from "../domain/auditor-charter.ts";
import { testRunSummary } from "../domain/capture-sections.ts";
import { outputTail } from "../../../shared/domain/dev/tool-guards.ts";
import { readBudgetExhausted } from "../../../shared/domain/dev/step-budget.ts";
import { checkValidation, validationLine } from "../../../shared/domain/dev/test-commands.ts";
import { firstLine } from "../domain/text.ts";
import { undecidedNotRun } from "../domain/verdict.ts";
import type { AuditBriefInput, ValidationReport } from "./auditor-prompt.ts";
import { AUDITOR_SYSTEM, buildAnswerPrompt, buildAuditBrief, buildValidationFollowUp } from "./auditor-prompt.ts";

const VALIDATION_TIMEOUT_SECONDS = 300;

/** One validation: the report the auditor reads, its verdict line when it ran, its Not run line when it did not. */
export interface ValidationRun { report: ValidationReport; line: string | null; notRun: string | null }

/** One command in, one report out: what code and the read-class run_validation tool both call. */
export interface ValidationRunner { run(command: string): Promise<ValidationRun> }

/** A runner that keeps every call it answered, in order, for the verdict. */
export interface RecordingRunner extends ValidationRunner { runs(): ValidationRun[] }

const sameCommand = (a: string, b: string): boolean => a.trim() === b.trim();

const reasonOf = (error: unknown): string => firstLine(error instanceof Error ? error.message : String(error));

export { outputTail };

/**
 * Wraps `inner` for one audit: a command already answered gets the same answer, not a second run;
 * past MAX_VALIDATIONS commands run, the next is refused. Every answer is kept, refusals included.
 */
export function recordingRunner(inner: ValidationRunner): RecordingRunner {
  const runs: ValidationRun[] = [];
  let ran = 0;
  return {
    async run(command: string) {
      const earlier = runs.find((r) => sameCommand(r.report.command, command));
      if (earlier !== undefined) return earlier;
      let run: ValidationRun;
      if (ran >= MAX_VALIDATIONS) {
        const outcome = `refused: ${MAX_VALIDATIONS} validations already ran in this audit`;
        run = { report: { command, outcome, tail: "" }, line: null, notRun: `\`${command}\` — ${outcome}` };
      } else {
        ran += 1;
        run = await inner.run(command);
      }
      runs.push(run);
      return run;
    },
    runs: () => [...runs],
  };
}

function isRecording(runner: ValidationRunner): runner is RecordingRunner {
  return typeof (runner as Partial<RecordingRunner>).runs === "function";
}

export function shellValidationRunner(shell: Pick<Shell, "run">, commands: RepoPackCommands): ValidationRunner {
  return {
    async run(cmd: string) {
      const check = checkValidation(cmd, commands);
      if (!check.ok) {
        const outcome = `refused: ${check.reason}`;
        return { report: { command: cmd, outcome, tail: "" }, line: null, notRun: `\`${cmd}\` — ${outcome}` };
      }
      let result;
      try {
        result = await shell.run(check.command, { timeoutSeconds: VALIDATION_TIMEOUT_SECONDS });
      } catch (error) {
        const outcome = `not run: ${reasonOf(error)}`;
        return { report: { command: cmd, outcome, tail: "" }, line: null, notRun: `\`${cmd}\` — ${outcome}` };
      }
      const tail = outputTail(result.stdout, result.stderr);
      if (result.timedOut === true) {
        const outcome = `timed out after ${VALIDATION_TIMEOUT_SECONDS} s`;
        return { report: { command: cmd, outcome, tail }, line: null, notRun: `\`${cmd}\` — ${outcome}` };
      }
      const summary = testRunSummary(tail.split("\n"));
      const tests = summary.passed === null && summary.failed === null ? null : (summary.passed ?? 0) + (summary.failed ?? 0);
      return {
        report: { command: cmd, outcome: `exit ${result.exitCode}`, tail },
        line: validationLine(check.command, result.exitCode, check.scope, tests),
        notRun: null,
      };
    },
  };
}

export type AuditOutcome =
  | { ok: true; answer: AuditAnswer; validations: string[]; notRun: string[]; rounds: 1 | 2 }
  | { ok: false; text: string };

type Deps = { llm: Pick<Llm, "act" | "extract">; files: Pick<Files, "write">; runner: ValidationRunner };

function ask(llm: Pick<Llm, "act" | "extract">, brief: string): Promise<SubAgentOutcome<AuditAnswer>> {
  return runSubAgent(llm, {
    charter: AUDITOR_CHARTER, system: AUDITOR_SYSTEM, brief,
    schema: AUDIT_ANSWER_SCHEMA, answerPrompt: buildAnswerPrompt, check: checkAuditAnswer,
  });
}

async function blocked(
  files: Pick<Files, "write">, outcome: Extract<SubAgentOutcome<AuditAnswer>, { ok: false }>,
  captureFolder: string, captureShown: string,
): Promise<AuditOutcome> {
  const name = "auditor-replies.txt";
  try {
    await files.write(`${captureFolder}/${name}`, `${outcome.reply.trimEnd()}\n--- problems\n${outcome.problems.join("\n")}\n`);
  } catch (error) {
    return { ok: false, text: `dev-verify: BLOCKED — ${captureShown}/${name} cannot be written (${reasonOf(error)})` };
  }
  const first = outcome.problems[0] ?? "no problem recorded";
  if (outcome.reason === "unparsable") {
    return {
      ok: false,
      text: `dev-verify: BLOCKED — the auditor's answer did not parse after one re-ask (${first}): ` +
        `its replies are in ${captureShown}/${name}; no verdict written`,
    };
  }
  const spent = outcome.reason === "model-failed" ? readBudgetExhausted(first) : null;
  if (spent !== null) {
    return {
      ok: false,
      text: `dev-verify: BLOCKED — the step's budget is spent (${spent}: ${first}): the capture stays in ` +
        `${captureShown}/; no verdict written`,
    };
  }
  if (outcome.reason === "model-failed") {
    return {
      ok: false,
      text: `dev-verify: BLOCKED — the model call failed (${first}): the capture stays in ${captureShown}/; no verdict written`,
    };
  }
  return { ok: false, text: `dev-verify: BLOCKED — ${first}; no verdict written` };
}

/** The validations file: per command, `$ <command>`, the outcome, the tail. */
async function writeValidations(
  files: Pick<Files, "write">, runs: readonly ValidationRun[], captureFolder: string, captureShown: string,
): Promise<string | null> {
  const log = runs.map(({ report: r }) => [`$ ${r.command}`, r.outcome, r.tail.trimEnd()].filter((l) => l !== "").join("\n"));
  try {
    await files.write(`${captureFolder}/validations.txt`, `${log.join("\n\n")}\n`);
    return null;
  } catch (error) {
    return `dev-verify: BLOCKED — ${captureShown}/validations.txt cannot be written (${reasonOf(error)})`;
  }
}

export async function runAudit(
  deps: Deps, brief: AuditBriefInput, captureFolder: string, captureShown: string,
): Promise<AuditOutcome> {
  const runner = isRecording(deps.runner) ? deps.runner : recordingRunner(deps.runner);
  const lines = (runs: readonly ValidationRun[]) => runs.map((r) => r.line).filter((l): l is string => l !== null);
  const notRuns = (runs: readonly ValidationRun[]) => runs.map((r) => r.notRun).filter((n): n is string => n !== null);
  const ranAlready = (command: string) => runner.runs().some((r) => sameCommand(r.report.command, command));

  const text = buildAuditBrief(brief);
  const first = await ask(deps.llm, text);
  if (!first.ok) return blocked(deps.files, first, captureFolder, captureShown);
  // The validations the answer names that the auditor did not run itself through run_validation.
  const pending = first.value.validations.slice(0, MAX_VALIDATIONS).filter((c) => !ranAlready(c));
  if (pending.length === 0) {
    const runs = runner.runs();
    if (runs.length > 0) {
      const failed = await writeValidations(deps.files, runs, captureFolder, captureShown);
      if (failed !== null) return { ok: false, text: failed };
    }
    return {
      ok: true, answer: first.value, validations: lines(runs),
      notRun: [...notRuns(runs), ...undecidedNotRun(first.value.undecided)], rounds: 1,
    };
  }

  const reports = [];
  for (const command of pending) reports.push((await runner.run(command)).report);
  const written = runner.runs().length;
  const failed = await writeValidations(deps.files, runner.runs(), captureFolder, captureShown);
  if (failed !== null) return { ok: false, text: failed };

  const second = await ask(deps.llm, buildValidationFollowUp(brief, first.value, reports));
  if (!second.ok) return blocked(deps.files, second, captureFolder, captureShown);
  const answer = second.value;
  const runs = runner.runs();
  if (runs.length > written) {
    // The auditor ran more through the tool while it weighed the outputs.
    const late = await writeValidations(deps.files, runs, captureFolder, captureShown);
    if (late !== null) return { ok: false, text: late };
  }
  const late = answer.validations
    .filter((c) => !ranAlready(c))
    .map((c) => `\`${c}\` — named after the validations had run`);
  return {
    ok: true,
    answer,
    validations: lines(runs),
    notRun: [...notRuns(runs), ...late, ...undecidedNotRun(answer.undecided)],
    rounds: 2,
  };
}
