// The reviewer's charter runs, offers its ten read tools and nothing that writes,
// runs a command or builds the index. Run:
//   node --test tests/shared/domain/dev/reviewer-charter.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { NEXT_BATCH_REVIEWER_CHARTER, REVIEWER_CHARTER, REVIEWER_TOOLS } from "../../../../src/shared/domain/dev/reviewer-charter.ts";
import { charterCatalogue, charterProblems } from "../../../../src/shared/domain/agents/charter.ts";
import { FIVE_READ_TOOLS, FORBIDDEN_TOOLS, REVIEWER_CHARTERS, TEN_READ_TOOLS } from "./reviewer-charter.fixtures.ts";

describe("REVIEWER_CHARTER", () => {
  it("can run", () => {
    // Arrange
    const charter = REVIEWER_CHARTER;

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("is named dev-reviewer, acts in plan, 20 iterations", () => {
    // Arrange
    const expected = { name: "dev-reviewer", mode: "plan", maxIterations: 20 };

    // Act
    const { name, mode, maxIterations } = REVIEWER_CHARTER;

    // Assert
    strictEqual(name, expected.name);
    strictEqual(mode, expected.mode);
    strictEqual(maxIterations, expected.maxIterations);
  });

  it("lists exactly the ten read tools", () => {
    // Arrange
    const expected = TEN_READ_TOOLS;

    // Act
    const tools = REVIEWER_TOOLS;

    // Assert
    deepStrictEqual(tools, expected);
  });

  it("offers exactly the ten read tools", () => {
    // Arrange
    const charter = REVIEWER_CHARTER;

    // Act
    const catalogue = charterCatalogue(charter);

    // Assert
    deepStrictEqual(catalogue, [...REVIEWER_TOOLS]);
  });

  for (const tool of FORBIDDEN_TOOLS) {
    it(`offers no shell, no write, no ingest, no index build: ${tool}`, () => {
      // Arrange
      const charter = REVIEWER_CHARTER;

      // Act
      const catalogue = charterCatalogue(charter);

      // Assert
      ok(!catalogue.includes(tool), tool);
    });
  }
});

describe("NEXT_BATCH_REVIEWER_CHARTER", () => {
  it("can run", () => {
    // Arrange
    const charter = NEXT_BATCH_REVIEWER_CHARTER;

    // Act
    const problems = charterProblems(charter);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("is the reviewer's charter in plan with eight iterations", () => {
    // Arrange
    const reviewer = REVIEWER_CHARTER;

    // Act
    const { name, mode, maxIterations, disallowed } = NEXT_BATCH_REVIEWER_CHARTER;

    // Assert
    strictEqual(name, reviewer.name);
    strictEqual(mode, "plan");
    strictEqual(maxIterations, 8);
    deepStrictEqual(disallowed, reviewer.disallowed);
  });

  it("offers five read tools", () => {
    // Arrange
    const charter = NEXT_BATCH_REVIEWER_CHARTER;

    // Act
    const catalogue = charterCatalogue(charter);

    // Assert
    deepStrictEqual(catalogue, FIVE_READ_TOOLS);
  });
});

describe("the reviewer's charters and the project list", () => {
  for (const c of REVIEWER_CHARTERS) {
    it(`offers glob, the tool a cut project list names: ${c.review}`, () => {
      // Arrange
      const tool = "glob";

      // Act
      const catalogue = charterCatalogue(c.charter);

      // Assert
      ok(catalogue.includes(tool), `the charter of ${c.review} lacks ${tool}`);
    });
  }

  it("gives the next batch's review a subset of the plan review's tools", () => {
    // Arrange
    const plan = REVIEWER_TOOLS;

    // Act
    const absent = NEXT_BATCH_REVIEWER_CHARTER.tools.filter((tool) => !plan.includes(tool));

    // Assert
    deepStrictEqual(absent, []);
  });
});
