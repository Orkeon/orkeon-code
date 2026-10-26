// The answers checkAuditAnswer and validationCommand are tested on.
import { MAX_ANSWER_ROWS } from "../../../../src/crews/dev-verify/domain/audit-answer.ts";

/** A well-formed answer row, `over` replacing its fields. */
export function answerRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    severity: "Major", axis: "Reuse", gap: "Parses dates by hand", evidence: "src/a/Clock.cs:12",
    fix: "Call the existing parser", ...over,
  };
}

/** A well-formed GAPS answer of one row, `over` replacing its fields. */
export function auditAnswer(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { verdict: "GAPS", rows: [answerRow()], validations: [], ...over };
}

/** The checked value of a well-formed answer whose texts were padded. */
export const TRIMMED_ANSWER = {
  verdict: "GAPS",
  rows: [{ severity: "Major", axis: "Reuse", gap: "Parses dates by hand", evidence: "src/a/Clock.cs:12", fix: "Call the existing parser" }],
  validations: ["dotnet test --filter X"],
  undecided: [],
};

/** Values that are no object. */
export const NOT_OBJECTS: readonly unknown[] = [null, [], "GAPS", 3];

export interface ProblemCase {
  name: string;
  value: unknown;
  problems: readonly string[];
}

/** Answers and the problems checkAuditAnswer names on each, in its order. */
export const PROBLEM_CASES: readonly ProblemCase[] = [
  {
    name: "accepts the table and capture files as evidence",
    value: auditAnswer({ rows: [answerRow({ evidence: "table.md, Build row" }), answerRow({ evidence: "capture-F2/build.txt" })] }),
    problems: [],
  },
  { name: "refuses a verdict other than VALID or GAPS", value: auditAnswer({ verdict: "PASS" }), problems: ["verdict must be VALID or GAPS"] },
  { name: "refuses rows that are not a list", value: auditAnswer({ rows: "none" }), problems: ["rows must be a list"] },
  {
    name: "refuses more than 40 rows",
    value: auditAnswer({ rows: Array.from({ length: MAX_ANSWER_ROWS + 1 }, () => answerRow()) }),
    problems: ["at most 40 rows, not 41"],
  },
  {
    name: "names a bad severity and a bad axis by row",
    value: auditAnswer({ rows: [answerRow(), answerRow({ severity: "Critical", axis: "Style" })] }),
    problems: [
      "row 2: severity must be Blocking, Major or Minor",
      "row 2: axis 'Style' is not one of Correctness, Reuse, Simplification, Cost, Placement, Conventions, Test, Plan, Scope",
    ],
  },
  {
    name: "names each empty field",
    value: auditAnswer({ rows: [answerRow({ gap: " ", evidence: "", fix: undefined })] }),
    problems: ["row 1: gap is empty", "row 1: evidence is empty", "row 1: fix is empty"],
  },
  {
    name: "refuses evidence that cites no path:line",
    value: auditAnswer({ rows: [answerRow({ evidence: "the clock class" })] }),
    problems: ["row 1: evidence cites no path:line"],
  },
  {
    name: "refuses validations that are not a list of commands: a string",
    value: auditAnswer({ validations: "dotnet test" }),
    problems: ["validations must be a list of commands"],
  },
  {
    name: "refuses validations that are not a list of commands: a list holding a number",
    value: auditAnswer({ validations: ["a", 3] }),
    problems: ["validations must be a list of commands"],
  },
  {
    name: "refuses 4 validations",
    value: auditAnswer({ validations: ["a", "b", "c", "d"] }),
    problems: ["at most 3 validations, not 4"],
  },
  {
    name: "names an undecided item without both strings",
    value: auditAnswer({ undecided: [{ check: "Cost", reason: "x" }, { check: "Cost" }] }),
    problems: ["undecided 2: check and reason are needed"],
  },
  {
    name: "collects every problem, in the frozen order",
    value: {
      verdict: 1, rows: [answerRow({ severity: "x", evidence: "nowhere" })], validations: ["a", "b", "c", "d"], undecided: [{}],
    },
    problems: [
      "verdict must be VALID or GAPS",
      "row 1: severity must be Blocking, Major or Minor",
      "row 1: evidence cites no path:line",
      "at most 3 validations, not 4",
      "undecided 1: check and reason are needed",
    ],
  },
];

/** A validation command, as the auditor means it. */
export const CMD = "dotnet test --filter FullyQualifiedName~AccountTests";

export interface ValidationCase {
  written: string;
  expected: string;
}

/** The tool's name around a command wrapped in one quote, in each form. */
export const WRAPPED_FORMS: readonly ValidationCase[] = [
  { written: `run_validation "${CMD}"`, expected: CMD },
  { written: `run_validation '${CMD}'`, expected: CMD },
  { written: `run_validation \`${CMD}\``, expected: CMD },
  { written: `run_validation("${CMD}")`, expected: CMD },
  { written: ` run_validation ( '${CMD}' ) `, expected: CMD },
  { written: `run_validation 'dotnet test --filter "X"'`, expected: 'dotnet test --filter "X"' },
];

/** A quote that holds its own kind escaped, and an argument named command. */
export const ESCAPED_AND_NAMED_FORMS: readonly ValidationCase[] = [
  { written: 'run_validation "x --filter \\"X\\""', expected: 'x --filter "X"' },
  { written: "run_validation 'grep -E \\'a\\.b\\''", expected: "grep -E 'a\\.b'" },
  { written: `run_validation(command="${CMD}")`, expected: CMD },
  { written: `run_validation( command: '${CMD}' )`, expected: CMD },
];

/** Forms with more than one reading: left as written. */
export const AMBIGUOUS_FORMS: readonly string[] = [
  `run_validation "a" "b"`, `run_validation("${CMD}"`, `run_validation "${CMD}")`,
  `run_validation ${CMD}`, `echo run_validation "${CMD}"`, 'run_validation "x "X""',
  `run_validation(command="${CMD}"`, `run_validation command="${CMD}"`, `run_validation(cmd="${CMD}")`,
];
