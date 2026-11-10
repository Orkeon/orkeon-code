// The reviewer's system message: each behaviour pinned by one marker, no material
// in it (the brief and the answer prompt: review-brief.test.ts). The sample is written here, never borrowed from
// the prompt catalogue or the fixtures. Run:
//   node --test tests/shared/domain/dev/prompts.test.ts
import { describe, it } from "node:test";
import { ok, strictEqual } from "node:assert";

import { reviewSystem } from "../../../../src/shared/domain/dev/prompts.ts";
import { BOUNDED_READ_RULE, NODE_READ_RULE } from "../../../../src/shared/domain/dev/reading-rule.ts";
import { assertBefore, assertMentions, assertOmits } from "../../../support/assertions/text.ts";
import { assertHolds, assertLacks, assertNoMarker } from "./prompts.assertions.ts";
import {
  BRIEF_PIECES, MARK, MODE_FOCUS, NEXT_BATCH_ABSENT_TOOLS, NEXT_BATCH_FOCUS, SETTLED_PIECES, SYSTEM_MARKERS, promptMarkers,
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
});

describe("reviewSystem — spec and change modes", () => {
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
});

describe("reviewSystem — next-batch mode (/dev-batches)", () => {
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

  it("keeps the closed batches' material out of the next-batch system", () => {
    // Arrange
    const mode = "next-batch";

    // Act
    const system = reviewSystem(mode);

    // Assert
    ok(!system.includes(MARK));
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
