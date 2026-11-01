// The learner's answer check: one case per refusal of the design's table, the mapping
// from the wire's snake_case, and the lists an answer may leave out. Run:
//   node --test tests/crews/dev-learn/domain/learn-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { LEARN_ANSWER_SCHEMA, checkLearnAnswer, motifLabel } from "../../../../src/crews/dev-learn/domain/learn-answer.ts";
import {
  ANSWER_CASES, HARNESS_OWNER_ANSWER, LABEL_CASES, MAPPED_ANSWER, MOTIF_CASES, REMOVES_ANSWER, SAME_ROWS_ANSWER, SCHEMA_WORDS,
  SHOWN, THREE_BAD_MOTIFS, UNSEEN_STATUS_CASES, motif, problemsOf,
} from "./learn-answer.fixtures.ts";
import { assertProblem, assertQuotesWords } from "./learn-answer.assertions.ts";

describe("checkLearnAnswer — a valid answer", () => {
  it("maps snake_case to camelCase, trims, and fills the lists left out", () => {
    // Arrange
    const answer = { motifs: [motif()] };

    // Act
    const r = checkLearnAnswer(answer, SHOWN, true);

    // Assert
    ok(r.ok);
    deepStrictEqual(r.value, MAPPED_ANSWER);
  });

  it("keeps the model's dropped items and a harness owner", () => {
    // Arrange
    const answer = HARNESS_OWNER_ANSWER;

    // Act
    const r = checkLearnAnswer(answer, SHOWN, true);

    // Assert
    ok(r.ok);
    deepStrictEqual(r.value.dropped, [{ title: "Vague", filter: "prevention", reason: "a reminder stops nothing" }]);
    deepStrictEqual(r.value.motifs[0].linesRemoved, ["Old line."]);
  });

  it("accepts a motif that removes a line and adds none", () => {
    // Arrange
    const answer = REMOVES_ANSWER;

    // Act
    const r = checkLearnAnswer(answer, SHOWN, true);

    // Assert
    ok(r.ok);
    deepStrictEqual([r.value.motifs[0].linesRemoved, r.value.motifs[0].linesAdded], [["Old line."], []]);
  });

  it("accepts status new in an answer given without owner lines", () => {
    // Arrange
    const answer = { motifs: [motif()] };

    // Act
    const problems = problemsOf(answer, false);

    // Assert
    deepStrictEqual(problems, []);
  });

  it("accepts an empty list of motifs", () => {
    // Arrange
    const answer = { motifs: [] };

    // Act
    const problems = problemsOf(answer);

    // Assert
    deepStrictEqual(problems, []);
  });
});

describe("checkLearnAnswer — each refusal", () => {
  for (const c of ANSWER_CASES) {
    it(c.name, () => {
      // Arrange
      const { value } = c;

      // Act
      const problems = problemsOf(value);

      // Assert
      assertProblem(problems, c.problem);
    });
  }

  for (const c of MOTIF_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = { motifs: [motif(c.over)] };

      // Act
      const problems = problemsOf(answer);

      // Assert
      assertProblem(problems, c.problem);
    });
  }

  for (const c of UNSEEN_STATUS_CASES) {
    it(c.name, () => {
      // Arrange
      const answer = { motifs: [motif(c.over)] };

      // Act
      const problems = problemsOf(answer, false);

      // Assert
      deepStrictEqual(problems, [c.problem]);
    });
  }

  it("a dropped item missing a field", () => {
    // Arrange
    const answer = { motifs: [], dropped: [{ title: "x", filter: "novelty" }] };

    // Act
    const problems = problemsOf(answer);

    // Assert
    deepStrictEqual(problems, ["dropped 1: title, filter and reason are needed"]);
  });

  it("dropped not a list", () => {
    // Arrange
    const answer = { motifs: [], dropped: "x" };

    // Act
    const problems = problemsOf(answer);

    // Assert
    deepStrictEqual(problems, ["dropped 1: title, filter and reason are needed"]);
  });

  it("two motifs on the same rows, in any order", () => {
    // Arrange
    const answer = SAME_ROWS_ANSWER;

    // Act
    const problems = problemsOf(answer);

    // Assert
    deepStrictEqual(problems, ['motif 2 "Another title": the same rows as motif 1: merge them into one motif']);
  });

  it("collects every problem, numbered from 1, motif by motif", () => {
    // Arrange
    const answer = THREE_BAD_MOTIFS;

    // Act
    const problems = problemsOf(answer);

    // Assert
    deepStrictEqual(problems, [
      "motif 2: title must be 1 to 80 characters", "motif 2: key_term is empty",
      'motif 3 "Refusal paths go untested": the same rows as motif 1: merge them into one motif',
    ]);
  });
});

describe("motifLabel", () => {
  for (const c of LABEL_CASES) {
    it(c.name, () => {
      // Arrange
      const { title } = c;

      // Act
      const label = motifLabel(2, title);

      // Assert
      strictEqual(label, c.label);
    });
  }
});

describe("LEARN_ANSWER_SCHEMA", () => {
  it("names the kinds, the statuses and the required fields", () => {
    // Arrange
    const schema = LEARN_ANSWER_SCHEMA as any;

    // Act
    const s = JSON.stringify(schema);
    const required = schema.properties.motifs.items.required as string[];

    // Assert
    assertQuotesWords(s, SCHEMA_WORDS);
    ok(required.includes("rows") && required.includes("key_term"));
    strictEqual(required.includes("lines_removed"), false);
  });
});
