// The auditor's JSON answer: its schema and every problem the check names. Run:
//   node --test src/crews/dev-verify/domain/audit-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok } from "node:assert";

import { AUDIT_ANSWER_SCHEMA, AXES, MAX_ANSWER_ROWS, MAX_VALIDATIONS, SEVERITY_ORDER, checkAuditAnswer, validationCommand } from "./audit-answer.ts";

const row = (over: Record<string, unknown> = {}) => ({
  severity: "Major", axis: "Reuse", gap: "Parses dates by hand", evidence: "src/a/Clock.cs:12",
  fix: "Call the existing parser", ...over,
});
const answer = (over: Record<string, unknown> = {}) => ({ verdict: "GAPS", rows: [row()], validations: [], ...over });
const problemsOf = (value: unknown): string[] => {
  const checked = checkAuditAnswer(value);
  return checked.ok ? [] : checked.problems;
};

describe("checkAuditAnswer", () => {
  it("accepts a well-formed answer, trimmed, undecided absent as []", () => {
    deepStrictEqual(checkAuditAnswer(answer({
      verdict: "GAPS", rows: [row({ gap: "  Parses dates by hand ", fix: " Call the existing parser\n" })],
      validations: ["  dotnet test --filter X "],
    })), {
      ok: true,
      value: {
        verdict: "GAPS",
        rows: [{ severity: "Major", axis: "Reuse", gap: "Parses dates by hand", evidence: "src/a/Clock.cs:12", fix: "Call the existing parser" }],
        validations: ["dotnet test --filter X"],
        undecided: [],
      },
    });
  });

  it("maps an axis case-insensitively and 'stale plan…' to Plan", () => {
    const checked = checkAuditAnswer(answer({ rows: [row({ axis: "conventions" }), row({ axis: " TEST " }), row({ axis: "Stale plan (sheet)" })] }));
    ok(checked.ok);
    deepStrictEqual(checked.value.rows.map((r) => r.axis), ["Conventions", "Test", "Plan"]);
  });

  it("keeps the undecided items", () => {
    const checked = checkAuditAnswer(answer({ undecided: [{ check: " Cost ", reason: "not measured " }] }));
    ok(checked.ok);
    deepStrictEqual(checked.value.undecided, [{ check: "Cost", reason: "not measured" }]);
  });

  it("accepts the table and capture files as evidence", () => {
    deepStrictEqual(problemsOf(answer({ rows: [row({ evidence: "table.md, Build row" }), row({ evidence: "capture-F2/build.txt" })] })), []);
  });

  it("refuses what is not an object", () => {
    for (const bad of [null, [], "GAPS", 3]) deepStrictEqual(problemsOf(bad), ["the answer is not an object"]);
  });

  it("refuses a verdict other than VALID or GAPS", () => {
    deepStrictEqual(problemsOf(answer({ verdict: "PASS" })), ["verdict must be VALID or GAPS"]);
  });

  it("refuses rows that are not a list", () => {
    deepStrictEqual(problemsOf(answer({ rows: "none" })), ["rows must be a list"]);
  });

  it("refuses more than 40 rows", () => {
    deepStrictEqual(problemsOf(answer({ rows: Array.from({ length: MAX_ANSWER_ROWS + 1 }, () => row()) })), ["at most 40 rows, not 41"]);
  });

  it("names a bad severity and a bad axis by row", () => {
    deepStrictEqual(problemsOf(answer({ rows: [row(), row({ severity: "Critical", axis: "Style" })] })), [
      "row 2: severity must be Blocking, Major or Minor",
      "row 2: axis 'Style' is not one of Correctness, Reuse, Simplification, Cost, Placement, Conventions, Test, Plan, Scope",
    ]);
  });

  it("names each empty field", () => {
    deepStrictEqual(problemsOf(answer({ rows: [row({ gap: " ", evidence: "", fix: undefined })] })), [
      "row 1: gap is empty", "row 1: evidence is empty", "row 1: fix is empty",
    ]);
  });

  it("refuses evidence that cites no path:line", () => {
    deepStrictEqual(problemsOf(answer({ rows: [row({ evidence: "the clock class" })] })), ["row 1: evidence cites no path:line"]);
  });

  it("refuses validations that are not a list of commands", () => {
    deepStrictEqual(problemsOf(answer({ validations: "dotnet test" })), ["validations must be a list of commands"]);
    deepStrictEqual(problemsOf(answer({ validations: ["a", 3] })), ["validations must be a list of commands"]);
  });

  it("refuses 4 validations", () => {
    deepStrictEqual(problemsOf(answer({ validations: ["a", "b", "c", "d"] })), ["at most 3 validations, not 4"]);
  });

  it("names an undecided item without both strings", () => {
    deepStrictEqual(problemsOf(answer({ undecided: [{ check: "Cost", reason: "x" }, { check: "Cost" }] })), [
      "undecided 2: check and reason are needed",
    ]);
  });

  it("collects every problem, in the frozen order", () => {
    deepStrictEqual(problemsOf({ verdict: 1, rows: [row({ severity: "x", evidence: "nowhere" })], validations: ["a", "b", "c", "d"], undecided: [{}] }), [
      "verdict must be VALID or GAPS",
      "row 1: severity must be Blocking, Major or Minor",
      "row 1: evidence cites no path:line",
      "at most 3 validations, not 4",
      "undecided 1: check and reason are needed",
    ]);
  });
});

describe("validationCommand", () => {
  const cmd = "dotnet test --filter FullyQualifiedName~AccountTests";
  it("takes the tool's name off a command it wraps in one quote, in each form", () => {
    for (const written of [`run_validation "${cmd}"`, `run_validation '${cmd}'`, `run_validation \`${cmd}\``,
      `run_validation("${cmd}")`, ` run_validation ( '${cmd}' ) `]) {
      deepStrictEqual(validationCommand(written), cmd, written);
    }
    deepStrictEqual(validationCommand(`run_validation 'dotnet test --filter "X"'`), 'dotnet test --filter "X"');
  });

  it("reads a quote that holds its own kind escaped, and an argument named command", () => {
    deepStrictEqual(validationCommand('run_validation "x --filter \\"X\\""'), 'x --filter "X"');
    deepStrictEqual(validationCommand("run_validation 'grep -E \\'a\\.b\\''"), "grep -E 'a\\.b'");
    deepStrictEqual(validationCommand(`run_validation(command="${cmd}")`), cmd);
    deepStrictEqual(validationCommand(`run_validation( command: '${cmd}' )`), cmd);
  });

  it("leaves a form with more than one reading as written", () => {
    for (const written of [`run_validation "a" "b"`, `run_validation("${cmd}"`, `run_validation "${cmd}")`,
      `run_validation ${cmd}`, `echo run_validation "${cmd}"`, 'run_validation "x "X""',
      `run_validation(command="${cmd}"`, `run_validation command="${cmd}"`, `run_validation(cmd="${cmd}")`]) {
      deepStrictEqual(validationCommand(written), written.trim(), written);
    }
  });

  it("is what checkAuditAnswer keeps", () => {
    const checked = checkAuditAnswer({ verdict: "VALID", rows: [], validations: [`run_validation "${cmd}"`] });
    ok(checked.ok);
    deepStrictEqual(checked.ok && checked.value.validations, [cmd]);
  });
});

describe("AUDIT_ANSWER_SCHEMA", () => {
  it("lists the 9 axes, the 3 severities and the required keys", () => {
    const schema = AUDIT_ANSWER_SCHEMA as any;
    deepStrictEqual(schema.required, ["verdict", "rows", "validations"]);
    deepStrictEqual(schema.properties.verdict.enum, ["VALID", "GAPS"]);
    deepStrictEqual(schema.properties.rows.items.properties.axis.enum, [...AXES]);
    deepStrictEqual(schema.properties.rows.items.properties.severity.enum, ["Blocking", "Major", "Minor"]);
    deepStrictEqual(schema.properties.rows.items.required, ["severity", "axis", "gap", "evidence", "fix"]);
    deepStrictEqual(schema.properties.undecided.items.required, ["check", "reason"]);
    deepStrictEqual(SEVERITY_ORDER, ["Blocking", "Major", "Minor"]);
    deepStrictEqual(MAX_VALIDATIONS, 3);
  });
});
