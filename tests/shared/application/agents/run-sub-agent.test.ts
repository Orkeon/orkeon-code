// runSubAgent over FakeLlm: act in the charter's mode, extract, check, one re-ask. Run:
//   node --test tests/shared/application/agents/run-sub-agent.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { runSubAgent } from "../../../../src/shared/application/agents/run-sub-agent.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { budgetExhaustedAnswer } from "../../../../src/shared/domain/llm-failure.ts";
import { CANCELLED_ACTS, CHARTER, FINAL_EXTRACTION_FAILURES, call } from "./run-sub-agent.fixtures.ts";

describe("runSubAgent", () => {
  it("acts with the system, the charter's mode and iterations, then extracts", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = ["the reply"];
    llm.extractions = [{ count: 3 }];

    // Act
    const outcome = await runSubAgent(llm, call());

    // Assert
    deepStrictEqual(outcome, { ok: true, value: 3, reply: "the reply", tries: 1 });
    deepStrictEqual(llm.acts, [{ prompt: "BRIEF TEXT", request: { system: "SYSTEM TEXT", permissionMode: "plan", maxIterations: 12 } }]);
    ok(!("model" in llm.acts[0].request));
    deepStrictEqual(llm.extracts, [{ prompt: "answer from: the reply", schema: { type: "object" } }]);
  });

  it("offers the call's tools when it names them", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.extractions = [{ count: 1 }];

    // Act
    await runSubAgent(llm, call({ tools: ["file_read", "node_read"] }));

    // Assert
    deepStrictEqual(llm.acts[0].request.tools, ["file_read", "node_read"]);
  });

  it("offers the agent's whole catalogue when the call names no tool", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.extractions = [{ count: 1 }];

    // Act
    await runSubAgent(llm, call());

    // Assert
    ok(!("tools" in llm.acts[0].request));
  });

  it("passes the charter's model only when it has one", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.extractions = [{ count: 1 }];

    // Act
    await runSubAgent(llm, call({ charter: { ...CHARTER, model: "small-model" } }));

    // Assert
    strictEqual(llm.acts[0].request.model, "small-model");
  });

  it("makes no call for an invalid charter", async () => {
    // Arrange
    const llm = new FakeLlm();

    // Act
    const outcome = await runSubAgent(llm, call({ charter: { ...CHARTER, mode: "default" } }));

    // Assert
    deepStrictEqual(outcome, {
      ok: false, reason: "invalid-charter", reply: "",
      problems: ["charter code-reader: mode default can write; a sub-agent runs read-only (plan or dontAsk) for now"],
    });
    strictEqual(llm.acts.length + llm.extracts.length, 0);
  });

  it("makes no call for a brief over 24 000 characters", async () => {
    // Arrange
    const llm = new FakeLlm();

    // Act
    const outcome = await runSubAgent(llm, call({ brief: "x".repeat(24_001) }));

    // Assert
    deepStrictEqual(outcome, {
      ok: false, reason: "brief-too-long", reply: "", problems: ["the brief is 24001 characters, over 24000"],
    });
    strictEqual(llm.acts.length + llm.extracts.length, 0);
  });

  it("reports a failing act as model-failed, with the first line of its message", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = [new Error("provider down\nstack detail")];

    // Act
    const outcome = await runSubAgent(llm, call());

    // Assert
    deepStrictEqual(outcome, { ok: false, reason: "model-failed", reply: "", problems: ["provider down"] });
    strictEqual(llm.extracts.length, 0);
  });

  it("reports the wrap-up of a spent token budget as model-failed, without extracting it (Orkeon #218)", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = [budgetExhaustedAnswer('{"count": 7}')];

    // Act
    const outcome = await runSubAgent(llm, call());

    // Assert
    deepStrictEqual([outcome.ok, (outcome as { reason: string }).reason, llm.extracts.length], [false, "model-failed", 0]);
  });

  for (const c of CANCELLED_ACTS) {
    it(`reports a cancelled act as cancelled: ${c.name}`, async () => {
      // Arrange
      const llm = new FakeLlm();
      llm.answers = [c.error];

      // Act
      const outcome = await runSubAgent(llm, call());

      // Assert
      deepStrictEqual(outcome, { ok: false, reason: c.reason, reply: "", problems: [c.error.message] });
    });
  }

  for (const c of FINAL_EXTRACTION_FAILURES) {
    it(`reports ${c.name} during the extraction as such, without a re-ask`, async () => {
      // Arrange
      const llm = new FakeLlm();
      llm.answers = ["the reply"];
      llm.extractions = [c.error, { count: 7 }];

      // Act
      const outcome = await runSubAgent(llm, call());

      // Assert
      deepStrictEqual(outcome, { ok: false, reason: c.reason, reply: "the reply", problems: [c.error.message] });
      strictEqual(llm.extracts.length, 1);
    });
  }

  it("re-asks once without a new act when the first extraction throws", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = ["the reply"];
    llm.extractions = [new Error("Unexpected token\nat 3"), { count: 7 }];

    // Act
    const outcome = await runSubAgent(llm, call());

    // Assert
    deepStrictEqual(outcome, { ok: true, value: 7, reply: "the reply", tries: 2 });
    strictEqual(llm.acts.length, 1);
    strictEqual(llm.extracts[1].prompt, "answer from: the reply | fix: the answer did not parse: Unexpected token");
  });

  it("gives unparsable with the problems of the second try when the check fails twice", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = ["the reply"];
    llm.extractions = [{ count: "three" }, { nothing: true }];

    // Act
    const outcome = await runSubAgent(llm, call());

    // Assert
    deepStrictEqual(outcome, { ok: false, reason: "unparsable", reply: "the reply", problems: ["count must be a number"] });
    strictEqual(llm.acts.length, 1);
    strictEqual(llm.extracts.length, 2);
    ok(llm.extracts[1].prompt.includes("count must be a number"));
    ok(!llm.extracts[0].prompt.includes("fix:"));
  });
});
