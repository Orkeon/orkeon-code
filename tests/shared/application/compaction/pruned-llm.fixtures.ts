// The Llm the pruning dresses, a binding as contextPruning hands one, and what binds it for the tests of
// shared/application/compaction/pruned-llm.ts.
import type { ContextPruning } from "../../../../src/shared/application/compaction/prune-context.ts";
import type { PruningFor } from "../../../../src/shared/application/compaction/pruned-llm.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";

export const BRIEF = "Review the plan of the batch";

/** A request as a sub-agent's act sends one. */
export const REQUEST = { system: "You review.", maxIterations: 20 };

/** The binding of an act with the pruning on: the settings and the callback. */
export const BINDING: ContextPruning = {
  contextPressure: { thresholdTokens: 80_000, keepRecent: 6, headChars: 300 },
  onContextPressure: async () => ({}),
};

/** A request that already carries a callback of its own. */
export const BOUND_REQUEST = { ...REQUEST, onContextPressure: async () => undefined };

/** An Llm that answers "done" and keeps what it was asked. */
export function inlineLlm(): FakeLlm {
  const llm = new FakeLlm();
  llm.answers = ["done"];
  llm.completions = ["completed"];
  llm.extractions = [{ verdict: "CLEAR" }];
  return llm;
}

/** What binds `binding` to each act, the requests it was asked on kept in `asked`. */
export function bindingOf(binding: ContextPruning): { prune: PruningFor; asked: string[] } {
  const asked: string[] = [];
  return { asked, prune: async (request) => { asked.push(request); return binding; } };
}

/** A binding that cannot be made: the settings or the session failed. */
export const failingPrune: PruningFor = async () => { throw new Error("the session cannot be read"); };
