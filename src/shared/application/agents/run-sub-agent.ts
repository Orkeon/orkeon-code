// runSubAgent: one sub-agent turn under its charter. It acts in the charter's
// mode with the behaviour specification as the system message, then extracts the
// final reply into a schema and checks it. An answer that fails is re-asked once
// over the same reply, with the problems found; no second act is made.

import type { Llm } from "../ports.ts";
import { MAX_BRIEF_CHARS, charterProblems } from "../../domain/agents/charter.ts";
import type { Charter, Checked } from "../../domain/agents/charter.ts";

export interface SubAgentCall<T> {
  charter: Charter;
  /** The charter's behaviour specification: the act's system message. */
  system: string;
  /** The task and its material: the act's prompt. */
  brief: string;
  /** The JSON schema the answer is extracted into. */
  schema: object;
  /** The extraction prompt over the act's final reply; `problems` is empty on the first try. */
  answerPrompt: (reply: string, problems: readonly string[]) => string;
  check: (value: unknown) => Checked<T>;
}

export type SubAgentFailure = "invalid-charter" | "brief-too-long" | "model-failed" | "unparsable";

export type SubAgentOutcome<T> =
  | { ok: true; value: T; reply: string; tries: 1 | 2 }
  | { ok: false; reason: SubAgentFailure; problems: string[]; reply: string };

function firstLine(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split("\n")[0];
}

async function tryAnswer<T>(
  llm: Pick<Llm, "extract">, call: SubAgentCall<T>, reply: string, problems: readonly string[],
): Promise<Checked<T>> {
  let value: unknown;
  try {
    value = await llm.extract(call.answerPrompt(reply, problems), call.schema);
  } catch (error) {
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
    });
  } catch (error) {
    return { ok: false, reason: "model-failed", problems: [firstLine(error)], reply: "" };
  }
  const first = await tryAnswer(llm, call, reply, []);
  if (first.ok) return { ok: true, value: first.value, reply, tries: 1 };
  const second = await tryAnswer(llm, call, reply, first.problems);
  if (second.ok) return { ok: true, value: second.value, reply, tries: 2 };
  return { ok: false, reason: "unparsable", problems: second.problems, reply };
}
