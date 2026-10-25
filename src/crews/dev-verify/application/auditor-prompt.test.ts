// The auditor's prompts: each behaviour of the specification pinned by one marker,
// the material kept out of the system message, the reply cut keeping its end. Run:
//   node --test src/crews/dev-verify/application/auditor-prompt.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import {
  AUDITOR_SYSTEM, INLINE_CAPTURE_CHARS, INLINE_SHEET_CHARS, buildAnswerPrompt, buildAuditBrief, buildValidationFollowUp,
} from "./auditor-prompt.ts";
import { MAX_BRIEF_CHARS } from "../../../shared/domain/agents/charter.ts";
import {
  CAPTURE_DIR, FIRST, FIVE_CAPTURE_FILES, HOST_WORDS, LONG_TABLE, MATERIAL, MAX_REPLY_CHARS_IN_ANSWER_PROMPT, PREVIOUS_GAP,
  SHORT_SHEET, SUITE, SYSTEM_MARKERS, TABLE, bigBriefInput, briefInput, largestAnswer, longReports,
} from "./auditor-prompt.fixtures.ts";
import { assertMentions, assertOmits, assertWithinBrief } from "./auditor-prompt.assertions.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("AUDITOR_SYSTEM — one marker per behaviour", () => {
  for (const [behaviour, marker] of SYSTEM_MARKERS) {
    it(behaviour, () => {
      // Arrange
      const system = AUDITOR_SYSTEM;

      // Act
      const holds = system.includes(marker);

      // Assert
      ok(holds, marker);
    });
  }

  it("says the Conventions row is always the auditor's", () => {
    // Arrange
    const system = AUDITOR_SYSTEM;

    // Act
    const holds = system.includes("Conventions row");

    // Assert
    ok(holds);
  });

  it("speaks no host vocabulary", () => {
    // Arrange
    const words = HOST_WORDS;

    // Act
    const system = AUDITOR_SYSTEM;

    // Assert
    assertOmits(system, words);
  });

  it("holds none of the material", () => {
    // Arrange
    const material = MATERIAL;

    // Act
    const system = AUDITOR_SYSTEM;

    // Assert
    assertOmits(system, material);
  });

  it("leaves the material to the brief", () => {
    // Arrange
    const input = briefInput();

    // Act
    const brief = buildAuditBrief(input);

    // Assert
    assertMentions(brief, MATERIAL);
  });
});

describe("buildAuditBrief", () => {
  it("holds the table, every capture path, the mode, the batch and the commands", () => {
    // Arrange
    const input = briefInput();

    // Act
    const brief = buildAuditBrief(input);

    // Assert
    assertMentions(brief, [
      TABLE, ...input.captureFiles, "batch F2, mode fast", "test class: dotnet test --filter FullyQualifiedName~<class>",
      "test project: none", "integration tests: none", "Applied rules: DDD-01, APP-02",
    ]);
  });

  it("carries the capture's texts and lists none of them to read when every one fits", () => {
    // Arrange
    const input = briefInput({
      captureFiles: FIVE_CAPTURE_FILES,
      captureTexts: [
        { path: `${CAPTURE_DIR}/diff-001.txt`, text: "+public class Order {}\n" }, { path: `${CAPTURE_DIR}/build.txt`, text: "build ok\n" },
      ],
    });

    // Act
    const brief = buildAuditBrief(input);

    // Assert
    assertMentions(brief, ["### diff-001.txt\n```text\n+public class Order {}\n```", "### build.txt"]);
    assertOmits(brief, ["to read", `${CAPTURE_DIR}/index.txt`]);
  });

  it("carries the sheet before the capture while it fits", () => {
    // Arrange
    const input = briefInput({ sheetText: SHORT_SHEET });

    // Act
    const brief = buildAuditBrief(input);

    // Assert
    assertMentions(brief, [
      `Sheet: ${WORKSPACE}/workbench/demo/DEMO-PLAN-F2.md\n`,
      "\nThe sheet, in this brief (do not open it again):\n```text\n# DEMO-PLAN-F2 — Command\n\n## Intent\nthe command\n```\n",
    ]);
    ok(brief.indexOf("The sheet, in this brief") < brief.indexOf("The mechanical table"));
  });

  it("leaves a longer sheet to read from its path", () => {
    // Arrange
    const input = briefInput({ sheetText: "#".repeat(INLINE_SHEET_CHARS + 1) });

    // Act
    const brief = buildAuditBrief(input);

    // Assert
    assertOmits(brief, ["The sheet, in this brief"]);
  });

  it("carries no sheet when none is given", () => {
    // Arrange
    const input = briefInput();

    // Act
    const brief = buildAuditBrief(input);

    // Assert
    assertOmits(brief, ["The sheet, in this brief"]);
  });

  it("carries a sheet and a capture text that both fit, within MAX_BRIEF_CHARS", () => {
    // Arrange
    const input = briefInput({
      sheetText: "s".repeat(INLINE_SHEET_CHARS), captureFiles: [`${CAPTURE_DIR}/index.txt`, `${CAPTURE_DIR}/diff-001.txt`],
      captureTexts: [{ path: `${CAPTURE_DIR}/diff-001.txt`, text: "+".repeat(INLINE_CAPTURE_CHARS - 100) }],
    });

    // Act
    const both = buildAuditBrief(input);

    // Assert
    assertMentions(both, ["The sheet, in this brief", "### diff-001.txt"]);
    assertWithinBrief(both);
  });

  it("lists a capture file past the brief's room to read, with the index", () => {
    // Arrange
    const input = briefInput({
      captureFiles: FIVE_CAPTURE_FILES,
      captureTexts: [
        { path: `${CAPTURE_DIR}/diff-001.txt`, text: "+".repeat(INLINE_CAPTURE_CHARS) }, { path: `${CAPTURE_DIR}/build.txt`, text: "build ok" },
      ],
    });

    // Act
    const brief = buildAuditBrief(input);

    // Assert
    assertMentions(brief, [
      "### build.txt",
      `Capture files left to read, one at a time:\n- ${CAPTURE_DIR}/index.txt\n- ${CAPTURE_DIR}/manifest.txt\n- ${CAPTURE_DIR}/diff-001.txt\n- ${CAPTURE_DIR}/table.md`,
    ]);
    assertOmits(brief, ["### diff-001.txt"]);
  });

  it("lists a capture file to read when a long table leaves no room, within MAX_BRIEF_CHARS", () => {
    // Arrange
    const input = briefInput({
      table: LONG_TABLE,
      captureFiles: [`${CAPTURE_DIR}/index.txt`, `${CAPTURE_DIR}/diff-001.txt`],
      captureTexts: [{ path: `${CAPTURE_DIR}/diff-001.txt`, text: "+".repeat(8_000) }],
    });

    // Act
    const full = buildAuditBrief(input);

    // Assert
    assertWithinBrief(full);
    assertMentions(full, [`- ${CAPTURE_DIR}/diff-001.txt`]);
  });

  for (const mode of ["fast", "full"] as const) {
    it(`names previous gaps only under resume: none in ${mode}`, () => {
      // Arrange
      const input = briefInput({ mode });

      // Act
      const brief = buildAuditBrief(input);

      // Assert
      assertOmits(brief, ["previous gaps"]);
    });
  }

  it("names previous gaps only under resume: the gaps under resume", () => {
    // Arrange
    const input = briefInput({ mode: "resume", previousGaps: [PREVIOUS_GAP] });

    // Act
    const resume = buildAuditBrief(input);

    // Assert
    assertMentions(resume, ["the previous gaps and what changed since", "Parses dates by hand", "src/a/Clock.cs:12"]);
  });

  it("carries no whole suite's run when none is given", () => {
    // Arrange
    const input = briefInput({ mode: "full" });

    // Act
    const brief = buildAuditBrief(input);

    // Assert
    assertOmits(brief, ["whole fast suite"]);
  });

  it("carries the whole suite's run as one more section only when it is given", () => {
    // Arrange
    const input = briefInput({ mode: "full", suite: SUITE });

    // Act
    const full = buildAuditBrief(input);

    // Assert
    assertMentions(full, [
      "The whole fast suite, as code ran it before this audit:", "- command: npm test", "- outcome: exit 1", "ℹ fail 2",
    ]);
  });
});

describe("buildValidationFollowUp", () => {
  it("repeats the brief without the table and the capture index, then the first answer and each report", () => {
    // Arrange
    const reports = [{ command: FIRST.validations[0], outcome: "exit 1", tail: "Failed ShouldDeposit_WhenAmountIsPositive" }];

    // Act
    const p = buildValidationFollowUp(briefInput(), FIRST, reports);

    // Assert
    ok(p.startsWith("Audit of batch F2, mode fast."), p);
    assertMentions(p, [
      "Applied rules: DDD-01, APP-02", `in ${WORKSPACE}/workbench/demo/capture-F2/: reopen them there when needed`,
      "- verdict: VALID", `- validations named: ${FIRST.validations[0]}`, "Outcome: exit 1",
      "Failed ShouldDeposit_WhenAmountIsPositive", "this answer is final",
    ]);
    assertOmits(p, [TABLE, `${WORKSPACE}/workbench/demo/capture-F2/diff-001.txt`]);
  });

  it("starts from a first brief near the limit", () => {
    // Arrange
    const big = bigBriefInput();

    // Act
    const brief = buildAuditBrief(big);

    // Assert
    ok(brief.length > MAX_BRIEF_CHARS * 0.9, String(brief.length));
  });

  it("stays under MAX_BRIEF_CHARS after a first brief near the limit and the largest first answer", () => {
    // Arrange
    const answer = largestAnswer();
    const reports = longReports(answer);

    // Act
    const p = buildValidationFollowUp(bigBriefInput(), answer, reports);

    // Assert
    assertWithinBrief(p);
    assertMentions(p, ["gap 0 ", "this answer is final"]);
  });
});

describe("buildAnswerPrompt", () => {
  it("asks to invent nothing, and carries the reply", () => {
    // Arrange
    const reply = "Verdict VALID, no row.";

    // Act
    const p = buildAnswerPrompt(reply, []);

    // Assert
    assertMentions(p, ["invent nothing"]);
    ok(p.endsWith("Verdict VALID, no row."));
    assertOmits(p, ["refused"]);
  });

  it("lists each problem to fix when given", () => {
    // Arrange
    const problems = ["row 1: evidence cites no path:line", "verdict must be VALID or GAPS"];

    // Act
    const p = buildAnswerPrompt("reply", problems);

    // Assert
    assertMentions(p, ["- row 1: evidence cites no path:line", "- verdict must be VALID or GAPS"]);
  });

  it("keeps the last 12 000 characters of a long reply, the conclusion included", () => {
    // Arrange
    const reply = "a".repeat(5_000) + "b".repeat(MAX_REPLY_CHARS_IN_ANSWER_PROMPT - 10) + "CONCLUSION";

    // Act
    const p = buildAnswerPrompt(reply, []);

    // Assert
    assertMentions(p, ["[earlier text cut]\n"]);
    ok(p.endsWith("CONCLUSION"));
    strictEqual(p.split("[earlier text cut]\n")[1], reply.slice(-MAX_REPLY_CHARS_IN_ANSWER_PROMPT));
    ok(!p.includes("aab"), "nothing before the kept tail");
  });

  it("does not cut a reply that fits", () => {
    // Arrange
    const reply = "x".repeat(MAX_REPLY_CHARS_IN_ANSWER_PROMPT);

    // Act
    const p = buildAnswerPrompt(reply, []);

    // Assert
    assertOmits(p, ["[earlier text cut]"]);
  });
});
