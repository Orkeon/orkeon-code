// The reviewer's prompts: each behaviour of the system message pinned by one
// marker, the material kept in the brief alone, the brief under the sub-agent cap,
// the reply cut keeping its end. The sample is written here, never borrowed from
// the prompt catalogue or the fixtures. Run:
//   node --test tests/shared/domain/dev/prompts.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { MAX_REVIEW_REPLY_CHARS, buildReviewAnswerPrompt, buildReviewBrief, reviewSystem } from "../../../../src/shared/domain/dev/prompts.ts";
import { MAX_BRIEF_CHARS } from "../../../../src/shared/domain/agents/charter.ts";
import { PROJECT_FILES_HEADING } from "../../../../src/shared/domain/dev/prompts/brief-blocks.ts";
import { BOUNDED_READ_RULE, NODE_READ_RULE } from "../../../../src/shared/domain/dev/reading-rule.ts";
import { assertBefore, assertMentions, assertOmits } from "../../../support/assertions/text.ts";
import { assertHolds, assertLacks, assertNoMarker } from "./prompts.assertions.ts";
import {
  ANSWER_ASKS, BARE_INPUT, BRIEF_PIECES, CARRIED_PIECES, CARRYING_INPUT, INPUT, MARK, MODE_FOCUS, NEXT_BATCH_ABSENT_TOOLS,
  NEXT_BATCH_FOCUS,
  NEXT_BATCH_INPUT, OVERFULL_INPUT, PLAN_BRIEF, PLAN_PAST_THE_ROOM, PROBLEM, REVIEW, SETTLED_PIECES, SPEC_INPUT,
  SYSTEM_MARKERS, TARGETS, promptMarkers,
  ALL_MODES, CODE_ANSWERED_ASKS, GLOB_LOOKUP, LOOKUP_MODES, MATERIAL_OF_THE_BRIEF, SYMBOL_SOURCE_LOOKUP, CODE_CHECKED_ANCHORS, LISTED_MODES, PROJECT_LIST_MARKER, REPEATED_WHOLE_FILE_BAN,
  SECOND_TIE_CONDITION, SETTLED_BY_MATERIAL, TIE_RULE, UNCHECKED_ANCHOR_ASKS,
} from "./prompts.fixtures.ts";

describe("reviewSystem(\"plan\") — one marker per behaviour", () => {
  for (const [behaviour, marker] of SYSTEM_MARKERS) {
    it(behaviour, () => {
      // Arrange
      const mode = "plan";

      // Act
      const system = reviewSystem(mode);

      // Assert
      ok(system.includes(marker), marker);
    });
  }

  it("defines both weights", () => {
    // Arrange
    const mode = "plan";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertHolds(system, ["- Blocking:", "- Major:"], "the plan system");
  });
});

describe("material and markers", () => {
  it("the brief holds the mark", () => {
    // Arrange
    const input = INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.includes(MARK));
  });

  it("the system does not hold the mark, nor the brief's files and inventory", () => {
    // Arrange
    const mode = "plan";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertLacks(system, BRIEF_PIECES, "the plan system");
  });

  it("no prompt marker in the system", () => {
    // Arrange
    const markers = promptMarkers();

    // Act
    const system = reviewSystem("plan");

    // Assert
    assertNoMarker(system, markers, "system");
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
    assertHolds(prompt, ANSWER_ASKS, "the answer prompt");
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

describe("reviewSystem and buildReviewBrief — spec and change modes", () => {
  for (const c of MODE_FOCUS) {
    it(`gives each mode its focus and its targets, the plan's text unchanged: ${c.mode}`, () => {
      // Arrange
      const { mode } = c;

      // Act
      const system = reviewSystem(mode);

      // Assert
      assertHolds(system, c.holds, `the ${mode} system`);
      assertLacks(system, c.lacks, `the ${mode} system`);
    });
  }

  it("names the origin and the index's rows in a spec's brief", () => {
    // Arrange
    const input = SPEC_INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.startsWith("mode: spec workbench/prune/"));
    assertHolds(brief, [
      "Origin of the request: docs/brief.md",
      "What the code index found for the request (path:line):\n- src/memory.ts:12 — prune",
    ], "the spec brief");
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

describe("reviewSystem and buildReviewBrief — next-batch mode (/dev-batches)", () => {
  it("gives the next batch its focus on the closed batches, the plan's focus left out", () => {
    // Arrange
    const mode = "next-batch";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertHolds(system, NEXT_BATCH_FOCUS, "the next-batch system");
    ok(!system.includes("For a plan, ask in particular:"));
  });

  it("routes the next-batch reviewer to none of the tools its charter lacks", () => {
    // Arrange
    const mode = "next-batch";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertOmits(system, NEXT_BATCH_ABSENT_TOOLS);
  });

  it("names the plan and the closed batches in the brief", () => {
    // Arrange
    const input = NEXT_BATCH_INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    ok(brief.startsWith("mode: next-batch workbench/prune/"));
    assertHolds(brief, [
      "The plan: workbench/prune/PRUNE-PLAN.md",
      `The batches closed before it, with their commits and files:\nF1 a1b2c3d: src/a.ts — ${MARK}`,
    ], "the next-batch brief");
  });

  it("keeps the closed batches' material out of the next-batch system", () => {
    // Arrange
    const mode = "next-batch";

    // Act
    const system = reviewSystem(mode);

    // Assert
    ok(!system.includes(MARK));
  });

  it("carries the sheet and what each closed batch changed", () => {
    // Arrange
    const input = CARRYING_INPUT;

    // Act
    const brief = buildReviewBrief(input);

    // Assert
    assertHolds(brief, CARRIED_PIECES, brief);
    ok(brief.length < MAX_BRIEF_CHARS);
  });

  it("says the recorded decisions are settled", () => {
    // Arrange
    const mode = "next-batch";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertHolds(system, SETTLED_PIECES, "the next-batch system");
  });

  it("says no decision is settled in the plan's system", () => {
    // Arrange
    const mode = "plan";

    // Act
    const system = reviewSystem(mode);

    // Assert
    ok(!system.includes("are settled"));
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

describe("reviewSystem — what it asks and how it reads, in every mode", () => {
  for (const mode of ALL_MODES) {
    it(`asks no question the rest of the material already settles: ${mode}`, () => {
      // Arrange
      const marker = SETTLED_BY_MATERIAL;

      // Act
      const system = reviewSystem(mode);

      // Assert
      assertMentions(system, [marker]);
    });
  }

  for (const mode of ALL_MODES) {
    it(`weighs a hesitation as Major in one condition: ${mode}`, () => {
      // Arrange
      const rule = TIE_RULE;

      // Act
      const system = reviewSystem(mode);

      // Assert
      assertMentions(system, [rule]);
      assertOmits(system, [SECOND_TIE_CONDITION]);
    });
  }

  for (const mode of ALL_MODES) {
    it(`reads a source file by node, then by bounded range: ${mode}`, () => {
      // Arrange
      const first = NODE_READ_RULE;

      // Act
      const system = reviewSystem(mode);

      // Assert
      assertBefore(system, first, BOUNDED_READ_RULE);
    });
  }

  for (const mode of ALL_MODES) {
    it(`leaves the whole-file ban to the shared reading rules: ${mode}`, () => {
      // Arrange
      const repeated = REPEATED_WHOLE_FILE_BAN;

      // Act
      const system = reviewSystem(mode);

      // Assert
      assertOmits(system, [repeated]);
    });
  }

  for (const c of LISTED_MODES) {
    it(`speaks of the project list only when its brief carries one: ${c.mode}`, () => {
      // Arrange
      const { mode, listed } = c;

      // Act
      const system = reviewSystem(mode);

      // Assert
      strictEqual(system.includes(PROJECT_LIST_MARKER), listed, `the ${mode} system`);
    });
  }
});

describe("reviewSystem — the lookups the routing leaves unsaid", () => {
  for (const c of LOOKUP_MODES) {
    it(`names symbol_source for a search hit only to a charter holding it: ${c.mode}`, () => {
      // Arrange
      const { mode, symbolSource } = c;

      // Act
      const system = reviewSystem(mode);

      // Assert
      strictEqual(system.includes(SYMBOL_SOURCE_LOOKUP), symbolSource, `the ${mode} system`);
    });
  }

  for (const c of LOOKUP_MODES) {
    it(`names glob for a file by its name once, the project list aside: ${c.mode}`, () => {
      // Arrange
      const { mode, glob } = c;

      // Act
      const system = reviewSystem(mode);

      // Assert
      strictEqual(system.includes(GLOB_LOOKUP), glob, `the ${mode} system`);
    });
  }

  for (const mode of ALL_MODES) {
    it(`looks for an answer in the other files of the brief: ${mode}`, () => {
      // Arrange
      const marker = MATERIAL_OF_THE_BRIEF;

      // Act
      const system = reviewSystem(mode);

      // Assert
      assertMentions(system, [marker]);
    });
  }

  it("names no inventory in the next-batch system, whose brief carries none", () => {
    // Arrange
    const mode = "next-batch";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertOmits(system, ["inventory"]);
  });
});

describe("reviewSystem(\"plan\") — what code checked before the review", () => {
  it("says code already checked the anchored paths and the order of batches sharing an anchor", () => {
    // Arrange
    const mode = "plan";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertMentions(system, [CODE_CHECKED_ANCHORS]);
  });

  it("asks again none of what code answered, nor an access cost no tool of it measures", () => {
    // Arrange
    const mode = "plan";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertOmits(system, CODE_ANSWERED_ASKS);
  });

  it("keeps asking what no check of code sees", () => {
    // Arrange
    const mode = "plan";

    // Act
    const system = reviewSystem(mode);

    // Assert
    assertMentions(system, UNCHECKED_ANCHOR_ASKS);
  });
});
