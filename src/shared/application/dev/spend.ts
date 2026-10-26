// A batch's budget of tool calls: the runtime gives a delegated agent no budget (L8P-D12), so a parallel
// /dev-batches' batch agent counts its own calls and its callbacks refuse every call past the bound.
import type { ToolCallbacks } from "./tool-callbacks.ts";

/** A batch's tool calls: counted, and refused once `limit` is reached. A call to a tool the act does not offer is
 *  refused by the runtime before `onToolCall` (Orkeon #193): it costs nothing here, the act's `maxIterations` bounds it. */
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

/** `callbacks` denying every call past the spend's limit; `callbacks` themselves without a spend. */
export function spendGuard<C extends Pick<ToolCallbacks, "forAct">>(callbacks: C, spend: Spend | undefined): C {
  if (spend === undefined) return callbacks;
  return {
    ...callbacks,
    forAct(mode: string, gateEnabled: boolean | undefined) {
      const inner = callbacks.forAct(mode, gateEnabled);
      return {
        ...inner,
        onToolCall: async (call) => (spend.take()
          ? inner.onToolCall(call)
          : { deny: `budget: this batch has spent its ${spend.limit} tool calls; end the act and say what is left` }),
      };
    },
  };
}
