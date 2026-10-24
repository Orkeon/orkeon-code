// One act of a built-in charter on a brief, in a run of its own: the repair of an agent instance
// whose run has ended (/tasks send or repair, A-3). The brief carries the previous report and the
// operator's message (domain/agents/instances.ts buildRepairBrief); the run has no other context.

import type { Llm, Logger } from "../../../shared/application/ports.ts";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";
import type { Charter } from "../../../shared/domain/agents/charter.ts";

export interface AgentRunInputs {
  charter?: unknown;
  system?: unknown;
  brief?: unknown;
}

export interface AgentRunDeps {
  llm: Pick<Llm, "act">;
  log: Logger;
  /** The charters this crew can run, by name. */
  charters: Readonly<Record<string, Charter>>;
}

/** The charter's reply to the brief; throws on an unknown charter or a brief it cannot take. */
export async function runAgentRun(input: AgentRunInputs, deps: AgentRunDeps): Promise<string> {
  const name = String(input?.charter ?? "");
  const charter = deps.charters[name];
  if (charter === undefined) {
    throw new Error(`agent-run: unknown charter '${name}' (known: ${Object.keys(deps.charters).join(", ")})`);
  }
  const brief = String(input?.brief ?? "").trim();
  if (brief === "") throw new Error("agent-run: the brief is empty");
  if (brief.length > MAX_BRIEF_CHARS) {
    throw new Error(`agent-run: the brief is ${brief.length} characters, over ${MAX_BRIEF_CHARS}`);
  }
  const system = String(input?.system ?? "");
  deps.log.info(`agent-run: ${charter.name} in ${charter.mode}, a new run (no context of the instance it repairs)`);
  return await deps.llm.act(brief, {
    ...(system === "" ? {} : { system }),
    permissionMode: charter.mode,
    maxIterations: charter.maxIterations,
    ...(charter.model === undefined ? {} : { model: charter.model }),
  });
}
