// The session's usage as the UsageReader port carries it, shared by the tests of /usage and /cost: one model, two
// commands (the second's call priced by nobody), and a report before any call.
import type { UsageReport } from "../../../src/shared/application/ports.ts";

const TOKENS = { promptTokens: 3000, completionTokens: 400, cacheHitTokens: 2000, cacheWriteTokens: 0, reasoningTokens: 0 };

/** Two commands over one model; the second command's call was priced by nobody. */
export const USAGE_REPORT: UsageReport = {
  ...TOKENS,
  totalTokens: 3400,
  calls: 2,
  unpricedCalls: 1,
  cost: 0.01,
  byModel: [{ ...TOKENS, model: "deepseek-chat", calls: 2, unpricedCalls: 1, cost: 0.01 }],
  byCommand: [
    { ...TOKENS, promptTokens: 1000, completionTokens: 100, cacheHitTokens: 0, ticket: "t2", name: "commit", state: "running", calls: 1, unpricedCalls: 1, cost: null },
    { ...TOKENS, promptTokens: 2000, completionTokens: 300, ticket: "t1", name: "assistant", state: "done", calls: 1, unpricedCalls: 0, cost: 0.01 },
  ],
};

/** A report before any call. */
export const EMPTY_USAGE_REPORT: UsageReport = {
  promptTokens: 0, completionTokens: 0, cacheHitTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0,
  totalTokens: 0, calls: 0, unpricedCalls: 0, cost: null, byModel: [], byCommand: [],
};
