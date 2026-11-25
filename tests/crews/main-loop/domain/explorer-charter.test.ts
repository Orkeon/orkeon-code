// The main loop's explorer charter: it can run, and in plan mode it keeps every tool it names. Run:
//   node --test tests/crews/main-loop/domain/explorer-charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { EXPLORER_CHARTER, EXPLORER_TOOLS, explorerReachable } from "../../../../src/crews/main-loop/domain/explorer-charter.ts";
import { CHAT_TOOLS } from "../../../../src/shared/domain/agent-policy/permission.ts";
import { charterCatalogue, charterProblems } from "../../../../src/shared/domain/agents/charter.ts";
import { REACHABLE_CASES } from "./explorer-charter.fixtures.ts";

describe("EXPLORER_CHARTER", () => {
  it("is a charter that can run: a kebab name, a read-only mode, tools that mode offers", () => {
    // Arrange
    const charter = EXPLORER_CHARTER;

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("is offered every tool it names, none dropped by plan mode or its disallowed list", () => {
    // Arrange
    const charter = EXPLORER_CHARTER;

    // Act
    const catalogue = charterCatalogue(charter);

    // Assert
    deepStrictEqual(catalogue, [...EXPLORER_TOOLS]);
  });
});

describe("explorerReachable", () => {
  for (const c of REACHABLE_CASES) {
    it(c.name, () => {
      // Arrange
      const { mode, rules } = c;

      // Act
      const reachable = explorerReachable(mode, rules);

      // Assert
      strictEqual(reachable, c.reachable);
    });
  }
});

describe("EXPLORER_TOOLS, the chat family", () => {
  it("names no chat tool: the chat family is the main loop's alone", () => {
    // Arrange
    const tools = EXPLORER_TOOLS;

    // Act
    const chat = tools.filter((t) => CHAT_TOOLS.includes(t));

    // Assert
    deepStrictEqual(chat, []);
  });
});
