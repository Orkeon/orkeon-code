// The explorer's one act on the brief a spawn_agent call hands it, over a FakeLlm. Run:
//   node --test tests/crews/main-loop/application/run-explorer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";

import { runExplorer } from "../../../../src/crews/main-loop/application/run-explorer.ts";
import { EXPLORER_SYSTEM } from "../../../../src/crews/main-loop/application/prompts.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { FakeLogger } from "../../../support/doubles/fake-logger.ts";
import { EXPLORER_RULE_MARKERS, REFUSED_BRIEFS } from "./run-explorer.fixtures.ts";

describe("runExplorer", () => {
  it("acts once on the trimmed brief in plan mode, with its system message and its cap", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = ["the report"];

    // Act
    const report = await runExplorer("  where is the shell built?  ", { llm, log: new FakeLogger() });

    // Assert
    strictEqual(report, "the report");
    deepStrictEqual(llm.acts, [{
      prompt: "where is the shell built?",
      request: { system: EXPLORER_SYSTEM, permissionMode: "plan", maxIterations: 30 },
    }]);
  });

  for (const c of REFUSED_BRIEFS) {
    it(`refuses ${c.name} before any model call`, async () => {
      // Arrange
      const llm = new FakeLlm();

      // Act
      const run = runExplorer(c.input, { llm, log: new FakeLogger() });

      // Assert
      await rejects(run, c.error);
      strictEqual(llm.acts.length, 0);
    });
  }
});

describe("EXPLORER_SYSTEM", () => {
  for (const [rule, marker] of Object.entries(EXPLORER_RULE_MARKERS)) {
    it(`states the rule: ${rule}`, () => {
      // Arrange
      const expected = marker;

      // Act
      const found = EXPLORER_SYSTEM.includes(expected);

      // Assert
      ok(found, `the explorer's system message is missing ${JSON.stringify(expected)}: ${EXPLORER_SYSTEM}`);
    });
  }
});
