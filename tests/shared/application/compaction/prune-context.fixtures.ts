// The ports of shared/application/compaction/prune-context.ts over fakes, and the pressures a runtime hands.
import type { ContextPressure, PressureCall } from "../../../../src/shared/domain/context-prune.ts";
import type { DecisionAnswers } from "../../../../src/shared/domain/decision/questions.ts";
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";
import { FakeDecisionModel } from "../../../support/doubles/fake-decision-model.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { FakeSessionStore } from "../../../support/doubles/fake-session-store.ts";

export const REQUEST = "Rename the port";

/** The ports with the pruning on, a decision model present and a window of 200 000 tokens. */
export function pruneSetup(setting: string | null = "on") {
  const config = new FakeConfigStore();
  if (setting !== null) config.values["compact.prune"] = setting;
  const decision = new FakeDecisionModel();
  const session = new FakeSessionStore();
  session.budget = { used: 90_000, window: 200_000 };
  const log = new FakeLogger();
  return { config, decision, session, log, deps: { config, decision, session, log } };
}

function calls(count: number, resultChars: number, from = 1): PressureCall[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `call-${from + i}`, name: "file_read", input: { path: `/workspace/f${from + i}.ts` }, resultChars, age: count - i,
  }));
}

export function pressure(offered: readonly PressureCall[]): ContextPressure {
  return { usedTokens: 90_000, thresholdTokens: 80_000, calls: offered };
}

/** Two large results and a small one. */
export const TWO_LARGE_ONE_SMALL = pressure([...calls(2, 12_000), ...calls(1, 400, 3)]);

/** Thirty large results: more than one pressure judges. */
export const THIRTY_LARGE = pressure(calls(30, 12_000));

const noul = (probability: number) => ({ type: "noul" as const, probability });

/** Every call of a batch of `count` is no longer needed. */
export function noneNeeded(count: number): DecisionAnswers {
  const answers: DecisionAnswers = {};
  for (let n = 1; n <= count; n += 1) {
    answers[`needed_${n}`] = noul(0.1);
    answers[`whole_${n}`] = noul(0.1);
  }
  return answers;
}

export const PRUNED_TWO = "context pruning: 2 tool result(s) judged, 2 removed, 0 cut, about 5850 tokens freed";
