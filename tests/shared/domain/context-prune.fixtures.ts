// The cases of shared/domain/context-prune.ts: the setting's values, and the tallies an act's result may carry.
import type { PruneTally } from "../../../src/shared/domain/context-prune.ts";

export const ON_CASES: readonly { readonly value: string | null | undefined; readonly on: boolean }[] = [
  { value: "on", on: true },
  { value: " ON ", on: true },
  { value: "off", on: false },
  { value: "true", on: false },
  { value: "", on: false },
  { value: null, on: false },
  { value: undefined, on: false },
];

/** The runtime's `result.pruned` of an act that judged five results. */
export const RUNTIME_PRUNED = { offered: 6, judged: 5, kept: 2, cut: 1, dropped: 2, freedTokens: 4_100 };

export const RUNTIME_TALLY: PruneTally = { judged: 5, dropped: 2, cut: 1, freedTokens: 4_100 };

export const NO_TALLY_CASES: readonly { readonly name: string; readonly pruned: unknown }[] = [
  { name: "nothing", pruned: undefined },
  { name: "null", pruned: null },
  { name: "a number", pruned: 3 },
  { name: "a count that is no number", pruned: { ...RUNTIME_PRUNED, cut: "1" } },
  { name: "a negative count", pruned: { ...RUNTIME_PRUNED, dropped: -1 } },
  { name: "a count left out", pruned: { judged: 5, dropped: 2, cut: 1 } },
];
