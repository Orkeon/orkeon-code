// One act of a built-in charter on a repair brief (A-3), over a FakeLlm. Run:
//   node --test tests/crews/agent-run/application/run-agent-run.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, rejects, strictEqual } from "node:assert";

import { runAgentRun } from "../../../../src/crews/agent-run/application/run-agent-run.ts";
import { CHARTER, REFUSED_RUNS, agentRunSetup } from "./run-agent-run.fixtures.ts";

describe("runAgentRun", () => {
  it("acts once on the brief in the charter's mode, with its system and its cap", async () => {
    // Arrange
    const { asked, deps } = agentRunSetup();

    // Act
    const answer = await runAgentRun({ charter: "dev-reviewer", system: "S", brief: " fix it " }, deps);

    // Assert
    strictEqual(answer, "the answer");
    deepStrictEqual(asked, [["fix it", { system: "S", permissionMode: "plan", maxIterations: 12 }]]);
  });

  it("passes the charter's model, and no system when there is none", async () => {
    // Arrange
    const { asked, deps } = agentRunSetup();
    deps.charters = { "dev-reviewer": { ...CHARTER, model: "m" } };

    // Act
    await runAgentRun({ charter: "dev-reviewer", brief: "b" }, deps);

    // Assert
    deepStrictEqual(asked[0][1], { permissionMode: "plan", maxIterations: 12, model: "m" });
  });

  for (const c of REFUSED_RUNS) {
    it(`refuses ${c.name}`, async () => {
      // Arrange
      const { deps } = agentRunSetup();

      // Act
      const act = runAgentRun(c.input, deps);

      // Assert
      await rejects(act, c.error);
    });
  }
});
