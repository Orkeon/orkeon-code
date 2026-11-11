// The pruning of a turn's tool loop, bound for one act (ADR 0027): with `compact.prune` on and a decision model on
// the host, the act carries a callback the runtime asks once its loop passes 40 % of the window. The callback keeps
// the small results without asking, has the decision model judge the others by batches, oldest first, and answers
// the runtime's verdicts. It fails open at every step: a setting that cannot be read, no decision model, a model
// that does not answer leave the loop as it is, and a model that failed once is not asked again in that act.
import type { ActRequest, DecisionModel, Logger, SessionStore } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import { DEFAULT_CONTEXT_WINDOW } from "../../domain/compaction-thresholds.ts";
import type { ContextPressure, PressureCall, PruneVerdict } from "../../domain/context-prune.ts";
import {
  PRUNE_BATCH_CALLS, PRUNE_CONFIG_KEY, PRUNE_MAX_CALLS, pressureSettings, pruneOn, pruneQuestions, pruneState, pruneTally,
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

/** The callback of one act working on `request`. */
function judge(deps: Pick<PruneDeps, "decision" | "log">, request: string): NonNullable<ActRequest["onContextPressure"]> {
  let failed = false;
  return async (pressure: ContextPressure) => {
    const verdicts: Record<string, PruneVerdict> = {};
    if (failed) return verdicts;
    const large: PressureCall[] = [];
    for (const call of pressure.calls) {
      if (worthJudging(call)) large.push(call);
      else verdicts[call.id] = "keep";
    }
    const asked = large.slice(0, PRUNE_MAX_CALLS);
    for (let start = 0; start < asked.length; start += PRUNE_BATCH_CALLS) {
      const batch = asked.slice(start, start + PRUNE_BATCH_CALLS);
      const answers = await deps.decision.ask(pruneState(request, batch), pruneQuestions(batch));
      if (answers === null) {
        failed = true;
        deps.log.warn(PRUNE_DECISION_FAILED);
        break;
      }
      Object.assign(verdicts, pruneVerdicts(batch, answers));
    }
    const tally = pruneTally(asked, verdicts);
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
