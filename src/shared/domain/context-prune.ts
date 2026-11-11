// The pruning of stale tool results inside a turn's tool loop (ADR 0027). Past a share of the context window, the
// runtime offers the older results of the read tools that ran (Orkeon #327): the host's decision model says, for
// each, whether it is still needed and whether it is needed whole, and the answer becomes a judgement: keep, head
// (the first characters) or drop. The model that decides sees the request and the calls (tool, input, size, age),
// never a result's content. A verdict answered to the runtime is final for the loop, `keep` included: a result
// judged needed is therefore left unanswered, and judged again once it has aged. Every number is stated with its
// reason. Pure.
import type { DecisionAnswers, DecisionQuestions } from "./decision/questions.ts";
import { yesNo } from "./decision/questions.ts";
import { CHARS_PER_TOKEN } from "./compaction-thresholds.ts";
import { PRUNE_JUDGE_THE_CALL, pruneCallLine, pruneNeededWhole, pruneStateText, pruneStillNeeded } from "./prompts.ts";

/** The setting that turns the pruning on: `on`, anything else is off. */
export const PRUNE_CONFIG_KEY = "compaction.prune";

/** The share of the window from which the loop's results are judged. The loop's messages never enter the session
 *  buffer, so no compaction relieves them: past the window the provider refuses the call. Under half the window,
 *  a turn that goes on reading keeps room for its next results and its answer. The runtime's measure (characters / 4,
 *  the tool schemas left out) is a floor, hence a share well under one. */
export const PRUNE_FILL_SHARE = 0.4;

/** The loop's last messages whose results are never offered: two model turns with up to two results each. */
export const PRUNE_KEEP_RECENT = 6;

/** What a `head` verdict keeps of a result: enough to recognise a file or a listing. */
export const PRUNE_HEAD_CHARS = 300;

/** Under this size a result is kept without asking: cutting it to PRUNE_HEAD_CHARS and its note frees nothing. */
export const PRUNE_MIN_RESULT_CHARS = 2 * PRUNE_HEAD_CHARS;

/** The probability of a yes from which a call counts as needed, or needed whole. */
export const PRUNE_KEEP_THRESHOLD = 0.5;

/** Calls judged by one request to the decision model: two questions each. */
export const PRUNE_BATCH_CALLS = 8;

/** Calls judged at one pressure, oldest first; the rest is offered again at the next model turn. */
export const PRUNE_MAX_CALLS = 3 * PRUNE_BATCH_CALLS;

/** Model turns a result judged needed waits before it is judged again: a judgement costs a request to the decision
 *  model, and what a task needs does not change at every tool call. */
export const PRUNE_REJUDGE_TURNS = 8;

/** The request and one call's input, as the decision model reads them, in characters. */
export const PRUNE_REQUEST_CHARS = 2_000;
export const PRUNE_INPUT_CHARS = 200;

/** What happens to one result: the runtime's `ContextPressureVerdict`. */
export type PruneVerdict = "keep" | "head" | "drop";

/** One tool call whose result may be pruned, as the runtime offers it. */
export interface PressureCall {
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
  /** Characters of the result the model is shown. */
  readonly resultChars: number;
  /** Model turns since the call ran. */
  readonly age: number;
}

/** What the runtime hands when the loop's messages pass the threshold. */
export interface ContextPressure {
  readonly usedTokens: number;
  readonly thresholdTokens: number;
  readonly calls: ReadonlyArray<PressureCall>;
}

/** When the runtime asks, and what a `head` keeps: the runtime's `contextPressure` option. */
export interface PressureSettings {
  thresholdTokens: number;
  keepRecent: number;
  headChars: number;
}

/** What a pressure pruned, for the line the log shows. */
export interface PruneTally {
  judged: number;
  dropped: number;
  cut: number;
  freedTokens: number;
}

/** Whether the setting's value turns the pruning on. */
export function pruneOn(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLowerCase() === "on";
}

/** The settings of a turn on a window of `window` tokens. */
export function pressureSettings(window: number): PressureSettings {
  return {
    thresholdTokens: Math.floor(window * PRUNE_FILL_SHARE),
    keepRecent: PRUNE_KEEP_RECENT,
    headChars: PRUNE_HEAD_CHARS,
  };
}

/** Whether a result is large enough for a verdict to free something. */
export function worthJudging(call: PressureCall): boolean {
  return call.resultChars > PRUNE_MIN_RESULT_CHARS;
}

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

function inputText(input: unknown): string {
  try {
    return cut(JSON.stringify(input) ?? "", PRUNE_INPUT_CHARS);
  } catch {
    return "";
  }
}

/** Whether a result judged needed when its call was `keptAtAge` turns old is due for another judgement; one never
 *  judged (undefined) is. */
export function dueForJudging(call: PressureCall, keptAtAge: number | undefined): boolean {
  return keptAtAge === undefined || call.age - keptAtAge >= PRUNE_REJUDGE_TURNS;
}

/** The state the decision model judges: the request, then the calls numbered from 1, oldest first. */
export function pruneState(request: string, calls: ReadonlyArray<PressureCall>): string {
  const lines = calls.map((call, i) => pruneCallLine(i + 1, call.name, inputText(call.input), call.resultChars, call.age));
  return pruneStateText(cut(request.trim(), PRUNE_REQUEST_CHARS), lines.join("\n"));
}

const neededName = (n: number): string => `needed_${n}`;
const wholeName = (n: number): string => `whole_${n}`;

/** Two yes/no questions per call, named by the call's number in the state. */
export function pruneQuestions(calls: ReadonlyArray<PressureCall>): DecisionQuestions {
  const questions: Record<string, DecisionQuestions[string]> = {};
  calls.forEach((_, i) => {
    questions[neededName(i + 1)] = yesNo(pruneStillNeeded(i + 1), PRUNE_JUDGE_THE_CALL);
    questions[wholeName(i + 1)] = yesNo(pruneNeededWhole(i + 1), PRUNE_JUDGE_THE_CALL);
  });
  return questions;
}

function yes(answers: DecisionAnswers, name: string): boolean | null {
  const answer = answers[name];
  return answer?.type === "noul" ? answer.probability >= PRUNE_KEEP_THRESHOLD : null;
}

/** The judgement of each call the answers settle, by call id: not needed, drop; needed but not whole, head; needed
 *  whole, keep. A call an answer is missing for is left out. */
export function pruneVerdicts(calls: ReadonlyArray<PressureCall>, answers: DecisionAnswers): Record<string, PruneVerdict> {
  const verdicts: Record<string, PruneVerdict> = {};
  calls.forEach((call, i) => {
    const needed = yes(answers, neededName(i + 1));
    const whole = yes(answers, wholeName(i + 1));
    if (needed === null || whole === null) return;
    verdicts[call.id] = !needed ? "drop" : whole ? "keep" : "head";
  });
  return verdicts;
}

/** What the verdicts free, the note a pruned result leaves counted as PRUNE_HEAD_CHARS. */
export function pruneTally(calls: ReadonlyArray<PressureCall>, verdicts: Readonly<Record<string, PruneVerdict>>): PruneTally {
  const tally: PruneTally = { judged: 0, dropped: 0, cut: 0, freedTokens: 0 };
  let freedChars = 0;
  for (const call of calls) {
    const verdict = verdicts[call.id];
    if (verdict === undefined) continue;
    tally.judged += 1;
    if (verdict === "drop") {
      tally.dropped += 1;
      freedChars += Math.max(0, call.resultChars - PRUNE_HEAD_CHARS);
    } else if (verdict === "head") {
      tally.cut += 1;
      freedChars += Math.max(0, call.resultChars - 2 * PRUNE_HEAD_CHARS);
    }
  }
  tally.freedTokens = Math.floor(freedChars / CHARS_PER_TOKEN);
  return tally;
}
