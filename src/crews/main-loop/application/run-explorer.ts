// The explorer's one act on the brief a `spawn_agent` call hands it (docs/turn.md, "The explorer"): in its charter's
// mode, under its own system message, its cap of iterations. The answer is the call's result in the turn. An act whose
// token budget ran out gives its wrap-up, marked as cut short; one stopped at its cap has no answer to keep (the
// runtime's notice alone), so the call is refused with what happened and what to send instead.

import type { Llm, Logger } from "../../../shared/application/ports.ts";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";
import { EXPLORER_CHARTER } from "../domain/explorer-charter.ts";
import { EXPLORER_SYSTEM } from "./prompts.ts";
import { budgetExhaustedAnswerOf, iterationsExhaustedOf } from "../../../shared/domain/llm-failure.ts";
import {
  EXPLORER_CUT_SHORT, EXPLORER_EMPTY_BRIEF, explorerBriefTooLong, explorerOutOfIterations, explorerRunning,
} from "./messages.ts";

export interface ExplorerDeps {
  llm: Pick<Llm, "act">;
  log: Logger;
}

/** The explorer's report on `input`, the brief; throws on an empty brief, one over MAX_BRIEF_CHARS, or an act that
 *  used its iterations without a report. */
export async function runExplorer(input: unknown, deps: ExplorerDeps): Promise<string> {
  const brief = typeof input === "string" ? input.trim() : "";
  if (brief === "") throw new Error(EXPLORER_EMPTY_BRIEF);
  if (brief.length > MAX_BRIEF_CHARS) throw new Error(explorerBriefTooLong(brief.length, MAX_BRIEF_CHARS));
  deps.log.info(explorerRunning(brief.length, EXPLORER_CHARTER.mode));
  try {
    return await deps.llm.act(brief, {
      system: EXPLORER_SYSTEM,
      permissionMode: EXPLORER_CHARTER.mode,
      maxIterations: EXPLORER_CHARTER.maxIterations,
    });
  } catch (error) {
    const cut = budgetExhaustedAnswerOf(error);
    if (cut !== null) {
      deps.log.warn(EXPLORER_CUT_SHORT);
      return `${EXPLORER_CUT_SHORT}\n\n${cut.answer}`;
    }
    const stopped = iterationsExhaustedOf(error);
    if (stopped === null) throw error;
    const refusal = explorerOutOfIterations(stopped.iterations ?? EXPLORER_CHARTER.maxIterations);
    deps.log.warn(refusal);
    throw new Error(refusal);
  }
}
