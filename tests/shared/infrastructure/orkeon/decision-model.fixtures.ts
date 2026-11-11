// A `tools` namespace that holds the decide tool, or not, and the adapter over it. The tool is in no built-in
// list, so it is no member of FakeTools: a recorder of its own stands for it.
import { createDecisionModel } from "../../../../src/shared/infrastructure/orkeon/decision-model.ts";
import type { DecisionQuestions } from "../../../../src/shared/domain/decision/questions.ts";

export const QUESTIONS: DecisionQuestions = { keep: { type: "noul", criteria: { true: "The output is still needed" } } };

export const STATE = "tool call 3: file_read src/a.ts (12 000 characters)";

/** The namespace of a host with a decision model: `systemOneDecide` answers `reply` (an Error is thrown). */
export class DecideTools {
  reply: unknown = { success: true, answers: { keep: { type: "noul", noul: 0.9 } }, model: "any" };
  inputs: unknown[] = [];

  systemOneDecide = async (input: unknown): Promise<unknown> => {
    this.inputs.push(input);
    if (this.reply instanceof Error) throw this.reply;
    return this.reply;
  };
}

export function modelOverTools() {
  const tools = new DecideTools();
  return { tools, model: createDecisionModel(tools) };
}

export const UNANSWERED: readonly { readonly name: string; readonly reply: unknown }[] = [
  { name: "answers nothing when the tool says the decision was not taken", reply: { success: false, error: "the model timed out" } },
  { name: "answers nothing when the tool throws", reply: new Error("connection refused") },
  { name: "answers nothing when an answer is missing", reply: { success: true, answers: {} } },
  { name: "answers nothing when the tool returns nothing", reply: undefined },
];
