// The check every crew budget passes before the runtime reads it: since Orkeon #436 a crew's `budget({...})` and the
// `budget` option of a delegated run refuse, before the first agent, a limit that is not 1 or more (zero, a negative
// or fractional count, an unreadable wall time). Shared by the budget tests of the crews.
import { ok } from "node:assert";

const RUNTIME_KEYS: readonly string[] = ["toolCalls", "tokens", "contextTokens", "wallTime", "delegationDepth", "spawnedAgents"];

/** Every key of `budget` is a runtime budget dimension, and every limit a whole number of 1 or more. */
export function assertRuntimeBudget(budget: object, label: string): void {
  for (const [key, value] of Object.entries(budget)) {
    ok(RUNTIME_KEYS.includes(key), `${label}: ${key} is no runtime budget dimension`);
    ok(Number.isSafeInteger(value) && (value as number) >= 1, `${label}: ${key} ${String(value)} is no whole number of 1 or more`);
  }
}
