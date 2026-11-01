// /analyze (commands/_lib/project/analyze.ts): the crew's input, over FakeConfigStore. Run:
//   node --test tests/commands/_lib/project/analyze.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { analyzeInput } from "../../../../src/commands/_lib/project/analyze.ts";
import { ANSWER_LANGUAGE_CONFIG_KEY } from "../../../../src/shared/domain/agent-policy/output-styles.ts";
import { FakeConfigStore } from "../../../support/doubles/fake-config-store.ts";

describe("analyzeInput", () => {
  it("hands the crew the session's answer.language beside the flags", async () => {
    // Arrange
    const config = new FakeConfigStore();
    config.values[ANSWER_LANGUAGE_CONFIG_KEY] = "French";

    // Act
    const input = await analyzeInput({ raw: false, parallel: 4, rebuild: true }, config);

    // Assert
    deepStrictEqual(input, { raw: false, parallel: 4, rebuild: true, language: "French" });
  });

  it("leaves the language out when the session sets none", async () => {
    // Arrange
    const config = new FakeConfigStore();

    // Act
    const input = await analyzeInput({ raw: true }, config);

    // Assert
    deepStrictEqual(input, { raw: true, parallel: undefined, rebuild: false });
  });
});
