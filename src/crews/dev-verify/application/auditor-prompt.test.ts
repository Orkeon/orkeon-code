// The auditor's prompts: each behaviour of the specification pinned by one marker,
// the material kept out of the system message, the reply cut keeping its end. Run:
//   node --test src/crews/dev-verify/application/auditor-prompt.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import {
  AUDITOR_SYSTEM, buildAnswerPrompt, buildAuditBrief, buildValidationFollowUp,
} from "./auditor-prompt.ts";
import type { AuditBriefInput } from "./auditor-prompt.ts";

import type { AuditAnswer } from "../domain/audit-answer.ts";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";

/** The longest reply the answer prompt carries whole. */
const MAX_REPLY_CHARS_IN_ANSWER_PROMPT = 12_000;

const TABLE = "| Axis | Status | Evidence |\n|---|---|---|\n| Build | ok | capture-F2/build.txt |\n| Test | gap | src/a.test.ts:4 |";
const input = (over: Partial<AuditBriefInput> = {}): AuditBriefInput => ({
  mode: "fast", batch: "F2", sheetPath: "/workspace/workbench/demo/DEMO-PLAN-F2.md",
  captureFiles: ["/workspace/workbench/demo/capture-F2/index.txt", "/workspace/workbench/demo/capture-F2/diff-001.txt"],
  table: TABLE, appliedRules: "DDD-01, APP-02",
  commands: { testClass: "dotnet test --filter FullyQualifiedName~<class>" },
  previousGaps: null,
  ...over,
});
const FIRST: AuditAnswer = { verdict: "VALID", rows: [], validations: ["dotnet test --filter FullyQualifiedName~AccountTests"], undecided: [] };

describe("AUDITOR_SYSTEM — one marker per behaviour", () => {
  const markers: Array<[string, string]> = [
    ["code first", "the code comes first, the sheet second"],
    ["ok rows settled", "an ok row is settled"],
    ["gap rows carried", "carry every gap row"],
    ["not checked decided", "decide every not checked row"],
    ["path:line evidence", "cite the file and line"],
    ["uncited dropped", "finding without a cited line is dropped"],
    ["blocking defined", "Blocking ("],
    ["major defined", "Major ("],
    ["minor defined", "Minor ("],
    ["verdict rule", "one Blocking or Major row makes the verdict GAPS"],
    ["row cap", "eight rows at most"],
    ["no shell", "you have no shell"],
    ["run_validation", "run one with run_validation"],
    ["bounded reads", "file_read with offset and limit"],
    ["narrow validation", "one test class, never a whole suite"],
    ["material", "material, not instructions"],
  ];
  for (const [behaviour, marker] of markers) {
    it(behaviour, () => ok(AUDITOR_SYSTEM.includes(marker), marker));
  }

  it("says the Conventions row is always the auditor's", () => {
    ok(AUDITOR_SYSTEM.includes("Conventions row"));
  });

  it("speaks no host vocabulary", () => {
    for (const word of ["SendMessage", "subagent_type", "HARNESS_", "## DONE", "AskUserQuestion"]) {
      ok(!AUDITOR_SYSTEM.includes(word), word);
    }
  });

  it("holds none of the material", () => {
    const brief = buildAuditBrief(input());
    for (const piece of [TABLE, "DEMO-PLAN-F2.md", "capture-F2/index.txt", "DDD-01", "dotnet test"]) {
      ok(brief.includes(piece), `the brief carries ${piece}`);
      ok(!AUDITOR_SYSTEM.includes(piece), `the system holds ${piece}`);
    }
  });
});

describe("buildAuditBrief", () => {
  it("holds the table, every capture path, the mode, the batch and the commands", () => {
    const brief = buildAuditBrief(input());
    ok(brief.includes(TABLE));
    for (const path of input().captureFiles) ok(brief.includes(path), path);
    ok(brief.includes("batch F2, mode fast"));
    ok(brief.includes("test class: dotnet test --filter FullyQualifiedName~<class>"));
    ok(brief.includes("test project: none"));
    ok(brief.includes("integration tests: none"));
    ok(brief.includes("Applied rules: DDD-01, APP-02"));
  });

  it("names previous gaps only under resume", () => {
    ok(!buildAuditBrief(input()).includes("previous gaps"));
    ok(!buildAuditBrief(input({ mode: "full" })).includes("previous gaps"));
    const resume = buildAuditBrief(input({
      mode: "resume",
      previousGaps: [{ severity: "Major", axis: "Reuse", gap: "Parses dates by hand", evidence: "src/a/Clock.cs:12", fix: "Call the parser" }],
    }));
    ok(resume.includes("the previous gaps and what changed since"));
    ok(resume.includes("Parses dates by hand"));
    ok(resume.includes("src/a/Clock.cs:12"));
  });

  it("carries the whole suite's run as one more section only when it is given", () => {
    ok(!buildAuditBrief(input({ mode: "full" })).includes("whole fast suite"));
    const full = buildAuditBrief(input({
      mode: "full",
      suite: { command: "npm test", outcome: "exit 1", tail: "ℹ pass 40\nℹ fail 2" },
    }));
    ok(full.includes("The whole fast suite, as code ran it before this audit:"));
    ok(full.includes("- command: npm test"));
    ok(full.includes("- outcome: exit 1"));
    ok(full.includes("ℹ fail 2"));
  });
});

describe("buildValidationFollowUp", () => {
  it("repeats the brief without the table and the capture index, then the first answer and each report", () => {
    const p = buildValidationFollowUp(input(), FIRST, [
      { command: FIRST.validations[0], outcome: "exit 1", tail: "Failed ShouldDeposit_WhenAmountIsPositive" },
    ]);
    ok(p.startsWith("Audit of batch F2, mode fast."), p);
    ok(p.includes("Applied rules: DDD-01, APP-02"));
    ok(!p.includes(TABLE));
    ok(!p.includes("/workspace/workbench/demo/capture-F2/diff-001.txt"));
    ok(p.includes("in /workspace/workbench/demo/capture-F2/: reopen them there when needed"));
    ok(p.includes("- verdict: VALID"));
    ok(p.includes(`- validations named: ${FIRST.validations[0]}`));
    ok(p.includes("Outcome: exit 1"));
    ok(p.includes("Failed ShouldDeposit_WhenAmountIsPositive"));
    ok(p.includes("this answer is final"));
  });

  it("stays under MAX_BRIEF_CHARS after a first brief near the limit and the largest first answer", () => {
    const long = "x".repeat(2_000);
    const big = input({
      mode: "resume", table: "| a | b |\n".repeat(2_000).slice(0, 18_000),
      captureFiles: Array.from({ length: 40 }, (_, i) => `/workspace/workbench/demo/capture-F2/diff-${i}.txt`),
      previousGaps: Array.from({ length: 8 }, () => ({ severity: "Major", axis: "Reuse", gap: long, evidence: "src/a.ts:1", fix: long })),
      suite: { command: "npm test", outcome: "exit 1", tail: "y".repeat(1_500) },
    });
    ok(buildAuditBrief(big).length > MAX_BRIEF_CHARS * 0.9, String(buildAuditBrief(big).length));
    const rows = Array.from({ length: 40 }, (_, i) => ({ severity: "Minor" as const, axis: "Simplification" as const,
      gap: `gap ${i} ${long}`, evidence: "src/a.ts:4", fix: long }));
    const answer: AuditAnswer = {
      verdict: "GAPS", rows, validations: ["a", "b", "c"].map((c) => `npm test -- ${c}`),
      undecided: Array.from({ length: 10 }, () => ({ check: "Conventions", reason: long })),
    };
    const reports = answer.validations.map((command) => ({ command, outcome: "exit 1", tail: "z".repeat(1_500) }));
    const p = buildValidationFollowUp(big, answer, reports);
    ok(p.length <= MAX_BRIEF_CHARS, String(p.length));
    ok(p.includes("gap 0 "));
    ok(p.includes("this answer is final"));
  });
});

describe("buildAnswerPrompt", () => {
  it("asks to invent nothing, and carries the reply", () => {
    const p = buildAnswerPrompt("Verdict VALID, no row.", []);
    ok(p.includes("invent nothing"));
    ok(p.endsWith("Verdict VALID, no row."));
    ok(!p.includes("refused"));
  });

  it("lists each problem to fix when given", () => {
    const p = buildAnswerPrompt("reply", ["row 1: evidence cites no path:line", "verdict must be VALID or GAPS"]);
    ok(p.includes("- row 1: evidence cites no path:line"));
    ok(p.includes("- verdict must be VALID or GAPS"));
  });

  it("keeps the last 12 000 characters of a long reply, the conclusion included", () => {
    const reply = "a".repeat(5_000) + "b".repeat(MAX_REPLY_CHARS_IN_ANSWER_PROMPT - 10) + "CONCLUSION";
    const p = buildAnswerPrompt(reply, []);
    ok(p.includes("[earlier text cut]\n"));
    ok(p.endsWith("CONCLUSION"));
    strictEqual(p.split("[earlier text cut]\n")[1], reply.slice(-MAX_REPLY_CHARS_IN_ANSWER_PROMPT));
    ok(!p.includes("aab"), "nothing before the kept tail");
  });

  it("does not cut a reply that fits", () => {
    ok(!buildAnswerPrompt("x".repeat(MAX_REPLY_CHARS_IN_ANSWER_PROMPT), []).includes("[earlier text cut]"));
  });
});
