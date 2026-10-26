// The guarded act and the call the spend tests run on.
import { createSpend, spendGuard } from "../../../../src/shared/application/dev/spend.ts";

/** The act of a spend guard of `bound` calls over callbacks that allow every call, counting the calls they reached. */
export function guardedAct(bound: number) {
  const spend = createSpend(bound);
  const counter = { reached: 0 };
  const act = spendGuard({
    forAct: (_mode: string, _gate: boolean | undefined) => ({
      onToolCall: async (_call: { name: string; input: unknown }) => { counter.reached++; return "allow" as const; },
      onToolResult: async () => undefined,
    }),
  }, spend).forAct("bypassPermissions", undefined);
  return { spend, act, counter };
}

export const FILE_READ_CALL = { name: "file_read", input: {} };
