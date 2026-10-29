// The failures exclusiveRefusal reads: the runtime's wording since Orkeon #239.
import type { ExclusiveRefusal } from "../../../../src/shared/domain/agents/exclusive.ts";

export interface ExclusiveCase {
  name: string;
  failure: unknown;
  refusal: ExclusiveRefusal | null;
}

/** The runtime's refusal as an error or a string. */
export const EXCLUSIVE_REFUSALS: readonly ExclusiveCase[] = [
  { name: "an error", failure: new Error("crew 'code-review' already running (ticket t2)"), refusal: { crew: "code-review", ticket: "t2" } },
  { name: "a string", failure: "crew 'shared-memory-admit' already running (ticket t17)", refusal: { crew: "shared-memory-admit", ticket: "t17" } },
];

/** Other failures, the chain refusal among them: none is an exclusive refusal. */
export const OTHER_FAILURES: readonly ExclusiveCase[] = [
  { name: "another error", failure: new Error("crew not found"), refusal: null },
  { name: "a chain refusal", failure: new Error("chain depth 8 reached (MaxChainDepth 8, /dev-batches)"), refusal: null },
  { name: "no failure", failure: undefined, refusal: null },
];

export const LINE = "code-review not launched: it is already running (ticket t2); wait for its result, then type the line again.";
