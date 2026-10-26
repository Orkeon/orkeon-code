// The auditor's JSON answer: its schema and every problem the check names. Run:
//   node --test src/crews/dev-verify/domain/audit-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { AUDIT_ANSWER_SCHEMA, AXES, MAX_VALIDATIONS, SEVERITY_ORDER, checkAuditAnswer, validationCommand } from "../../../../src/crews/dev-verify/domain/audit-answer.ts";
import {
  AMBIGUOUS_FORMS, CMD, ESCAPED_AND_NAMED_FORMS, NOT_OBJECTS, PROBLEM_CASES, TRIMMED_ANSWER, WRAPPED_FORMS, answerRow,
  auditAnswer,
} from "./audit-answer.fixtures.ts";
import { assertProblems } from "./audit-answer.assertions.ts";

describe("checkAuditAnswer", () => {
  it("accepts a well-formed answer, trimmed, undecided absent as []", () => {
    // Arrange
    const answer = auditAnswer({
      verdict: "GAPS", rows: [answerRow({ gap: "  Parses dates by hand ", fix: " Call the existing parser\n" })],
      validations: ["  dotnet test --filter X "],
    });

    // Act
    const checked = checkAuditAnswer(answer);

    // Assert
    deepStrictEqual(checked, { ok: true, value: TRIMMED_ANSWER });
  });

  it("maps an axis case-insensitively and 'stale plan…' to Plan", () => {
    // Arrange
    const answer = auditAnswer({
      rows: [answerRow({ axis: "conventions" }), answerRow({ axis: " TEST " }), answerRow({ axis: "Stale plan (sheet)" })],
    });

    // Act
    const checked = checkAuditAnswer(answer);

    // Assert
    ok(checked.ok);
    deepStrictEqual(checked.value.rows.map((r) => r.axis), ["Conventions", "Test", "Plan"]);
  });

  it("keeps the undecided items", () => {
    // Arrange
    const answer = auditAnswer({ undecided: [{ check: " Cost ", reason: "not measured " }] });

    // Act
    const checked = checkAuditAnswer(answer);

    // Assert
    ok(checked.ok);
    deepStrictEqual(checked.value.undecided, [{ check: "Cost", reason: "not measured" }]);
  });

  for (const bad of NOT_OBJECTS) {
    it(`refuses what is not an object: ${JSON.stringify(bad)}`, () => {
      // Arrange
      const value = bad;

      // Act
      const checked = checkAuditAnswer(value);

      // Assert
      assertProblems(checked, ["the answer is not an object"]);
    });
  }

  for (const c of PROBLEM_CASES) {
    it(c.name, () => {
      // Arrange
      const { value } = c;

      // Act
      const checked = checkAuditAnswer(value);

      // Assert
      assertProblems(checked, c.problems);
    });
  }
});

describe("validationCommand", () => {
  for (const c of WRAPPED_FORMS) {
    it(`takes the tool's name off a command it wraps in one quote, in each form: ${c.written}`, () => {
      // Arrange
      const { written } = c;

      // Act
      const command = validationCommand(written);

      // Assert
      deepStrictEqual(command, c.expected, written);
    });
  }

  for (const c of ESCAPED_AND_NAMED_FORMS) {
    it(`reads a quote that holds its own kind escaped, and an argument named command: ${c.written}`, () => {
      // Arrange
      const { written } = c;

      // Act
      const command = validationCommand(written);

      // Assert
      deepStrictEqual(command, c.expected);
    });
  }

  for (const written of AMBIGUOUS_FORMS) {
    it(`leaves a form with more than one reading as written: ${written}`, () => {
      // Arrange
      const expected = written.trim();

      // Act
      const command = validationCommand(written);

      // Assert
      deepStrictEqual(command, expected, written);
    });
  }

  it("is what checkAuditAnswer keeps", () => {
    // Arrange
    const answer = { verdict: "VALID", rows: [], validations: [`run_validation "${CMD}"`] };

    // Act
    const checked = checkAuditAnswer(answer);

    // Assert
    ok(checked.ok);
    deepStrictEqual(checked.ok && checked.value.validations, [CMD]);
  });
});

describe("AUDIT_ANSWER_SCHEMA", () => {
  it("lists the 9 axes, the 3 severities and the required keys", () => {
    // Arrange
    const axes = [...AXES];

    // Act
    const schema = AUDIT_ANSWER_SCHEMA as any;

    // Assert
    deepStrictEqual(schema.required, ["verdict", "rows", "validations"]);
    deepStrictEqual(schema.properties.verdict.enum, ["VALID", "GAPS"]);
    deepStrictEqual(schema.properties.rows.items.properties.axis.enum, axes);
    deepStrictEqual(schema.properties.rows.items.properties.severity.enum, ["Blocking", "Major", "Minor"]);
    deepStrictEqual(schema.properties.rows.items.required, ["severity", "axis", "gap", "evidence", "fix"]);
    deepStrictEqual(schema.properties.undecided.items.required, ["check", "reason"]);
  });

  it("orders the severities worst first and allows 3 validations", () => {
    // Arrange
    const expected = ["Blocking", "Major", "Minor"];

    // Act
    const limits = { order: SEVERITY_ORDER, validations: MAX_VALIDATIONS };

    // Assert
    deepStrictEqual(limits.order, expected);
    deepStrictEqual(limits.validations, 3);
  });
});
