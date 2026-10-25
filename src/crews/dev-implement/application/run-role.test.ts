// One act of a role. Run:
//   node --test src/crews/dev-implement/application/run-role.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { FakeLlm } from "../../../../tests/support/fake-llm.ts";
import { TEST_AUTHOR } from "../domain/roles.ts";
import { runRole } from "./run-role.ts";

describe("runRole", () => {
  it("acts with the role's tools, system and acceptEdits", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = ["done"];

    // Act
    const result = await runRole(llm, TEST_AUTHOR, "brief");

    // Assert
    deepStrictEqual(result, { ok: true, text: "done" });
    deepStrictEqual(llm.acts[0].request, {
      system: TEST_AUTHOR.system, maxIterations: TEST_AUTHOR.maxIterations, tools: TEST_AUTHOR.tools, permissionMode: "acceptEdits",
    });
  });

  it("answers a failed act as its reason", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.answers = [new Error("tool-call budget exhausted\nmore")];

    // Act
    const result = await runRole(llm, TEST_AUTHOR, "brief");

    // Assert
    deepStrictEqual(result, { ok: false, reason: "test-author: tool-call budget exhausted" });
  });
});
