// The planner's prompt: each behaviour pinned by one marker, the design rules listed, the
// material after the instructions, the re-ask with its problems before the material, the
// cap and its cut order, and no host vocabulary. Run:
//   node --test src/crews/dev-plan/application/plan-prompt.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { DESIGN_RULE_IDS } from "../../../../src/shared/domain/dev/design-rules.ts";
import { MAX_PLAN_PROMPT_CHARS, PLAN_INSTRUCTIONS, SOURCE_CHARS, buildPlanPrompt } from "../../../../src/crews/dev-plan/application/plan-prompt.ts";
import { BRIEF, INPUT, INVENTORY_200, MARK, PLAN_MARKERS, SIXTY_ONE_PROBLEMS, hostVocabulary } from "./plan-prompt.fixtures.ts";
import { assertDesignRuleLines, assertNoHostWord } from "./plan-prompt.assertions.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";

describe("PLAN_INSTRUCTIONS — one marker per behaviour", () => {
  for (const [behaviour, marker] of PLAN_MARKERS) {
    it(behaviour, () => {
      // Arrange
      const instructions = PLAN_INSTRUCTIONS;

      // Act
      const text = instructions.toLowerCase();

      // Assert
      ok(text.includes(marker.toLowerCase()), marker);
    });
  }

  it("names no word of the host's vocabulary in the prompt of a spec", () => {
    // Arrange
    const vocabulary = hostVocabulary();

    // Act
    const text = buildPlanPrompt(INPUT, []);

    // Assert
    assertNoHostWord(text, vocabulary);
  });

  it("names no word of the host's vocabulary in the re-ask of a change brief", () => {
    // Arrange
    const vocabulary = hostVocabulary();

    // Act
    const text = buildPlanPrompt(BRIEF, ["B1 S1: no test"]);

    // Assert
    assertNoHostWord(text, vocabulary);
  });
});

describe("buildPlanPrompt", () => {
  it("starts with the instructions, then one line per design rule, then the material", () => {
    // Arrange
    const input = INPUT;

    // Act
    const text = buildPlanPrompt(input, []);

    // Assert
    ok(text.startsWith(PLAN_INSTRUCTIONS));
    assertDesignRuleLines(text, DESIGN_RULE_IDS);
    const rules = text.indexOf("Design rules to classify");
    const source = text.indexOf("Source (spec): workbench/prune/SPEC-prune.md");
    ok(rules > PLAN_INSTRUCTIONS.length && source > rules);
    ok(text.indexOf(MARK) > source, "the source text is material");
    assertMentions(text, [
      "UC-01 — Prune old memory entries: the user removes old entries",
      "\nBR-01 — An entry older than the cut-off is removed\n",
      "Repository commands: build `npm run build`",
      "Inventory (anchor refs I<n>):\nI1 · src/shared/domain/memory.ts:18",
    ]);
    assertOmits(text, ["Pinned tests:", "previous answer was refused"]);
  });

  it("gives a brief its kind, its pinned tests and its rows to characterise", () => {
    // Arrange
    const input = BRIEF;

    // Act
    const text = buildPlanPrompt(input, []);

    // Assert
    assertMentions(text, [
      "Source (change, refactor): workbench/cache/CHANGE-cache.md",
      "Pinned tests:\n- loads the cached map once",
      "Rows to characterise first:\nU1 — an absent map file gives an empty map",
    ]);
  });

  it("lists the problems of a re-ask before the material, 60 at most", () => {
    // Arrange
    const problems = SIXTY_ONE_PROBLEMS;

    // Act
    const text = buildPlanPrompt(INPUT, problems);

    // Assert
    const asked = text.indexOf("Your previous answer was refused; fix each of these:");
    ok(asked > text.indexOf("Design rules to classify"));
    ok(asked < text.indexOf("Source (spec)"));
    assertMentions(text, ["- B1 S1: problem 60\n- … 1 more"]);
    assertOmits(text, ["problem 61"]);
  });

  it("cuts the source text to SOURCE_CHARS, head kept", () => {
    // Arrange
    const input = { ...INPUT, sourceText: `HEAD${"x".repeat(SOURCE_CHARS)}TAIL` };

    // Act
    const text = buildPlanPrompt(input, []);

    // Assert
    assertMentions(text, ["HEAD", "[the rest of the source is cut]"]);
    assertOmits(text, ["TAIL"]);
  });

  it("over the cap, cuts the source first, the inventory kept whole", () => {
    // Arrange
    const input = { ...INPUT, inventory: INVENTORY_200.split("\n").slice(0, 150).join("\n"), sourceText: "s".repeat(SOURCE_CHARS) };

    // Act
    const big = buildPlanPrompt(input, []);

    // Assert
    ok(big.length <= MAX_PLAN_PROMPT_CHARS, `${big.length}`);
    ok(big.includes("\nI150 · "), "the inventory is whole while the source can give way");
  });

  it("over the cap, cuts inventory lines from the end once the source is gone", () => {
    // Arrange
    const input = { ...INPUT, inventory: `${INVENTORY_200}\n${INVENTORY_200.replace(/I(\d+)/g, "J$1")}`, sourceText: "s".repeat(SOURCE_CHARS) };

    // Act
    const huge = buildPlanPrompt(input, []);

    // Assert
    ok(huge.length <= MAX_PLAN_PROMPT_CHARS, `${huge.length}`);
    ok(huge.includes("\nI1 · ") && !huge.includes("J200 · "), "lines leave from the end");
    ok(!huge.includes("sss"), "the source went first");
  });

  it("stays the same text for the same input", () => {
    // Arrange
    const first = buildPlanPrompt(INPUT, []);

    // Act
    const second = buildPlanPrompt(INPUT, []);

    // Assert
    strictEqual(second, first);
  });
});
