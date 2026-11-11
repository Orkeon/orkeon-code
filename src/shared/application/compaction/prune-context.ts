// The pruning of a turn's tool loop, bound for one act (ADR 0027): with `compact.prune` on and a decision model on
// the host, the act carries a callback the runtime asks once its loop passes 40 % of the window. The callback keeps
// the small results without asking, has the decision model judge the others by batches, oldest first, and answers
// the runtime's verdicts; a result judged needed is left unanswered and judged again once it has aged. It fails
// open at every step: a setting that cannot be read, no decision model, a model that does not answer leave the
// loop as it is, and a model that failed once is not asked again in that act. One binding serves one act.
import type { ActRequest, DecisionModel, Logger, SessionStore } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import { DEFAULT_CONTEXT_WINDOW } from "../../domain/compaction-thresholds.ts";
import type { ContextPressure, PressureCall, PruneVerdict } from "../../domain/context-prune.ts";
import {
  PRUNE_BATCH_CALLS, PRUNE_CONFIG_KEY, PRUNE_MAX_CALLS, dueForJudging, pressureSettings, pruneOn, pruneQuestions, pruneState, pruneTally,
  pruneVerdicts, worthJudging,
} from "../../domain/context-prune.ts";
import { PRUNE_DECISION_FAILED, PRUNE_WITHOUT_DECISION_MODEL, prunedLine } from "./messages.ts";

/** What the pruning adds to an act's request; nothing when it is off. */
export type ContextPruning = Pick<ActRequest, "onContextPressure" | "contextPressure">;

export interface PruneDeps {
  config: Pick<ConfigStore, "readValue">;
  decision: DecisionModel;
  session: Pick<SessionStore, "readBudget">;
  log: Pick<Logger, "info" | "warn">;
}

async function settingOn(config: PruneDeps["config"]): Promise<boolean> {
  try {
    const value = (await config.readValue(PRUNE_CONFIG_KEY)).value;
    return pruneOn(typeof value === "string" ? value : null);
  } catch {
    return false;
  }
}

async function windowOf(session: PruneDeps["session"]): Promise<number> {
  try {
    const { window } = await session.readBudget();
    return window > 0 ? window : DEFAULT_CONTEXT_WINDOW;
  } catch {
    return DEFAULT_CONTEXT_WINDOW;
  }
}

/** The callback of one act working on `request`. Its memory is the act's: the model that failed, and the age at
 *  which each result was last judged needed (the runtime numbers the calls of an act, `call-1`, `call-2`...). */
function judge(deps: Pick<PruneDeps, "decision" | "log">, request: string): NonNullable<ActRequest["onContextPressure"]> {
  let failed = false;
  const keptAt = new Map<string, number>();
  return async (pressure: ContextPressure) => {
    const verdicts: Record<string, PruneVerdict> = {};
    if (failed) return verdicts;
    const due: PressureCall[] = [];
    for (const call of pressure.calls) {
      // A small result is settled for the loop: nothing to free, never offered again.
      if (!worthJudging(call)) verdicts[call.id] = "keep";
      else if (dueForJudging(call, keptAt.get(call.id))) due.push(call);
    }
    const asked = due.slice(0, PRUNE_MAX_CALLS);
    const batches: PressureCall[][] = [];
    for (let start = 0; start < asked.length; start += PRUNE_BATCH_CALLS) batches.push(asked.slice(start, start + PRUNE_BATCH_CALLS));
    // The batches are asked together: the model turn waits for the slowest, not for their sum.
    const replies = await Promise.all(batches.map((batch) => deps.decision.ask(pruneState(request, batch), pruneQuestions(batch))));
    const judged: Record<string, PruneVerdict> = {};
    replies.forEach((answers, i) => {
      if (answers === null) failed = true;
      else Object.assign(judged, pruneVerdicts(batches[i], answers));
    });
    if (failed) deps.log.warn(PRUNE_DECISION_FAILED);
    for (const call of asked) {
      const verdict = judged[call.id];
      // A result judged needed is left unanswered, so the runtime offers it again; it is judged again once aged.
      if (verdict === "keep") keptAt.set(call.id, call.age);
      else if (verdict !== undefined) verdicts[call.id] = verdict;
    }
    const tally = pruneTally(asked, judged);
    if (tally.judged > 0) deps.log.info(prunedLine(tally.judged, tally.dropped, tally.cut, tally.freedTokens));
    return verdicts;
  };
}

/** What an act working on `request` carries: the callback and its settings, or nothing. */
export async function contextPruning(deps: PruneDeps, request: string): Promise<ContextPruning> {
  if (!await settingOn(deps.config)) return {};
  if (!deps.decision.available()) {
    deps.log.warn(PRUNE_WITHOUT_DECISION_MODEL);
    return {};
  }
  return {
    contextPressure: pressureSettings(await windowOf(deps.session)),
    onContextPressure: judge(deps, request),
  };
}
