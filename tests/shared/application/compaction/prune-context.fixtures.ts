// The ports of shared/application/compaction/prune-context.ts over fakes.
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";

/** The ports with the pruning set to `setting` (null: unset) and a decision model present. */
export function pruneSetup(setting: string | null = "on") {
  const config = new FakeConfigStore();
  if (setting !== null) config.values["compaction.prune"] = setting;
  const decision = new FakeDecisionModel();
  const log = new FakeLogger();
  return { config, decision, log, deps: { config, decision, log } };
}

/** What an act that judged five results hands back. */
export const FIVE_JUDGED = { judged: 5, dropped: 2, cut: 1, freedTokens: 4_100 };

/** What an act that judged nothing hands back. */
export const NONE_JUDGED = { judged: 0, dropped: 0, cut: 0, freedTokens: 0 };
