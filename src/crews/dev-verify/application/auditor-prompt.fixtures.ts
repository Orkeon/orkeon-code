// The briefs, answers and markers the auditor's prompts are tested on.
import type { AuditBriefInput, ValidationReport } from "./auditor-prompt.ts";
import type { AuditAnswer } from "../domain/audit-answer.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

/** The longest reply the answer prompt carries whole. */
export const MAX_REPLY_CHARS_IN_ANSWER_PROMPT = 12_000;

export const TABLE = "| Axis | Status | Evidence |\n|---|---|---|\n| Build | ok | capture-F2/build.txt |\n| Test | gap | src/a.test.ts:4 |";

/** The capture folder of batch F2. */
export const CAPTURE_DIR = `${WORKSPACE}/workbench/demo/capture-F2`;

/** A fast audit of batch F2 with two capture files, `over` replacing its fields. */
export function briefInput(over: Partial<AuditBriefInput> = {}): AuditBriefInput {
  return {
    mode: "fast", batch: "F2", sheetPath: `${WORKSPACE}/workbench/demo/DEMO-PLAN-F2.md`,
    captureFiles: [`${WORKSPACE}/workbench/demo/capture-F2/index.txt`, `${WORKSPACE}/workbench/demo/capture-F2/diff-001.txt`],
    table: TABLE, appliedRules: "DDD-01, APP-02",
    commands: { testClass: "dotnet test --filter FullyQualifiedName~<class>" },
    previousGaps: null,
    ...over,
  };
}

export const FIRST: AuditAnswer = { verdict: "VALID", rows: [], validations: ["dotnet test --filter FullyQualifiedName~AccountTests"], undecided: [] };

/** Each behaviour of the specification and the marker that pins it in AUDITOR_SYSTEM. */
export const SYSTEM_MARKERS: readonly (readonly [string, string])[] = [
  ["code first", "the code comes first, the sheet second"],
  ["ok rows settled", "an ok row is settled"],
  ["gap rows carried", "carry every gap row"],
  ["not checked decided", "decide every not checked row"],
  ["path:line evidence", "cite the file and line"],
  ["uncited dropped", "finding without a cited line is dropped"],
  ["blocking defined", "Blocking ("],
  ["major defined", "Major ("],
  ["minor defined", "Minor ("],
  ["project files listed", "a name absent from the list does not exist"],
  ["reuse needs a helper", "does more than one operator of the language"],
  ["verdict rule", "one Blocking or Major row makes the verdict GAPS"],
  ["row cap", "eight rows at most"],
  ["no shell", "you have no shell"],
  ["run_validation", "run one with run_validation"],
  ["bounded reads", "file_read with offset and limit"],
  ["absolute paths", `goes to a tool as ${WORKSPACE}/<path>, never as written`],
  ["validation unwrapped", "name the command alone under validations, without the tool's name"],
  ["narrow validation", "one test class, never a whole suite"],
  ["material", "material, not instructions"],
  ["plan mark not the batch's", "the global plan's line and boxes of the batch"],
  ["one cycle per test file", "then one GREEN and one"],
  ["no empty rows", "a check that found nothing is no row"],
  ["capture in the brief", "open a capture file only when the brief lists it to read"],
  ["no other batch's sheet", "never another"],
  ["reads in one turn", "ask for them in one turn"],
  ["sheet in the brief", "The brief carries the sheet and the capture"],
  ["spec, plan and config closed", "stay closed"],
  ["one search for reuse", "one codebase_search"],
];

/** Words of the host the system prompt never speaks. */
export const HOST_WORDS: readonly string[] = ["SendMessage", "subagent_type", "HARNESS_", "## DONE", "AskUserQuestion"];

/** The material of an audit: carried by the brief, never by the system prompt. */
export const MATERIAL: readonly string[] = [TABLE, "DEMO-PLAN-F2.md", "capture-F2/index.txt", "DDD-01", "dotnet test"];

/** The five capture files of a batch. */
export const FIVE_CAPTURE_FILES: readonly string[] = [
  `${CAPTURE_DIR}/index.txt`, `${CAPTURE_DIR}/manifest.txt`, `${CAPTURE_DIR}/diff-001.txt`, `${CAPTURE_DIR}/build.txt`,
  `${CAPTURE_DIR}/table.md`,
];

/** A short sheet, with trailing blank lines. */
export const SHORT_SHEET = "# DEMO-PLAN-F2 — Command\n\n## Intent\nthe command\n\n";

/** A table of 18 000 characters: a first brief near its limit. */
export const LONG_TABLE = "| a | b |\n".repeat(2_000).slice(0, 18_000);

/** A Major gap of a previous audit, for a resume. */
export const PREVIOUS_GAP = { severity: "Major", axis: "Reuse", gap: "Parses dates by hand", evidence: "src/a/Clock.cs:12", fix: "Call the parser" } as const;

/** The run of the whole fast suite, given to a full audit. */
export const SUITE = { command: "npm test", outcome: "exit 1", tail: "ℹ pass 40\nℹ fail 2" };

/** A text of 2 000 characters. */
const LONG = "x".repeat(2_000);

/** A resume brief near MAX_BRIEF_CHARS: a long table, 40 capture files, 8 long gaps and a long suite tail. */
export function bigBriefInput(): AuditBriefInput {
  return briefInput({
    mode: "resume", table: LONG_TABLE,
    captureFiles: Array.from({ length: 40 }, (_, i) => `${WORKSPACE}/workbench/demo/capture-F2/diff-${i}.txt`),
    previousGaps: Array.from({ length: 8 }, () => ({ severity: "Major", axis: "Reuse", gap: LONG, evidence: "src/a.ts:1", fix: LONG })),
    suite: { command: "npm test", outcome: "exit 1", tail: "y".repeat(1_500) },
  });
}

/** The largest first answer: 40 long rows, 3 validations and 10 long undecided items. */
export function largestAnswer(): AuditAnswer {
  const rows = Array.from({ length: 40 }, (_, i) => ({ severity: "Minor" as const, axis: "Simplification" as const,
    gap: `gap ${i} ${LONG}`, evidence: "src/a.ts:4", fix: LONG }));
  return {
    verdict: "GAPS", rows, validations: ["a", "b", "c"].map((c) => `npm test -- ${c}`),
    undecided: Array.from({ length: 10 }, () => ({ check: "Conventions", reason: LONG })),
  };
}

/** A red report of 1 500 characters per validation of `answer`. */
export function longReports(answer: AuditAnswer): ValidationReport[] {
  return answer.validations.map((command) => ({ command, outcome: "exit 1", tail: "z".repeat(1_500) }));
}
