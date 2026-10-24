// The audit itself: the auditor reads the capture under its charter and answers; when it
// names validations, code runs them through the runner and asks it once more with their
// outputs, and that second answer is final. A failed run leaves the auditor's replies in
// the capture folder and returns the BLOCKED line; no verdict is decided here.
import type { Files, Llm, Shell } from "../../../shared/application/ports.ts";
import { runSubAgent } from "../../../shared/application/agents/run-sub-agent.ts";
import type { SubAgentOutcome } from "../../../shared/application/agents/run-sub-agent.ts";
import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import type { AuditAnswer } from "../domain/audit-answer.ts";
import { AUDIT_ANSWER_SCHEMA, MAX_VALIDATIONS, checkAuditAnswer } from "../domain/audit-answer.ts";
import { AUDITOR_CHARTER } from "../domain/auditor-charter.ts";
import { tailLines, testRunSummary } from "../domain/capture-sections.ts";
import { checkValidation, validationLine } from "../domain/validations.ts";
import { firstLine } from "../domain/text.ts";
import { undecidedNotRun } from "../domain/verdict.ts";
import type { AuditBriefInput, ValidationReport } from "./auditor-prompt.ts";
import { AUDITOR_SYSTEM, buildAnswerPrompt, buildAuditBrief, buildValidationFollowUp } from "./auditor-prompt.ts";

const VALIDATION_TIMEOUT_SECONDS = 300;
const TAIL_LINES = 15;
const TAIL_CHARS = 1_500;

/** The seam a read-class `run_validation` tool will replace (RT-18): one command in, one report out. */
export interface ValidationRunner { run(command: string): Promise<{ report: ValidationReport; line: string | null; notRun: string | null }> }

const reasonOf = (error: unknown): string => firstLine(error instanceof Error ? error.message : String(error));

/** At most 15 lines and 1 500 characters of the output, stderr after stdout. */
export function outputTail(stdout: string, stderr: string): string {
  const joined = [stdout.trimEnd(), stderr.trimEnd()].filter((t) => t !== "").join("\n");
  const text = tailLines(joined, TAIL_LINES).join("\n");
  return text.length <= TAIL_CHARS ? text : text.slice(-TAIL_CHARS);
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
  if (outcome.reason === "model-failed") {
    return {
      ok: false,
      text: `dev-verify: BLOCKED — the model call failed (${first}): the capture stays in ${captureShown}/; no verdict written`,
    };
  }
  return { ok: false, text: `dev-verify: BLOCKED — ${first}; no verdict written` };
}

export async function runAudit(
  deps: Deps, brief: AuditBriefInput, captureFolder: string, captureShown: string,
): Promise<AuditOutcome> {
  const text = buildAuditBrief(brief);
  const first = await ask(deps.llm, text);
  if (!first.ok) return blocked(deps.files, first, captureFolder, captureShown);
  if (first.value.validations.length === 0) {
    return { ok: true, answer: first.value, validations: [], notRun: undecidedNotRun(first.value.undecided), rounds: 1 };
  }

  const runs = [];
  for (const command of first.value.validations.slice(0, MAX_VALIDATIONS)) runs.push(await deps.runner.run(command));
  const reports = runs.map((r) => r.report);
  const log = reports.map((r) => [`$ ${r.command}`, r.outcome, r.tail.trimEnd()].filter((l) => l !== "").join("\n"));
  try {
    await deps.files.write(`${captureFolder}/validations.txt`, `${log.join("\n\n")}\n`);
  } catch (error) {
    return { ok: false, text: `dev-verify: BLOCKED — ${captureShown}/validations.txt cannot be written (${reasonOf(error)})` };
  }

  const second = await ask(deps.llm, buildValidationFollowUp(brief, first.value, reports));
  if (!second.ok) return blocked(deps.files, second, captureFolder, captureShown);
  const answer = second.value;
  const late = answer.validations.map((c) => `\`${c}\` — named after the validations had run`);
  return {
    ok: true,
    answer,
    validations: runs.map((r) => r.line).filter((l): l is string => l !== null),
    notRun: [
      ...runs.map((r) => r.notRun).filter((n): n is string => n !== null),
      ...late,
      ...undecidedNotRun(answer.undecided),
    ],
    rounds: 2,
  };
}
