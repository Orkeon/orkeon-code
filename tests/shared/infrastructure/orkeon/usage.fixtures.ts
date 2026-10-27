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
