// The Llm adapter over a FakeLlmFacade. Run:
//   node --test src/shared/infrastructure/orkeon/llm.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, rejects } from "node:assert";

import { createLlm } from "./llm.ts";
import { FakeLlmFacade } from "../../../../tests/support/doubles/fake-llm-facade.ts";
import {
  ACT_ANSWERS, ACT_FAILURE_MARKERS, COMPLETIONS, EFFORTS, GATES, REQUESTS, SCHEMA, llmWithCallbacks,
} from "./llm.fixtures.ts";

describe("createLlm — act with the crew's tool callbacks", () => {
  it("adds the callbacks built for the act's mode, and what the host says of its gate", async () => {
    // Arrange
    const { facade, asked, onToolCall, onToolResult, llm } = llmWithCallbacks();

    // Act
    await llm.act("p1", { permissionMode: "plan", model: "m" });

    // Assert
    deepStrictEqual(asked, [["plan", false]]);
    deepStrictEqual(facade.calls.map((c) => c.args), [["p1", { permissionMode: "plan", llm: { model: "m" }, onToolCall, onToolResult }]]);
  });

  it("adds the callbacks built for the default mode when the act names none", async () => {
    // Arrange
    const { facade, asked, onToolCall, onToolResult, llm } = llmWithCallbacks();

    // Act
    await llm.act("p2", {});

    // Assert
    deepStrictEqual(asked, [["default", false]]);
    deepStrictEqual(facade.calls.map((c) => c.args), [["p2", { onToolCall, onToolResult }]]);
  });
});

describe("createLlm — act", () => {
  for (const c of ACT_ANSWERS) {
    it(c.name, async () => {
      // Arrange
      const facade = new FakeLlmFacade();
      facade.actResult = c.result;

      // Act
      const answer = await createLlm(facade).act("p", {});

      // Assert
      strictEqual(answer, c.expected);
    });
  }

  for (const c of REQUESTS) {
    it(c.name, async () => {
      // Arrange
      const facade = new FakeLlmFacade();

      // Act
      await createLlm(facade).act("p", c.request);

      // Assert
      deepStrictEqual(facade.calls.map((call) => call.args), [["p", c.options]]);
    });
  }

  it("passes an act's tool subset as a list of its own", async () => {
    // Arrange
    const facade = new FakeLlmFacade();
    const tools = ["file_read", "run_tests"] as const;

    // Act
    await createLlm(facade).act("p", { maxIterations: 5, tools });

    // Assert
    deepStrictEqual(facade.calls.map((c) => c.args), [["p", { maxIterations: 5, tools: ["file_read", "run_tests"] }]]);
  });

  it("lets a failing call reject", async () => {
    // Arrange
    const facade = new FakeLlmFacade();
    facade.actResult = new Error("budget exhausted");

    // Act
    const act = createLlm(facade).act("p", {});

    // Assert
    await rejects(act, /budget exhausted/);
  });

  for (const c of ACT_FAILURE_MARKERS) {
    it(c.name, async () => {
      // Arrange
      const facade = new FakeLlmFacade();
      facade.actResult = c.result;

      // Act
      const act = createLlm(facade).act("p", {});

      // Assert
      await rejects(act, c.expected);
    });
  }
});

describe("createLlm — complete and extract", () => {
  for (const c of COMPLETIONS) {
    it(c.name, async () => {
      // Arrange
      const facade = new FakeLlmFacade();
      facade.completion = "advice";

      // Act
      const answer = await createLlm(facade).complete(c.prompt, c.options);

      // Assert
      strictEqual(answer, "advice");
      deepStrictEqual(facade.calls.map((call) => call.args), [c.args]);
    });
  }

  it("sends a system message first through chat, with the model override", async () => {
    // Arrange
    const facade = new FakeLlmFacade();
    facade.completion = "feat: x";

    // Act
    const answer = await createLlm(facade).complete("the diff", { system: "write the message", model: "m" });

    // Assert
    strictEqual(answer, "feat: x");
    deepStrictEqual(facade.calls, [{
      method: "chat",
      args: [[{ role: "system", content: "write the message" }, { role: "user", content: "the diff" }], { llm: { model: "m" } }],
    }]);
  });

  it("throws a chat reply that is the host's failure marker as an LlmFailure", async () => {
    // Arrange
    const facade = new FakeLlmFacade();
    facade.completion = "<undefined-llm:chat:2 msgs>";

    // Act
    const act = createLlm(facade).complete("p", { system: "s" });

    // Assert
    await rejects(act, { name: "LlmFailure" });
  });

  it("throws a completion that is the host's failure marker as an LlmFailure", async () => {
    // Arrange
    const facade = new FakeLlmFacade();
    facade.completion = "<undefined-llm:invalid api key>";

    // Act
    const act = createLlm(facade).complete("summarise");

    // Assert
    await rejects(act, { name: "LlmFailure", message: "the model call failed: invalid api key" });
  });

  it("extracts with the schema as given, and answers the reply as is", async () => {
    // Arrange
    const facade = new FakeLlmFacade();
    facade.extraction = { findings: [] };

    // Act
    const reply = await createLlm(facade).extract("review", SCHEMA);

    // Assert
    deepStrictEqual(reply, { findings: [] });
    deepStrictEqual(facade.calls, [{ method: "extract", args: ["review", SCHEMA, undefined] }]);
  });
});

describe("createLlm — permissionGateEnabled", () => {
  for (const c of GATES) {
    it(c.name, () => {
      // Arrange
      const llm = createLlm(c.facade());

      // Act
      const enabled = llm.permissionGateEnabled();

      // Assert
      strictEqual(enabled, c.expected);
    });
  }
});

describe("createLlm — the crew's effort (A-3)", () => {
  for (const c of EFFORTS) {
    it(c.name, async () => {
      // Arrange
      const facade = new FakeLlmFacade();
      const llm = createLlm(facade, undefined, c.defaults);

      // Act
      await llm.act("p", c.request);

      // Assert
      deepStrictEqual(facade.calls.map((call) => (call.args[1] as { effort?: string }).effort), [c.expected]);
    });
  }
});
