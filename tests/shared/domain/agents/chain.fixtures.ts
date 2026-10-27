// The failures chainDepthRefusal reads: the runtime's wording since Orkeon #221.
import type { ChainDepthRefusal } from "../../../../src/shared/domain/agents/chain.ts";

export interface RefusalCase {
  name: string;
  failure: unknown;
  refusal: ChainDepthRefusal | null;
}

/** The runtime's refusal as an error or a string, with the command it names, or without one. */
export const CHAIN_REFUSALS: readonly RefusalCase[] = [
  {
    name: "an error naming the command",
    failure: new Error("chain depth 8 reached (MaxChainDepth 8, /dev-batches)"),
    refusal: { depth: 8, limit: 8, command: "dev-batches" },
  },
  { name: "a string", failure: "chain depth 3 reached (MaxChainDepth 2, /dev-implement)", refusal: { depth: 3, limit: 2, command: "dev-implement" } },
  { name: "a message without the command", failure: new Error("chain depth 9 reached (MaxChainDepth 8)"), refusal: { depth: 9, limit: 8 } },
];

/** Other failures, the runtime's wording before Orkeon #221 among them: nothing shipped with it. */
export const OTHER_FAILURES: readonly RefusalCase[] = [
  { name: "another error", failure: new Error("crew not found"), refusal: null },
  { name: "the wording before Orkeon #221", failure: new Error("Async command chain refused at depth 9, limit 8."), refusal: null },
  { name: "no failure", failure: undefined, refusal: null },
];
