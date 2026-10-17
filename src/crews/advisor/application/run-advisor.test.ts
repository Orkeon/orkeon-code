// The advisor use case over the session, config and model fakes. Run:
//   node --test src/crews/advisor/application/run-advisor.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { runAdvisor } from "./run-advisor.ts";
import { buildAdvicePrompt, describeAdvisor } from "../domain/advice.ts";
import { createConfigStore } from "../../../shared/application/config-store.ts";
import { CONFIG_MAP_STATE_KEY } from "../../../shared/domain/session-keys.ts";
import { FakeFiles } from "../../../../tests/support/fake-files.ts";
import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { FakeLogger } from "../../../../tests/support/fake-logger.ts";
import { FakeSessionStore } from "../../../../tests/support/fake-session-store.ts";

const NOTHING = "Nothing to review: the session buffer holds no assistant answer yet.";
const EXCHANGE = { request: "fix the parser", answer: "fixed it" };

function setup() {
  const session = new FakeSessionStore();
  session.messages = [{ role: "user", content: EXCHANGE.request }, { role: "assistant", content: EXCHANGE.answer }];
  const llm = new FakeLlm();
  llm.completions = ["  looks right  \n"];
  const log = new FakeLogger();
  const deps = { session, config: createConfigStore({ files: new FakeFiles(), session }), llm, log };
  return { session, llm, log, deps };
}

describe("runAdvisor", () => {
  it("asks advisor.model for a second opinion on the last exchange", async () => {
    const { session, llm, log, deps } = setup();
    session.state.set(CONFIG_MAP_STATE_KEY, JSON.stringify({ "advisor.model": " gpt-big " }));
    const header = describeAdvisor("gpt-big");
    strictEqual(await runAdvisor(deps), `── ${header}\n\nlooks right`);
    const prompt = buildAdvicePrompt(EXCHANGE);
    deepStrictEqual(llm.completes, [{ prompt: prompt.user, override: { system: prompt.system, model: "gpt-big" } }]);
    deepStrictEqual(log.lines, [`info: ${header}`]);
  });

  it("asks the session's own model without advisor.model, and warns it is a self-review", async () => {
    const { llm, log, deps } = setup();
    llm.completions = [""];
    const header = describeAdvisor("");
    strictEqual(await runAdvisor(deps), `── ${header}\n\n`);
    deepStrictEqual(llm.completes[0].override, { system: buildAdvicePrompt(EXCHANGE).system }, "no model override");
    deepStrictEqual(log.lines, [`warn: ${header}`]);
  });

  it("has nothing to review before an assistant answer, or without a session", async () => {
    const { session, llm, deps } = setup();
    session.messages = [{ role: "user", content: "hi" }];
    strictEqual(await runAdvisor(deps), NOTHING);
    session.failure = new Error("no session tools");
    strictEqual(await runAdvisor(deps), NOTHING);
    deepStrictEqual(llm.completes, []);
  });
});
