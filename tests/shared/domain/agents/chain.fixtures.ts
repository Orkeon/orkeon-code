// The failures chainDepthRefusal reads.

export interface RefusalCase {
  name: string;
  failure: unknown;
  refusal: { depth: number; limit: number } | null;
}

/** The runtime's refusal as an error or a string. */
export const CHAIN_REFUSALS: readonly RefusalCase[] = [
  { name: "an error", failure: new Error("Async command chain refused at depth 9, limit 8."), refusal: { depth: 9, limit: 8 } },
  { name: "a string", failure: "Async command chain refused at depth 3, limit 2.", refusal: { depth: 3, limit: 2 } },
];

/** Other failures. */
export const OTHER_FAILURES: readonly RefusalCase[] = [
  { name: "another error", failure: new Error("crew not found"), refusal: null },
  { name: "no failure", failure: undefined, refusal: null },
];
