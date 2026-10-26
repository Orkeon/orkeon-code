// Unit tests for the planner's answer check: the golden answer passes, and each rule of the
// check fails alone with its own text. Run:
//   node --test tests/crews/dev-plan/domain/plan-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { MAX_BATCHES, PLAN_ANSWER_SCHEMA, checkPlanAnswer } from "../../../../src/crews/dev-plan/domain/plan-answer.ts";
import { DESIGN_RULE_IDS } from "../../../../src/shared/domain/dev/design-rules.ts";
import {
  ANCHOR_CASES, ANSWER, BATCH_COUNT_CASES, BRIEF_ANSWER, BRIEF_CASES, BRIEF_CTX, CELL_CASES, CTX, FIX_PASS_CASES,
  RULES_18_TO_24_CASES, RULES_2_TO_7_CASES, RULES_8_TO_12_CASES, SHAPE_CASES, SIXTY_ONE_UNKNOWN_IDS, TOP_LEVEL_FIELDS,
  answerWithIdInCovers, answerWithRefPathAndWordyReuse, copy, edited, paddedAnswer,
} from "./plan-answer.fixtures.ts";
import type { SchemaView } from "./plan-answer.fixtures.ts";
import { assertAccepted, assertHasProblem, assertProblems, assertSchemaHolds } from "./plan-answer.assertions.ts";

describe("checkPlanAnswer on the golden answers", () => {
  it("accepts answer.json (the plan of § 3)", () => {
    // Arrange
    const answer = copy(ANSWER);

    // Act
    const r = checkPlanAnswer(answer, CTX);

    // Assert
    assertProblems(r, []);
  });

  it("accepts answer-cache.json against the refactor brief", () => {
    // Arrange
    const answer = copy(BRIEF_ANSWER);

    // Act
    const r = checkPlanAnswer(answer, BRIEF_CTX);

    // Assert
    assertProblems(r, []);
  });

  it("trims every string and keeps a note's one line break", () => {
    // Arrange
    const answer = paddedAnswer();

    // Act
    const r = checkPlanAnswer(answer, CTX);

    // Assert
    assertAccepted(r);
    strictEqual(r.value.feature, "Prune old memory entries");
    strictEqual(r.value.batches[0].steps[0].tests[0].name, "removes the entries saved before the cut-off");
    strictEqual(r.value.batches[0].steps[0].note, "first line\n second line");
  });
});

describe("PLAN_ANSWER_SCHEMA", () => {
  it("requires every top-level field", () => {
    // Arrange
    const schema = PLAN_ANSWER_SCHEMA as SchemaView;

    // Act
    const required = schema.required;

    // Assert
    deepStrictEqual(required, TOP_LEVEL_FIELDS);
  });

  it("enumerates the design rule ids for a non-applicable row", () => {
    // Arrange
    const schema = PLAN_ANSWER_SCHEMA as SchemaView;

    // Act
    const na = schema.properties.nonApplicable.items?.properties.id as { enum: string[] };

    // Assert
    deepStrictEqual(na.enum, [...DESIGN_RULE_IDS]);
  });

  it("enumerates the three anchor kinds, the kind required", () => {
    // Arrange
    const schema = PLAN_ANSWER_SCHEMA;

    // Act
    const text = JSON.stringify(schema);

    // Assert
    assertSchemaHolds(text, ['"enum":["ref","create","existing"]', '"required":["kind"]']);
  });
});

describe("rule 1: the shape", () => {
  it("refuses a value that is not an object", () => {
    // Arrange
    const value: unknown[] = [];

    // Act
    const r = checkPlanAnswer(value, CTX);

    // Assert
    deepStrictEqual(r, { ok: false, problems: ["the answer is not an object"] });
  });

  for (const c of SHAPE_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, c.ctx ?? CTX);

      // Assert
      assertProblems(r, c.problems);
    });
  }
});

describe("cell kinds and labels", () => {
  for (const c of CELL_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, c.ctx ?? CTX);

      // Assert
      assertProblems(r, c.problems);
    });
  }
});

describe("rules 2 to 7: batches, steps and tests", () => {
  it("2: caps the batches at 8", () => {
    // Arrange
    const expected = 8;

    // Act
    const cap = MAX_BATCHES;

    // Assert
    strictEqual(cap, expected);
  });

  for (const c of BATCH_COUNT_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, CTX);

      // Assert
      assertHasProblem(r, c.problem);
    });
  }

  for (const c of RULES_2_TO_7_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, c.ctx ?? CTX);

      // Assert
      assertProblems(r, c.problems);
    });
  }
});

describe("rules 8 to 12: ids, owners, design rules, dependencies", () => {
  for (const c of RULES_8_TO_12_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, c.ctx ?? CTX);

      // Assert
      assertProblems(r, c.problems);
    });
  }
});

describe("rules 13 to 17 and 26: anchors", () => {
  for (const c of ANCHOR_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, c.ctx ?? CTX);

      // Assert
      assertProblems(r, c.problems);
    });
  }
});

describe("rules 18 to 21 and 24: reuse, design rows, elements, feature", () => {
  for (const c of RULES_18_TO_24_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, c.ctx ?? CTX);

      // Assert
      assertProblems(r, c.problems);
    });
  }
});

describe("rules 22 and 23: a change brief", () => {
  for (const c of BRIEF_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, c.ctx ?? CTX);

      // Assert
      assertProblems(r, c.problems);
    });
  }

  it("mends a source id written in covers into the test's ids", () => {
    // Arrange
    const { answer, id } = answerWithIdInCovers();

    // Act
    const r = checkPlanAnswer(answer, CTX);

    // Assert
    assertProblems(r, []);
    if (r.ok) deepStrictEqual([r.value.batches[0].steps[0].tests[0].ids, r.value.batches[0].steps[0].tests[0].covers], [[id], []]);
  });

  it("mends a ref anchor whose path is its ref's own, and a reuse entry with words after its ref", () => {
    // Arrange
    const { answer, j, column, i, ref } = answerWithRefPathAndWordyReuse();

    // Act
    const r = checkPlanAnswer(answer, CTX);

    // Assert
    assertProblems(r, []);
    if (r.ok) {
      deepStrictEqual(r.value.batches[0].steps[j].anchors[column][i], { kind: "ref", ref });
      deepStrictEqual(r.value.reuse.at(-1), ref);
    }
  });
});

describe("rule 25: the problem cap", () => {
  it("lists 60 problems and counts the rest", () => {
    // Arrange
    const answer = edited({ edit: SIXTY_ONE_UNKNOWN_IDS });

    // Act
    const r = checkPlanAnswer(answer, CTX);

    // Assert
    const problems = r.ok ? [] : r.problems;
    strictEqual(problems.length, 61);
    strictEqual(problems[0], "B1 S1 T1: BR-100 is not an id of the source");
    strictEqual(problems[59], "B1 S1 T1: BR-159 is not an id of the source");
    strictEqual(problems[60], "… 1 more problems");
  });
});

describe("fix pass: what the plan's markdown and the harness would misread", () => {
  for (const c of FIX_PASS_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = edited(c);

      // Act
      const r = checkPlanAnswer(answer, c.ctx ?? CTX);

      // Assert
      assertProblems(r, c.problems);
    });
  }
});
