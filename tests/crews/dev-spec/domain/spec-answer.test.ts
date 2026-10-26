// checkSpecAnswer and renderSpec: a valid answer passes and renders a file /dev-plan's parser reads back (title,
// UC/BR ids, statements, open questions, decisions); each self-check of the template refuses its own fault.
// Run:  node --test tests/crews/dev-spec/domain/spec-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { parsePlanSource } from "../../../../src/shared/domain/dev/spec-format.ts";
import { parseDecisions, parseOpenQuestions } from "../../../../src/shared/domain/dev/questions.ts";
import { checkSpecAnswer } from "../../../../src/crews/dev-spec/domain/spec-answer.ts";
import { renderSpec } from "../../../../src/crews/dev-spec/domain/spec-render.ts";
import { DECIDED_Q1, OPEN_Q2, REFUSED_SPECS, SPEC_IDS, validSpec } from "./spec-answer.fixtures.ts";
import { assertNoProblem, assertProblems } from "./spec-answer.assertions.ts";

describe("checkSpecAnswer", () => {
  it("accepts a valid answer", () => {
    // Arrange
    const answer = validSpec();

    // Act
    const result = checkSpecAnswer(answer);

    // Assert
    assertNoProblem(result);
  });

  for (const c of REFUSED_SPECS) {
    it(`refuses ${c.name}`, () => {
      // Arrange
      const answer = c.answer();

      // Act
      const result = checkSpecAnswer(answer);

      // Assert
      assertProblems(result, c.problems);
    });
  }
});

describe("renderSpec", () => {
  it("renders a file /dev-plan reads back: title, ids, statements, open questions and decisions", () => {
    // Arrange
    const input = { code: "prune", answer: validSpec(), open: [OPEN_Q2], decisions: [DECIDED_Q1] };

    // Act
    const text = renderSpec(input);

    // Assert
    const parsed = parsePlanSource(text, "spec");
    deepStrictEqual(parsed.problems, []);
    strictEqual(parsed.code, "prune");
    strictEqual(parsed.name, "Prune old memory entries");
    deepStrictEqual(parsed.ids.map((i) => [i.id, i.statement]), SPEC_IDS);
    strictEqual(parsed.blocking.length, 1);
    deepStrictEqual(parseOpenQuestions(text).map((q) => [q.id, q.options]), [["Q2", ["No", "Yes"]]]);
    deepStrictEqual(parseDecisions(text).map((d) => d.answer), ["Refuse"]);
    ok(text.includes("## 12. Open questions") && text.includes("## 13. Decisions"));
    ok(!text.includes("## 6. Data"), "an empty section is left out");
  });
});
