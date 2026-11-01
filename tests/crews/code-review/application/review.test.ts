// The review steps: which diff the lenses read, and what one pass of lenses returns. Run:
//   node --test tests/crews/code-review/application/review.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual } from "node:assert";

import { chooseReviewDiff, runLenses } from "../../../../src/crews/code-review/application/review.ts";
import { LENSES, STYLE_SEVERITY_CEILING } from "../../../../src/crews/code-review/domain/lenses.ts";
import { FakeLlm } from "../../../support/doubles/fake-llm.ts";
import { CAP, DIFF_CHOICES, PLAIN, STYLE_HIGH } from "./review.fixtures.ts";

describe("chooseReviewDiff", () => {
  for (const c of DIFF_CHOICES) {
    it(c.name, () => {
      // Arrange
      const withFunctionContext = c.withFunctionContext;

      // Act
      const chosen = chooseReviewDiff(PLAIN, withFunctionContext, CAP);

      // Assert
      deepStrictEqual(chosen, { diff: c.diff, functionContext: c.functionContext });
    });
  }
});

describe("runLenses", () => {
  it("brings a style finding above the style ceiling down to it", async () => {
    // Arrange
    const llm = new FakeLlm();
    llm.extractions = [{ findings: [STYLE_HIGH] }];
    const style = LENSES.filter((l) => l.key === "style");

    // Act
    const round = await runLenses(llm, "DIFF", style);

    // Assert
    deepStrictEqual(round, [{ lens: "style", findings: [{ ...STYLE_HIGH, severity: STYLE_SEVERITY_CEILING }] }]);
  });
});
