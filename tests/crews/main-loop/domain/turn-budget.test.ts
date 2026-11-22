// The budget of one main-loop turn (crews/main-loop/domain/turn-budget.ts). Run:
//   node --test tests/crews/main-loop/domain/turn-budget.test.ts
import { describe, it } from "node:test";
import { strictEqual } from "node:assert";

import { MAIN_LOOP_BUDGET } from "../../../../src/crews/main-loop/domain/turn-budget.ts";
import { assertRuntimeBudget } from "../../../support/assertions/budget.ts";

describe("MAIN_LOOP_BUDGET", () => {
  it("lets a turn spawn eight agents, past the runtime's default of three", () => {
    // Arrange
    const budget = MAIN_LOOP_BUDGET;

    // Act
    const spawned = budget.spawnedAgents;

    // Assert
    strictEqual(spawned, 8);
  });

  it("holds only limits of 1 or more, which the runtime accepts (Orkeon #436)", () => {
    // Arrange
    const label = "main loop";

    // Act
    const budget = MAIN_LOOP_BUDGET;

    // Assert
    assertRuntimeBudget(budget, label);
  });
});
