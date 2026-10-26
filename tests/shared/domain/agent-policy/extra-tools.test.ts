// The `tools.extra` notation: entries, classes, refusals. Run:
//   node --test tests/shared/domain/agent-policy/extra-tools.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { extraToolsProblem, formatExtraTool, parseExtraTools } from "../../../../src/shared/domain/agent-policy/extra-tools.ts";
import { PARSE_CASES, PROBLEM_CASES, TWO_TOOLS } from "./extra-tools.fixtures.ts";

describe("parseExtraTools", () => {
  for (const c of PARSE_CASES) {
    it(c.name, () => {
      // Arrange
      const { value } = c;

      // Act
      const parsed = parseExtraTools(value);

      // Assert
      deepStrictEqual(parsed, c.expected);
    });
  }
});

describe("formatExtraTool", () => {
  it("always writes the class", () => {
    // Arrange
    const tools = TWO_TOOLS;

    // Act
    const written = tools.map(formatExtraTool);

    // Assert
    deepStrictEqual(written, ["post:write", "fetch_doc:read"]);
  });

  it("reads back as written", () => {
    // Arrange
    const written = TWO_TOOLS.map(formatExtraTool);

    // Act
    const { tools } = parseExtraTools(written);

    // Assert
    deepStrictEqual(tools, TWO_TOOLS);
  });
});

describe("extraToolsProblem", () => {
  for (const c of PROBLEM_CASES) {
    it(c.name, () => {
      // Arrange
      const { value } = c;

      // Act
      const problem = extraToolsProblem(value);

      // Assert
      strictEqual(problem, c.problem);
    });
  }
});
