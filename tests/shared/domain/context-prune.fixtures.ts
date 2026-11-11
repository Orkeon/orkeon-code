// The cases of shared/domain/context-prune.ts: the calls a pressure offers, what the decision model says of them
// and the verdicts read from it.
import type { DecisionAnswers } from "../../../src/shared/domain/decision/questions.ts";
import type { PressureCall, PruneTally, PruneVerdict } from "../../../src/shared/domain/context-prune.ts";

export function call(n: number, resultChars = 12_000, over: Partial<PressureCall> = {}): PressureCall {
  return { id: `call-${n}`, name: "file_read", input: { path: `/workspace/src/f${n}.ts` }, resultChars, age: 10 - n, ...over };
}

export const THREE_CALLS: readonly PressureCall[] = [call(1), call(2), call(3)];

const noul = (probability: number) => ({ type: "noul" as const, probability });

/** Call 1 is no longer needed, call 2 is needed for its first lines, call 3 is needed whole. */
export const MIXED_ANSWERS: DecisionAnswers = {
  needed_1: noul(0.1), whole_1: noul(0.1),
  needed_2: noul(0.9), whole_2: noul(0.2),
  needed_3: noul(0.9), whole_3: noul(0.8),
};

export const MIXED_VERDICTS: Record<string, PruneVerdict> = { "call-1": "drop", "call-2": "head", "call-3": "keep" };

export const VERDICT_CASES: readonly { readonly name: string; readonly answers: DecisionAnswers; readonly expected: Record<string, PruneVerdict> }[] = [
  { name: "drops a call that is not needed, cuts one needed in part, keeps one needed whole", answers: MIXED_ANSWERS, expected: MIXED_VERDICTS },
  {
    name: "keeps a call needed at exactly the threshold",
    answers: { ...MIXED_ANSWERS, needed_1: noul(0.5), whole_1: noul(0.5) },
    expected: { ...MIXED_VERDICTS, "call-1": "keep" },
  },
  {
    name: "leaves out a call one answer is missing for",
    answers: { needed_1: noul(0.1), needed_2: noul(0.9), whole_2: noul(0.2), needed_3: noul(0.9), whole_3: noul(0.8) },
    expected: { "call-2": "head", "call-3": "keep" },
  },
  {
    name: "leaves out a call answered by something else than a yes or a no",
    answers: { ...MIXED_ANSWERS, needed_3: { type: "score", score: 1, confidence: 0.9 } },
    expected: { "call-1": "drop", "call-2": "head" },
  },
];

/** 12 000 characters dropped free 11 700, cut free 11 400: 23 100 characters, 5 775 tokens. */
export const MIXED_TALLY: PruneTally = { judged: 3, dropped: 1, cut: 1, freedTokens: 5_775 };

export const ON_CASES: readonly { readonly value: string | null | undefined; readonly on: boolean }[] = [
  { value: "on", on: true },
  { value: " ON ", on: true },
  { value: "off", on: false },
  { value: "true", on: false },
  { value: "", on: false },
  { value: null, on: false },
  { value: undefined, on: false },
];

export const LONG_REQUEST = `Rename the port. ${"x".repeat(3_000)}`;

export const STATE_OF_ONE = "Request the assistant is working on:\nRename the port\n\nEarlier tool calls of this work, oldest first. " +
  "Each result can be had again by running the call again:\n" +
  '1. file_read {"path":"/workspace/src/f1.ts"}, a result of 12000 characters, 9 model turn(s) ago';
