// The Llm adapter over a FakeLlmFacade. Run:
//   node_modules/.bin/tsx --test shared/infrastructure/orkeon/llm.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createLlm } from "./llm.ts";
import { FakeLlmFacade } from "../../../../tests/support/fake-llm-facade.ts";

const SCHEMA = { type: "object", properties: { findings: { type: "array" } } };

describe("createLlm — act", () => {
  it("answers the result's output", async () => {
    const facade = new FakeLlmFacade();
    facade.actResult = { output: "done", iterations: 3 };
    strictEqual(await createLlm(facade).act("fix it", {}), "done");
  });

  it("answers a bare string result as is, and nothing as empty", async () => {
    const facade = new FakeLlmFacade();
    facade.actResult = "bare answer";
    strictEqual(await createLlm(facade).act("p", {}), "bare answer");
    facade.actResult = null;
    strictEqual(await createLlm(facade).act("p", {}), "");
    facade.actResult = undefined;
    strictEqual(await createLlm(facade).act("p", {}), "");
  });

  it("keeps an empty output, and stringifies a result whose output is missing", async () => {
    const facade = new FakeLlmFacade();
    facade.actResult = { output: "", iterations: 1 };
    strictEqual(await createLlm(facade).act("p", {}), "");
    facade.actResult = { iterations: 1 };
    strictEqual(await createLlm(facade).act("p", {}), "[object Object]");
    facade.actResult = { output: null };
    strictEqual(await createLlm(facade).act("p", {}), "[object Object]");
  });

  it("passes the request through, its model as the llm patch", async () => {
    const facade = new FakeLlmFacade();
    const llm = createLlm(facade);
    await llm.act("p1", { maxIterations: 80, permissionMode: "plan", system: "SYS", model: "gpt-x" });
    await llm.act("p2", { system: "SYS", maxIterations: 1 });
    await llm.act("p3", { maxIterations: 20, permissionMode: "default", system: "SYS", model: "" });
    deepStrictEqual(facade.calls.map((c) => c.args), [
      ["p1", { maxIterations: 80, permissionMode: "plan", system: "SYS", llm: { model: "gpt-x" } }],
      ["p2", { system: "SYS", maxIterations: 1 }],
      ["p3", { maxIterations: 20, permissionMode: "default", system: "SYS" }],
    ]);
  });

  it("lets a failing call reject", async () => {
    const facade = new FakeLlmFacade();
    facade.actResult = new Error("budget exhausted");
    await rejects(createLlm(facade).act("p", {}), /budget exhausted/);
  });

  it("throws the host's failure marker as an LlmFailure, never answers it", async () => {
    const facade = new FakeLlmFacade();
    facade.actResult = { output: "<undefined-llm:503 Service Unavailable>", iterations: 1 };
    await rejects(createLlm(facade).act("p", {}), {
      name: "LlmFailure",
      message: "the model call failed: 503 Service Unavailable",
      detail: "503 Service Unavailable",
    });
    facade.actResult = "<undefined-llm:act:p>";
    await rejects(createLlm(facade).act("p", {}), { name: "LlmFailure", detail: "act:p" });
  });
});

describe("createLlm — complete and extract", () => {
  it("completes with the model override as the llm patch, or with no options", async () => {
    const facade = new FakeLlmFacade();
    facade.completion = "advice";
    const llm = createLlm(facade);
    strictEqual(await llm.complete("a", { model: "gpt-big" }), "advice");
    await llm.complete("b");
    await llm.complete("c", { model: "" });
    deepStrictEqual(facade.calls.map((c) => c.args), [
      ["a", { llm: { model: "gpt-big" } }],
      ["b", undefined],
      ["c", undefined],
    ]);
  });

  it("sends a system message first through chat, with the model override", async () => {
    const facade = new FakeLlmFacade();
    facade.completion = "feat: x";
    const llm = createLlm(facade);
    strictEqual(await llm.complete("the diff", { system: "write the message", model: "m" }), "feat: x");
    deepStrictEqual(facade.calls, [{
      method: "chat",
      args: [[{ role: "system", content: "write the message" }, { role: "user", content: "the diff" }], { llm: { model: "m" } }],
    }]);
  });

  it("throws a chat reply that is the host's failure marker as an LlmFailure", async () => {
    const facade = new FakeLlmFacade();
    facade.completion = "<undefined-llm:chat:2 msgs>";
    await rejects(createLlm(facade).complete("p", { system: "s" }), { name: "LlmFailure" });
  });

  it("throws a completion that is the host's failure marker as an LlmFailure", async () => {
    const facade = new FakeLlmFacade();
    facade.completion = "<undefined-llm:invalid api key>";
    await rejects(createLlm(facade).complete("summarise"), {
      name: "LlmFailure",
      message: "the model call failed: invalid api key",
    });
  });

  it("extracts with the schema as given, and answers the reply as is", async () => {
    const facade = new FakeLlmFacade();
    facade.extraction = { findings: [] };
    deepStrictEqual(await createLlm(facade).extract("review", SCHEMA), { findings: [] });
    deepStrictEqual(facade.calls, [{ method: "extract", args: ["review", SCHEMA, undefined] }]);
  });
});
