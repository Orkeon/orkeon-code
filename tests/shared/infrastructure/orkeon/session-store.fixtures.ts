// The session_store, session_snip and token_budget replies the createSessionStore tests read, and the ports a
// compaction runs on over the adapter.
import type { createSessionStore } from "../../../../src/shared/infrastructure/orkeon/session-store.ts";
import { FakeFiles } from "../../../support/doubles/fake-files.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeMemoryStore } from "../../../support/doubles/fake-memory-store.ts";
import { FakeProgress } from "../../../support/doubles/fake-progress.ts";
import type { TokenBudget } from "../../../../src/shared/application/ports.ts";

/** Buffers that are not a list: a compaction skips them rather than failing. */
export const NOT_A_LIST: readonly unknown[] = [{ role: "user" }, "hi", 3, null];

/** The compaction's two runs: on its threshold, and forced. */
export const FORCES: readonly boolean[] = [false, true];

/** The ports of compactSession over `session`, every other one a fake. */
export function compactionDeps(session: ReturnType<typeof createSessionStore>) {
  return {
    session, progress: new FakeProgress(), files: new FakeFiles(), memory: new FakeMemoryStore(),
    llm: new FakeLlm(), log: new FakeLogger(),
  };
}

export interface CountCase<T> {
  name: string;
  reply: unknown;
  expected: T;
}

/** The removed count of a reset, in the other casing and unreported. */
export const RESET_COUNTS: readonly CountCase<number>[] = [
  { name: "reads the PascalCase removed count of a reset", reply: { RemovedCount: 2 }, expected: 2 },
  { name: "reads an unreported removed count of a reset as 0", reply: {}, expected: 0 },
];

/** Budgets in each shape token_budget hands back. */
export const BUDGETS: readonly CountCase<TokenBudget>[] = [
  { name: "reads the snake_case budget", reply: { used_tokens: 1200, context_window_tokens: 8000 }, expected: { used: 1200, window: 8000 } },
  { name: "reads the camelCase budget", reply: { usedTokens: 5, contextWindowTokens: 10 }, expected: { used: 5, window: 10 } },
  {
    name: "reads the counts as numbers, as /context shows them",
    reply: { used_tokens: "500", context_window_tokens: "2000" },
    expected: { used: 500, window: 2000 },
  },
  { name: "reads zeros from an empty budget", reply: undefined, expected: { used: 0, window: 0 } },
  {
    name: "reads the tokens by kind when the host reports them (Orkeon #226)",
    reply: { used_tokens: 90, context_window_tokens: 100, used_tokens_by_kind: { system: 40, user: 10, assistant: 20, tool: 15, other: 5 } },
    expected: { used: 90, window: 100, byKind: { system: 40, user: 10, assistant: 20, tool: 15, other: 5 } },
  },
  {
    name: "reads PascalCase kinds, a missing kind as 0",
    reply: { usedTokens: 9, contextWindowTokens: 10, usedTokensByKind: { System: "4", User: 5 } },
    expected: { used: 9, window: 10, byKind: { system: 4, user: 5, assistant: 0, tool: 0, other: 0 } },
  },
];

/** The answers of a get_state over keys `a` and `missing`: every key read back, a key absent as null. */
export const STATE_VALUES = [
  { name: "reads `values`, a key never set as null", reply: { success: true, values: { a: "1" } }, expected: { a: "1", missing: null } },
  { name: "reads `Values`, a value as a string", reply: { Success: true, Values: { a: 2 } }, expected: { a: "2", missing: null } },
  { name: "reads every key as null when the answer has no values", reply: { success: true }, expected: { a: null, missing: null } },
];
