// The pruning of an act's tool loop (ADR 0027, ADR 0034): with `compaction.prune` on and a decision model on the
// host, the act asks the runtime for its own pruning (`act({ prune: true })`, Orkeon #461), on the host's numbers
// (`Orkeon:Compaction:Prune`). The runtime judges the older results of the read tools, keeps, cuts or drops them,
// and hands back what it did, which is logged. It fails open: a setting that cannot be read or no decision model
// leave the loop as it is. One binding serves one act: the main loop binds it itself, the dev crews get it from
// their Llm (pruned-llm.ts).
import type { ActRequest, DecisionModel, Logger } from "../ports.ts";
import type { ConfigStore } from "../config-store.ts";
import { PRUNE_CONFIG_KEY, pruneOn } from "../../domain/context-prune.ts";
import { PRUNE_WITHOUT_DECISION_MODEL, prunedLine } from "./messages.ts";

/** What the pruning adds to an act's request; nothing when it is off. */
export type ContextPruning = Pick<ActRequest, "prune" | "onPruned">;

export interface PruneDeps {
  config: Pick<ConfigStore, "readValue">;
  decision: Pick<DecisionModel, "available">;
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

/** What an act carries: the runtime's pruning and the line its tally makes, or nothing. */
export async function contextPruning(deps: PruneDeps): Promise<ContextPruning> {
  if (!await settingOn(deps.config)) return {};
  if (!deps.decision.available()) {
    deps.log.warn(PRUNE_WITHOUT_DECISION_MODEL);
    return {};
  }
  return {
    prune: true,
    onPruned: (tally) => {
      if (tally.judged > 0) deps.log.info(prunedLine(tally.judged, tally.dropped, tally.cut, tally.freedTokens));
    },
  };
}
