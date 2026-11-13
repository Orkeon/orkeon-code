// The evidence a change brief stands on: which command may run (a narrow test command of the pack, or the CLI and
// plain words that stay in the checkout), and which run stops the step (a bug that does not fail or never ran, a
// failed measurement, a timeout).
// Run:  node --test tests/crews/dev-change/application/evidence.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { commandProblem, pickCommand, runStop } from "../../../../src/crews/dev-change/application/evidence.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { ACCEPTED_COMMANDS, BUG_STOPS, PACK, REFUSED_COMMANDS, ran } from "./evidence.fixtures.ts";
import { assertSecondPromptMentions } from "./evidence.assertions.ts";

describe("commandProblem", () => {
  for (const command of ACCEPTED_COMMANDS) {
    it(`accepts the CLI with plain words inside the checkout, and a narrow test command: ${command}`, () => {
      // Arrange
      const pack = PACK;

      // Act
      const problem = commandProblem(command, pack);

      // Assert
      strictEqual(problem, null);
    });
  }

  for (const c of REFUSED_COMMANDS) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const { command } = c;

      // Act
      const problem = commandProblem(command, PACK);

      // Assert
      ok(problem !== null, command);
    });
  }
});

describe("pickCommand", () => {
  it("tells the second attempt the whole parse error, on one line", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.extractions = [new Error('not JSON. Raw: {\n  "command":\n    "node'), { command: "node --test tests/a.test.ts" }];

    // Act
    await pickCommand("dev-change", llm, "bug", "", "the failing case", PACK);

    // Assert
    assertSecondPromptMentions(llm.extracts, 'the answer did not parse: not JSON. Raw: { "command": "node');
  });
});

describe("runStop", () => {
  it("a bug reproduces when its command ran and failed", () => {
    // Arrange
    const failed = ran({ exitCode: 1 });

    // Act
    const stop = runStop("dev-change", "bug", failed, "f");

    // Assert
    strictEqual(stop, null);
  });

  for (const c of BUG_STOPS) {
    it(`a bug does not reproduce on ${c.name}`, () => {
      // Arrange
      const { ran: run } = c;

      // Act
      const stop = runStop("dev-change", "bug", run, "f");

      // Assert
      ok(stop?.includes(c.says), stop ?? "no stop");
    });
  }

  it("a measurement stands when it exits 0", () => {
    // Arrange
    const passed = ran({ exitCode: 0 });

    // Act
    const stop = runStop("dev-change", "perf", passed, "f");

    // Assert
    strictEqual(stop, null);
  });

  it("a measurement that does not exit 0 stops the step", () => {
    // Arrange
    const failed = ran({ exitCode: 1 });

    // Act
    const stop = runStop("dev-change", "perf", failed, "f");

    // Assert
    ok(stop?.includes("measurement failed"));
  });
});
