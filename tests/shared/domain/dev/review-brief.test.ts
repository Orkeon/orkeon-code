// The reviewer's brief and answer prompt, assembled: the material kept in the brief, the brief under the sub-agent
// cap, the reply cut keeping its end. The sample is written here, never borrowed from the prompt catalogue. Run:
//   node --test tests/shared/domain/dev/review-brief.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { MAX_REVIEW_REPLY_CHARS, buildReviewAnswerPrompt, buildReviewBrief } from "../../../../src/shared/domain/dev/review-brief.ts";
import { MAX_BRIEF_CHARS } from "../../../../src/shared/domain/agents/charter.ts";
import { PROJECT_FILES_HEADING } from "../../../../src/shared/domain/dev/prompts/brief-blocks.ts";
import { assertBefore, assertMentions, assertOmits } from "../../../support/assertions/text.ts";
import { assertNoMarker } from "./review-brief.assertions.ts";
import {
  ANSWER_ASKS, BARE_INPUT, CARRIED_PIECES, CARRYING_INPUT, INPUT, MARK, NEXT_BATCH_INPUT, OVERFULL_INPUT, PLAN_BRIEF,
  PLAN_PAST_THE_ROOM, PROBLEM, REVIEW, SPEC_INPUT, TARGETS, promptMarkers,
} from "./review-brief.fixtures.ts";

describe("buildReviewBrief — the material", () => {
  it("the brief holds the mark", () => {
    // Arrange
    const input = INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.includes(MARK));
  });

  it("no prompt marker in the brief", () => {
    // Arrange
    const markers = promptMarkers();

    // Act
    const brief = buildReviewBrief(INPUT);

    // Assert
    assertNoMarker(brief, markers, "brief");
  });

  it("the brief stays under MAX_BRIEF_CHARS", () => {
    // Arrange
    const input = INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.length < MAX_BRIEF_CHARS, String(brief.length));
  });
});

describe("buildReviewBrief", () => {
  it("lists the project's files before the targets line", () => {
    // Arrange
    const input = { ...INPUT, projectFiles: ["src/math.js", "src/stats.js"] };

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    assertBefore(brief, PROJECT_FILES_HEADING, "A row targets one of:");
    assertMentions(brief, ["- src/math.js", "- src/stats.js"]);
  });

  it("lists no project files when none are given", () => {
    // Arrange
    const input = INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    assertOmits(brief, [PROJECT_FILES_HEADING]);
  });

  it("lays the mode, the files in order, the source, the inventory and the targets", () => {
    // Arrange
    const input = INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    strictEqual(brief, PLAN_BRIEF);
  });

  it("says when the inventory is empty", () => {
    // Arrange
    const input = { ...INPUT, inventory: "" };

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.includes("(I<n> refs):\n(no entry)\n"));
  });
});

describe("buildReviewAnswerPrompt", () => {
  it("asks for the rows as written, then the review", () => {
    // Arrange
    const review = REVIEW;

    // Act
    const prompt = buildReviewAnswerPrompt(review, [], TARGETS);

    // Assert
    assertMentions(prompt, ANSWER_ASKS);
    ok(!prompt.includes("refused"));
    ok(prompt.endsWith(`The review:\n\n${REVIEW}`));
  });

  it("names the targets the id alone may be", () => {
    // Arrange
    const targets = ["spec", "UC-01"];

    // Act
    const prompt = buildReviewAnswerPrompt(REVIEW, [], targets);

    // Assert
    ok(prompt.includes("its target is the id alone, one of\nspec, UC-01 (never the id with a qualifier"), prompt);
  });

  it("lists the problems of a refused answer before the review", () => {
    // Arrange
    const problems = [PROBLEM];

    // Act
    const prompt = buildReviewAnswerPrompt(`GAPS. ${MARK}`, problems, TARGETS);

    // Assert
    const problem = prompt.indexOf(`- ${PROBLEM}`);
    ok(problem > 0);
    ok(problem < prompt.indexOf("The review:"));
    ok(prompt.indexOf(MARK) > prompt.indexOf("The review:"));
  });

  it("keeps the last 12 000 characters of a longer reply", () => {
    // Arrange
    const reply = `HEAD${"x".repeat(MAX_REVIEW_REPLY_CHARS)}TAIL`;

    // Act
    const prompt = buildReviewAnswerPrompt(reply, [], TARGETS);

    // Assert
    strictEqual(MAX_REVIEW_REPLY_CHARS, 12_000);
    ok(!prompt.includes("HEAD"));
    ok(prompt.endsWith(`[earlier text cut]\n${reply.slice(-MAX_REVIEW_REPLY_CHARS)}`));
  });

  it("keeps a reply of 12 000 characters whole", () => {
    // Arrange
    const reply = "x".repeat(MAX_REVIEW_REPLY_CHARS);

    // Act
    const prompt = buildReviewAnswerPrompt(reply, [], TARGETS);

    // Assert
    ok(!prompt.includes("[earlier text cut]"));
  });
});

describe("buildReviewBrief — spec and change modes", () => {
  it("names the origin and the index's rows in a spec's brief", () => {
    // Arrange
    const input = SPEC_INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.startsWith("mode: spec workbench/prune/"));
    assertMentions(brief, [
      "Origin of the request: docs/brief.md",
      "What the code index found for the request (path:line):\n- src/memory.ts:12 — prune",
    ]);
    ok(brief.endsWith("A row targets one of: spec, UC-01."));
  });

  it("names no origin in a change's brief without a source", () => {
    // Arrange
    const input = { ...INPUT, mode: "change" as const, source: "" };

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(!brief.includes("Origin of the request"));
  });
});

describe("buildReviewBrief — next-batch mode (/dev-batches)", () => {
  it("names the plan and the closed batches in the brief", () => {
    // Arrange
    const input = NEXT_BATCH_INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.startsWith("mode: next-batch workbench/prune/"));
    assertMentions(brief, [
      "The plan: workbench/prune/PRUNE-PLAN.md",
      `The batches closed before it, with their commits and files:\nF1 a1b2c3d: src/a.ts — ${MARK}`,
    ]);
  });

  it("carries the sheet and what each closed batch changed", () => {
    // Arrange
    const input = CARRYING_INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    assertMentions(brief, CARRIED_PIECES);
    ok(brief.length < MAX_BRIEF_CHARS);
  });

  it("sends the reviewer to the files when the brief carries nothing", () => {
    // Arrange
    const input = BARE_INPUT;

    // Act
    const bare = buildReviewBrief(input);

    // Assert
    ok(!bare.includes("In this brief") && bare.includes("(read each by section, a heading at a time)") && bare.includes("The plan: w/X-PLAN.md\n"), bare);
  });

  it("keeps a next-batch brief under MAX_BRIEF_CHARS whatever it carries", () => {
    // Arrange
    const input = OVERFULL_INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.length < MAX_BRIEF_CHARS, String(brief.length));
    ok(brief.includes("more characters)"));
    ok(brief.includes("Not carried (no room left): diff F3."));
  });
});

describe("buildReviewBrief — what it says is in the brief", () => {
  it("never says the plan is in the brief when no room was left for it", () => {
    // Arrange
    const input = PLAN_PAST_THE_ROOM;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.includes("The plan: workbench/prune/PRUNE-PLAN.md\n"), brief.slice(0, 600));
  });
});
