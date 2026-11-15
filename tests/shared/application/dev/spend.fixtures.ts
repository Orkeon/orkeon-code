// The guarded act and the call the spend tests run on.
import { createSpend, reviewerCallbacks, spendGuard } from "../../../../src/shared/application/dev/spend.ts";

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

/** One act of the reviewer's callbacks over callbacks that allow every call, `made` look-ups already made. */
export async function reviewerActAfter(made: number) {
  const act = reviewerCallbacks({
    forAct: (_mode: string, _gate: boolean | undefined) => ({
      onToolCall: async (_call: { name: string; input: unknown }) => "allow" as const,
      onToolResult: async () => undefined,
    }),
  }).forAct("plan", undefined);
  for (let i = 0; i < made; i++) await act.onToolCall(FILE_READ_CALL);
  return act;
}

/** What the reviewer reads when a look-up is refused. */
export const LOOKUPS_SPENT = "review: your 16 look-ups are spent; open nothing more and write your findings now, from what you read: " +
  "CLEAR, or each question with its severity, evidence and target";
