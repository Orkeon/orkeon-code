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

/** The warning without a decision model, written out: it names what to check, not a runtime line. */
export const NO_MODEL_WARNING =
  "warn: compaction.prune is on and the host has no decision model to ask: nothing is pruned " +
  "(no Orkeon:Decision:Provider nor Orkeon:TypeSafe is set, the provider lacks its key, or the host's decision circuit is " +
  "off by --no-decision or Orkeon:Decision:Enabled false: check Orkeon:Decision:Provider and Orkeon:Decision:Enabled, " +
  "then the key of the provider's section, read from the variable its ApiKeyEnvVar names (TYPESAFE_API_KEY or " +
  "LIQUID_API_KEY by default) or from its ApiKey)";
