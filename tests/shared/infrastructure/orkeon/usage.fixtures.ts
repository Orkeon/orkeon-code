// A FakeUsageService served under "usage" by a FakeServiceLocator, the adapter over it, and a host report with
// one model and one command.
import type { SessionUsageReport } from "../../../../src/commands/.orkeon/orkeon-cli.d.ts";
import type { UsageReport } from "../../../../src/shared/application/ports.ts";
import { createUsageReader } from "../../../../src/shared/infrastructure/orkeon/usage.ts";
import { FakeServiceLocator } from "../../../support/doubles/fake-script-host.ts";
import { FakeUsageService } from "../../../support/doubles/fake-usage-service.ts";

export function usageOverFake() {
  const service = new FakeUsageService();
  const services = new FakeServiceLocator();
  services.services.set("usage", service);
  return { service, reader: createUsageReader(services) };
}

const TOKENS = { promptTokens: 1000, completionTokens: 200, cacheHitTokens: 800, cacheWriteTokens: 50, reasoningTokens: 20 };

/** What the host reports after one priced call of one command. */
export const HOST_REPORT: SessionUsageReport = {
  ...TOKENS,
  totalTokens: 1200,
  calls: 1,
  unpricedCalls: 0,
  cost: 0.0042,
  byModel: [{ ...TOKENS, model: "deepseek-chat", calls: 1, unpricedCalls: 0, cost: 0.0042 }],
  byCommand: [{ ...TOKENS, ticket: "t1", name: "assistant", state: "done", calls: 1, unpricedCalls: 0, cost: 0.0042 }],
};

/** The same report, as the port carries it. */
export const PORT_REPORT: UsageReport = {
  ...TOKENS,
  totalTokens: 1200,
  calls: 1,
  unpricedCalls: 0,
  cost: 0.0042,
  byModel: [{ ...TOKENS, model: "deepseek-chat", calls: 1, unpricedCalls: 0, cost: 0.0042 }],
  byCommand: [{ ...TOKENS, ticket: "t1", name: "assistant", state: "done", calls: 1, unpricedCalls: 0, cost: 0.0042 }],
};

/** A PascalCase report, as Jint shows a CLR object, with its counts as strings. */
export const PASCAL_REPORT = {
  PromptTokens: "10", CompletionTokens: "2", CacheHitTokens: "0", CacheWriteTokens: "0", ReasoningTokens: "0",
  TotalTokens: "12", Calls: "1", UnpricedCalls: "1", Cost: null,
  ByModel: [{ Model: "kimi", Calls: "1", UnpricedCalls: "1", Cost: null, PromptTokens: "10", CompletionTokens: "2" }],
  ByCommand: [],
};

/** The cache and reasoning counts of a report, its first model and its first command, in that order. */
export type CountTriple = [number | null, number | null, number | null];

export interface CountCase {
  name: string;
  /** The host's answer, as the service gives it. */
  answer: unknown;
  /** `[cacheHitTokens, cacheWriteTokens, reasoningTokens]` of the totals, the first model and the first command. */
  expected: [CountTriple, CountTriple, CountTriple];
}

const row = (counts: object) => ({ promptTokens: 10, completionTokens: 2, calls: 1, unpricedCalls: 0, cost: null, ...counts });

/** A report whose rows all carry `counts`, as the host's service gives it. */
function reportWith(counts: object) {
  return {
    ...row(counts), totalTokens: 12,
    byModel: [{ ...row(counts), model: "m" }],
    byCommand: [{ ...row(counts), ticket: "t1", name: "assistant", state: "done" }],
  };
}

const UNREPORTED: CountTriple = [null, null, null];
const ZERO: CountTriple = [0, 0, 0];

/** The cache and reasoning counts: null when the host reported none (Orkeon #254), a measured 0 kept as 0. */
export const COUNT_CASES: readonly CountCase[] = [
  {
    name: "reads null cache and reasoning counts as unreported, never as 0",
    answer: reportWith({ cacheHitTokens: null, cacheWriteTokens: null, reasoningTokens: null }),
    expected: [UNREPORTED, UNREPORTED, UNREPORTED],
  },
  {
    name: "reads absent cache and reasoning counts as unreported, never as 0",
    answer: reportWith({}),
    expected: [UNREPORTED, UNREPORTED, UNREPORTED],
  },
  {
    name: "keeps cache and reasoning counts measured at 0 as 0",
    answer: reportWith({ CacheHitTokens: "0", CacheWriteTokens: 0, ReasoningTokens: 0 }),
    expected: [ZERO, ZERO, ZERO],
  },
  {
    name: "keeps the cache count a model reported beside the reasoning it did not",
    answer: reportWith({ cacheHitTokens: 700, cacheWriteTokens: 0, reasoningTokens: null }),
    expected: [[700, 0, null], [700, 0, null], [700, 0, null]],
  },
];
