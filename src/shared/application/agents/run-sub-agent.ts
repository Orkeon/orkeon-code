// runSubAgent: one sub-agent turn under its charter. It acts in the charter's
// mode with the behaviour specification as the system message, then extracts the
// final reply into a schema and checks it. An answer that fails is re-asked once
// over the same reply, with the problems found; no second act is made. A call
// that throws a cancellation (the host cancelled the run, /tasks stop stopped the
// child) is `cancelled`; a step budget spent during the extraction is the model's
// failure, not an answer that did not parse.

import type { Llm } from "../ports.ts";
import { MAX_BRIEF_CHARS, charterProblems } from "../../domain/agents/charter.ts";
import type { Charter, Checked } from "../../domain/agents/charter.ts";
import { readBudgetExhausted } from "../../domain/dev/step-budget.ts";

export interface SubAgentCall<T> {
  charter: Charter;
  /** The charter's behaviour specification: the act's system message. */
  system: string;
  /** The task and its material: the act's prompt. */
  brief: string;
  /** The tools the act is offered, a subset of the agent's; the agent's whole catalogue when absent. */
  tools?: readonly string[];
  /** The JSON schema the answer is extracted into. */
  schema: object;
  /** The extraction prompt over the act's final reply; `problems` is empty on the first try. */
  answerPrompt: (reply: string, problems: readonly string[]) => string;
  check: (value: unknown) => Checked<T>;
}

export type SubAgentFailure = "invalid-charter" | "brief-too-long" | "model-failed" | "cancelled" | "unparsable";

export type SubAgentOutcome<T> =
  | { ok: true; value: T; reply: string; tries: 1 | 2 }
  | { ok: false; reason: SubAgentFailure; problems: string[]; reply: string };

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

/** The .NET cancellation name, the DOM's abort, the runtime's cancel sentence, and the stop /tasks serves on a child (runChildAct). */
// Not TaskCanceled: .NET raises it for an HTTP timeout too, which is the model's failure.
const CANCEL_NAME = /^OperationCanceled(?:Exception)?$|^AbortError$/;
const CANCEL_MESSAGE = /\b(?:the )?(?:operation|task) was cancell?ed\b|stopped by \/tasks stop/i;

/** Why a thrown call failed: a cancellation, else the model's failure. */
function failureOf(error: unknown): "cancelled" | "model-failed" {
  const name = error instanceof Error ? error.name : "";
  return CANCEL_NAME.test(name) || CANCEL_MESSAGE.test(firstLine(error)) ? "cancelled" : "model-failed";
}

type Answer<T> = Checked<T> | { ok: false; reason: "cancelled" | "model-failed"; problems: string[] };

async function tryAnswer<T>(
  llm: Pick<Llm, "extract">, call: SubAgentCall<T>, reply: string, problems: readonly string[],
): Promise<Answer<T>> {
  let value: unknown;
  try {
    value = await llm.extract(call.answerPrompt(reply, problems), call.schema);
  } catch (error) {
    const reason = failureOf(error);
    if (reason === "cancelled" || readBudgetExhausted(error) !== null) return { ok: false, reason, problems: [firstLine(error)] };
    return { ok: false, problems: [`the answer did not parse: ${firstLine(error)}`] };
  }
  return call.check(value);
}

export async function runSubAgent<T>(llm: Pick<Llm, "act" | "extract">, call: SubAgentCall<T>): Promise<SubAgentOutcome<T>> {
  const { charter, brief } = call;
  const invalid = charterProblems(charter);
  if (invalid.length > 0) return { ok: false, reason: "invalid-charter", problems: invalid, reply: "" };
  if (brief.length > MAX_BRIEF_CHARS) {
    return {
      ok: false, reason: "brief-too-long", reply: "",
      problems: [`the brief is ${brief.length} characters, over ${MAX_BRIEF_CHARS}`],
    };
  }
  let reply: string;
  try {
    reply = await llm.act(brief, {
      system: call.system,
      permissionMode: charter.mode,
      maxIterations: charter.maxIterations,
      ...(charter.model === undefined ? {} : { model: charter.model }),
      ...(call.tools === undefined ? {} : { tools: [...call.tools] }),
    });
  } catch (error) {
    return { ok: false, reason: failureOf(error), problems: [firstLine(error)], reply: "" };
  }
  const first = await tryAnswer(llm, call, reply, []);
  if (first.ok) return { ok: true, value: first.value, reply, tries: 1 };
  if ("reason" in first) return { ok: false, reason: first.reason, problems: first.problems, reply };
  const second = await tryAnswer(llm, call, reply, first.problems);
  if (second.ok) return { ok: true, value: second.value, reply, tries: 2 };
  if ("reason" in second) return { ok: false, reason: second.reason, problems: second.problems, reply };
  return { ok: false, reason: "unparsable", problems: second.problems, reply };
}
