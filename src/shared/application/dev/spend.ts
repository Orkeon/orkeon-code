// A batch's budget of tool calls: the runtime gives a delegated agent no budget (L8P-D12), so a parallel
// /dev-batches' batch agent counts its own calls and its callbacks refuse every call past the bound.
import type { ToolCallbacks } from "./tool-callbacks.ts";
import { REVIEWER_LOOKUPS } from "../../domain/dev/reviewer-charter.ts";
import { budgetSpent, lookupsSpent } from "./prompts.ts";

/** A batch's tool calls: counted, and refused once `limit` is reached. A call to a tool the act does not offer is
 *  refused by the runtime before `onToolCall` (Orkeon #193): it costs nothing here, the act's `maxIterations` bounds it.
 *  A call the host's gate refuses is counted: the gate judges after `onToolCall` (Orkeon #303). */
export interface Spend {
  readonly limit: number;
  calls(): number;
  /** True once a call was refused: a batch that used exactly its `limit`, none refused, is not stopped. */
  exhausted(): boolean;
  /** Counts one call; false, and nothing counted, once the limit is reached. */
  take(): boolean;
}

export function createSpend(limit: number): Spend {
  let calls = 0;
  let denied = 0;
  return {
    limit,
    calls: () => calls,
    exhausted: () => denied > 0,
    take: () => (calls >= limit ? (denied++, false) : (calls++, true)),
  };
}

/** `callbacks` denying every call past the spend's limit with what `spent` says of it (a batch's budget when not
 *  given); `callbacks` themselves without a spend. */
export function spendGuard<C extends Pick<ToolCallbacks, "forAct">>(
  callbacks: C, spend: Spend | undefined, spent: (limit: number) => string = budgetSpent,
): C {
  if (spend === undefined) return callbacks;
  return {
    ...callbacks,
    forAct(mode: string, gateEnabled: boolean | undefined) {
      const inner = callbacks.forAct(mode, gateEnabled);
      return {
        ...inner,
        onToolCall: async (call) => (spend.take()
          ? inner.onToolCall(call)
          : { deny: spent(spend.limit) }),
      };
    },
  };
}

/** The callbacks of one act of the reviewer of a plan, a spec or a brief: `callbacks` under a fresh spend of
 *  REVIEWER_LOOKUPS calls, a call past it refused with the order to write the findings. One spend per act: call it
 *  once for each. */
export function reviewerCallbacks<C extends Pick<ToolCallbacks, "forAct">>(callbacks: C): C {
  return spendGuard(callbacks, createSpend(REVIEWER_LOOKUPS), lookupsSpent);
}
