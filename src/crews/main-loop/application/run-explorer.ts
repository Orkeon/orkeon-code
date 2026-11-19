// The explorer's one act on the brief a `spawn_agent` call hands it (docs/turn.md, "The explorer"): in its charter's
// mode, under its own system message, its cap of iterations. The answer is the call's result in the turn.

import type { Llm, Logger } from "../../../shared/application/ports.ts";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";
import { EXPLORER_CHARTER } from "../domain/explorer-charter.ts";
import { EXPLORER_SYSTEM } from "./prompts.ts";
import { EXPLORER_EMPTY_BRIEF, explorerBriefTooLong, explorerRunning } from "./messages.ts";

export interface ExplorerDeps {
  llm: Pick<Llm, "act">;
  log: Logger;
}

/** The explorer's report on `input`, the brief; throws on an empty brief or one over MAX_BRIEF_CHARS. */
export async function runExplorer(input: unknown, deps: ExplorerDeps): Promise<string> {
  const brief = typeof input === "string" ? input.trim() : "";
  if (brief === "") throw new Error(EXPLORER_EMPTY_BRIEF);
  if (brief.length > MAX_BRIEF_CHARS) throw new Error(explorerBriefTooLong(brief.length, MAX_BRIEF_CHARS));
  deps.log.info(explorerRunning(brief.length, EXPLORER_CHARTER.mode));
  return await deps.llm.act(brief, {
    system: EXPLORER_SYSTEM,
    permissionMode: EXPLORER_CHARTER.mode,
    maxIterations: EXPLORER_CHARTER.maxIterations,
  });
}
