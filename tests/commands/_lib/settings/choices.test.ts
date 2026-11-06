// The options of a panel from plain values (commands/_lib/settings/choices.ts). Run:
//   node --test tests/commands/_lib/settings/choices.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { optionsOf } from "../../../../src/commands/_lib/settings/choices.ts";

describe("optionsOf", () => {
  it("marks the value in force, whatever its case", () => {
    // Arrange
    const values = ["kimi-k3", "deepseek-chat"];

    // Act
    const options = optionsOf(values, "KIMI-K3");

    // Assert
    deepStrictEqual(options, [{ value: "kimi-k3", current: true }, { value: "deepseek-chat" }]);
  });

  it("marks nothing when no value is in force", () => {
    // Arrange
    const values = ["low", "high"];

    // Act
    const options = optionsOf(values, "");

    // Assert
    deepStrictEqual(options, [{ value: "low" }, { value: "high" }]);
  });
});
