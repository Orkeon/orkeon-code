// The step budgets and the reader of a spent one, from the error or its message. Run:
//   node --test src/shared/domain/dev/step-budget.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { readBudgetExhausted, STEP_BUDGETS } from "./step-budget.ts";

describe("STEP_BUDGETS", () => {
  it("keeps the figures of each dev step crew, one level of children for verify and plan", () => {
    deepStrictEqual(STEP_BUDGETS["dev-verify"], { toolCalls: 200, wallTime: 3600, tokens: 700_000, delegationDepth: 1 });
    deepStrictEqual(STEP_BUDGETS["dev-plan"], { toolCalls: 240, wallTime: 1800, tokens: 400_000, delegationDepth: 1 });
    // The wall time of a spec or a brief counts the person's answers to its questions.
    deepStrictEqual(STEP_BUDGETS["dev-spec"], { toolCalls: 200, wallTime: 3600, tokens: 400_000, delegationDepth: 0 });
    deepStrictEqual(STEP_BUDGETS["dev-change"], { toolCalls: 200, wallTime: 3600, tokens: 400_000, delegationDepth: 0 });
  });
});

describe("readBudgetExhausted", () => {
  it("reads the error's own dimension", () => {
    const error = Object.assign(new Error("spent"), { name: "BudgetExhaustedError", dimension: "wallTime" });
    strictEqual(readBudgetExhausted(error), "wallTime");
  });

  it("reads each of the runtime's messages", () => {
    strictEqual(readBudgetExhausted("Agent exceeded 200 tool calls."), "toolCalls");
    strictEqual(readBudgetExhausted("Tool-call budget exhausted (200/200)."), "toolCalls");
    strictEqual(readBudgetExhausted(new Error("Token budget exhausted (400100/400000).")), "tokens");
    strictEqual(readBudgetExhausted("Wall time exceeded (0:30:00 >= 0:30:00)."), "wallTime");
    strictEqual(readBudgetExhausted("Delegation depth 3 exceeds max 2."), "delegationDepth");
    strictEqual(readBudgetExhausted("Agent exceeded 4 spawned sub-agents."), "spawnedAgents");
  });

  it("is null for any other failure", () => {
    strictEqual(readBudgetExhausted(new Error("provider down")), null);
    strictEqual(readBudgetExhausted({ dimension: "patience" }), null);
    strictEqual(readBudgetExhausted(undefined), null);
  });
});
