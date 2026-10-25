// The advisor use case over the session, config and model fakes. Run:
//   node --test src/crews/advisor/application/run-advisor.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runAdvisor } from "./run-advisor.ts";
import { buildAdvicePrompt, describeAdvisor } from "../domain/advice.ts";
import { CONFIG_MAP_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { EXCHANGE, NOTHING, advisorSetup } from "./run-advisor.fixtures.ts";

describe("runAdvisor", () => {
  it("asks advisor.model for a second opinion on the last exchange", async () => {
    // Arrange
    const { session, llm, log, deps } = advisorSetup();
    session.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ "advisor.model": " gpt-big " }));
    const header = describeAdvisor("gpt-big");
    const prompt = buildAdvicePrompt(EXCHANGE);

    // Act
    const advice = await runAdvisor(deps);

    // Assert
    strictEqual(advice, `── ${header}\n\nlooks right`);
    deepStrictEqual(llm.completes, [{ prompt: prompt.user, override: { system: prompt.system, model: "gpt-big" } }]);
    deepStrictEqual(log.lines, [`info: ${header}`]);
  });

  it("asks the session's own model without advisor.model, and warns it is a self-review", async () => {
    // Arrange
    const { llm, log, deps } = advisorSetup();
    llm.completions = [""];
    const header = describeAdvisor("");

    // Act
    const advice = await runAdvisor(deps);

    // Assert
    strictEqual(advice, `── ${header}\n\n`);
    deepStrictEqual(llm.completes[0].override, { system: buildAdvicePrompt(EXCHANGE).system }, "no model override");
    deepStrictEqual(log.lines, [`warn: ${header}`]);
  });

  it("has nothing to review before an assistant answer", async () => {
    // Arrange
    const { session, llm, deps } = advisorSetup();
    session.messages = [{ role: "user", content: "hi" }];

    // Act
    const advice = await runAdvisor(deps);

    // Assert
    strictEqual(advice, NOTHING);
    deepStrictEqual(llm.completes, []);
  });

  it("has nothing to review without a session", async () => {
    // Arrange
    const { session, llm, deps } = advisorSetup();
    session.messages = [{ role: "user", content: "hi" }];
    session.failure = new Error("no session tools");

    // Act
    const advice = await runAdvisor(deps);

    // Assert
    strictEqual(advice, NOTHING);
    deepStrictEqual(llm.completes, []);
  });
});
