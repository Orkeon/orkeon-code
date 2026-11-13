// The facts a change brief stands on, gathered by code before anything is written: the origin read whole (an issue
// by `gh issue view`, a file of the checkout, or the text typed), and for a bug or a perf change the one command
// run - the `--run` one, else one the model proposes - accepted only when it is a narrow test command of the pack
// or the product's CLI followed by plain words (no path out of the checkout, no glob or expansion). Its output goes
// to repro-<code>.txt. A bug that does not fail - or whose command never ran (exit 126, 127) or was killed - a
// measurement that fails, or a run that times out stops the step: nothing else is written.
import type { Files, Llm, Shell } from "../../../shared/application/ports.ts";
import { firstLine, readRequest } from "../../../shared/application/dev/source-step.ts";
import type { RepoPackCommands } from "../../../shared/domain/dev/repo-pack.ts";
import { checkValidation, plainWords } from "../../../shared/domain/dev/test-commands.ts";
import { REPRO_SCHEMA } from "./prompts.ts";
import { buildReproPrompt } from "./change-material.ts";
import { GLOB_OR_EXPANSION, MEASURES_THE_COST, PATH_OUT_OF_CHECKOUT, REPRODUCES_THE_BUG, SHELL_OPERATOR_AFTER_CLI, evidenceCouldNotRun, couldNotStart, didNotReproduce, issuePrintedNoJson, issueViewFailed, measuredFact, measurementFailed, noCommandPicked, ranOutOfTime, reproductionFact, runMayNotRun, runtimeRefused, wasKilled } from "./messages.ts";
import { NOT_ONE_LINE } from "../../../shared/domain/dev/messages.ts";
import { errorText } from "../../../shared/domain/error-text.ts";
import { answerDidNotParse } from "../../../shared/application/agents/messages.ts";

export const REPRO_TIMEOUT_SECONDS = 600;
const MAX_COMMAND_CHARS = 400;
const MAX_OUTPUT_CHARS = 200_000;
const TAIL_LINES = 15;
const ISSUE = /^#(\d{1,7})$/;
/** Exits of a shell that never ran the command: 126 not executable, 127 not found. */
const NOT_RUN_EXITS = new Set([126, 127]);

export const issueCommand = (n: string): string => `gh issue view ${n} --json number,title,body,url`;

export type Origin = { text: string; from: string } | { refused: string };

export async function readOrigin(step: string, deps: { shell: Pick<Shell, "run">; files: Pick<Files, "read"> }, origin: string): Promise<Origin> {
  const issue = ISSUE.exec(origin);
  if (issue === null) return readRequest(step, deps.files, origin);
  const command = issueCommand(issue[1]);
  let out: string;
  try {
    const r = await deps.shell.run(command);
    if (r.exitCode !== 0) throw new Error((r.stderr || r.stdout).trim() || `exit ${r.exitCode}`);
    out = r.stdout;
  } catch (e) {
    return { refused: issueViewFailed(step, command, firstLine(e)) };
  }
  try {
    const v = JSON.parse(out) as { number?: number; title?: string; body?: string; url?: string };
    return { text: [`#${v.number ?? issue[1]} ${v.title ?? ""}`.trim(), v.url ?? "", "", v.body ?? ""].join("\n").trim(), from: `issue #${issue[1]}` };
  } catch {
    return { refused: issuePrintedNoJson(step, command) };
  }
}

/** The values a word of the CLI may carry a path in: the word, what follows each `=` (`--out=x`, `out=x`,
 *  `--a=b=/x`) and, for short options, what follows each letter of the cluster (`-o/x`, `-xf/x`). */
function pathValues(word: string): string[] {
  const values = [word];
  for (let i = word.indexOf("="); i >= 0; i = word.indexOf("=", i + 1)) values.push(word.slice(i + 1));
  const cluster = /^-[A-Za-z]+/.exec(word);
  if (cluster !== null) for (let i = 2; i <= cluster[0].length; i++) values.push(word.slice(i));
  return values;
}

const outOfCheckout = (value: string): boolean =>
  value.split(/[\\/]/).includes("..") || value.startsWith("/") || value.startsWith("~") || /^[A-Za-z]:/.test(value) || value.includes("\\");

/** Why a command may not run, null when it may: a narrow test command of the pack, or the CLI and plain words. */
export function commandProblem(command: string, commands: RepoPackCommands): string | null {
  const c = command.trim();
  if (c === "" || /[\r\n]/.test(c) || c.length > MAX_COMMAND_CHARS) return NOT_ONE_LINE;
  const cli = commands.cli?.trim() ?? "";
  if (cli !== "" && (c === cli || c.startsWith(`${cli} `))) {
    if (!plainWords(c)) return SHELL_OPERATOR_AFTER_CLI;
    const tail = c.slice(cli.length);
    let quoted = false;
    for (const ch of tail) {
      if (ch === '"') quoted = !quoted;
      else if (/[$`]/.test(ch) || (!quoted && /[*?[\]{}]/.test(ch))) return GLOB_OR_EXPANSION;
    }
    for (const word of tail.trim().split(/\s+/).filter((w) => w !== "")) {
      if (pathValues(word.replace(/"/g, "")).some(outOfCheckout)) return PATH_OUT_OF_CHECKOUT;
    }
    return null;
  }
  const check = checkValidation(c, commands);
  return check.ok ? null : check.reason;
}

function packCommandList(commands: RepoPackCommands): string[] {
  return [commands.testClass, commands.testProject, commands.testIntegration, commands.cli === undefined ? undefined : `${commands.cli} <arguments>`]
    .filter((c): c is string => c !== undefined && c.trim() !== "");
}

export interface Ran { command: string; exitCode: number; seconds: number; timedOut: boolean; output: string; refused: boolean }

/** The command to run: the --run one, else the model's (re-asked once), checked by commandProblem. */
export async function pickCommand(
  step: string, llm: Pick<Llm, "extract">, kind: "bug" | "perf", given: string, origin: string, commands: RepoPackCommands,
): Promise<{ command: string } | { refused: string }> {
  if (given !== "") {
    const problem = commandProblem(given, commands);
    return problem === null ? { command: given.trim() } : {
      refused: runMayNotRun(step, given, problem),
    };
  }
  let problems: string[] = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    let command = "";
    try {
      const v = await llm.extract(buildReproPrompt(kind, origin, packCommandList(commands), problems), REPRO_SCHEMA) as { command?: unknown };
      command = typeof v?.command === "string" ? v.command.trim() : "";
    } catch (e) {
      problems = [answerDidNotParse(errorText(e))];
      continue;
    }
    const problem = commandProblem(command, commands);
    if (problem === null) return { command };
    problems = [`'${command}': ${problem}`];
  }
  const what = kind === "bug" ? REPRODUCES_THE_BUG : MEASURES_THE_COST;
  return { refused: noCommandPicked(step, what, problems[0] ?? "none") };
}

export async function runEvidence(shell: Pick<Shell, "run">, command: string, clock: () => Date): Promise<Ran> {
  const start = clock().getTime();
  let exitCode = -1;
  let timedOut = false;
  let output = "";
  let refused = false;
  try {
    const r = await shell.run(command, { timeoutSeconds: REPRO_TIMEOUT_SECONDS });
    exitCode = r.exitCode;
    timedOut = r.timedOut === true;
    output = [r.stdout, r.stderr].filter((s) => s !== "").join("\n");
  } catch (e) {
    output = runtimeRefused(firstLine(e));
    refused = true;
  }
  const seconds = Math.round((clock().getTime() - start) / 100) / 10;
  return { command, exitCode, seconds, timedOut, output: output.slice(0, MAX_OUTPUT_CHARS), refused };
}

export function reproFile(ran: Ran, date: string): string {
  return [
    `command: ${ran.command}`, `date: ${date}`, `exit: ${ran.timedOut ? "timed out" : ran.exitCode}`, `seconds: ${ran.seconds}`, "",
    ran.output,
  ].join("\n").trimEnd() + "\n";
}

/** The lines of § 2 code writes from the run. */
export function factLines(kind: "bug" | "perf", ran: Ran, fileName: string): string[] {
  const tail = ran.output.trimEnd().split(/\r?\n/).slice(-TAIL_LINES).map((l) => `  ${l.replace(/```/g, "'''")}`.trimEnd());
  const head = kind === "bug"
    ? reproductionFact(ran.command, ran.exitCode, ran.seconds, fileName)
    : measuredFact(ran.command, ran.seconds, ran.exitCode, fileName);
  return ran.output.trim() === "" ? [head] : [head, "- **Observed** (last lines):", "", "  ```text", ...tail, "  ```"];
}

/** Why the run stops the step, null when it stands as evidence. */
export function runStop(step: string, kind: "bug" | "perf", ran: Ran, shown: string): string | null {
  if (ran.refused) return evidenceCouldNotRun(step, ran.command, ran.output);
  if (ran.timedOut) return ranOutOfTime(step, ran.command, REPRO_TIMEOUT_SECONDS, shown);
  if (kind === "bug" && NOT_RUN_EXITS.has(ran.exitCode)) {
    return couldNotStart(step, ran.command, ran.exitCode, shown);
  }
  if (kind === "bug" && ran.exitCode > 128) {
    return wasKilled(step, ran.command, ran.exitCode, shown);
  }
  if (kind === "bug" && ran.exitCode === 0) {
    return didNotReproduce(step, ran.command, shown);
  }
  if (kind === "perf" && ran.exitCode !== 0) {
    return measurementFailed(step, ran.command, ran.exitCode, shown);
  }
  return null;
}
