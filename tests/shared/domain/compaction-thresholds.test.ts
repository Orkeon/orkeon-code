// Compaction thresholds: each number is pinned together with the fact it is derived
// from, so changing the fact without the number (or the reverse) fails here.
// Run: node --test tests/shared/domain/compaction-thresholds.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual, ok } from "node:assert";
import {
  ANSWER_RESERVE_TOKENS,
  AUTOCOMPACT_BUFFER_TOKENS,
  CHARS_PER_TOKEN,
  DEFAULT_CONTEXT_WINDOW,
  ERROR_THRESHOLD_BUFFER_TOKENS,
  FILE_READ_CUT_TOKENS,
  MAX_CONSECUTIVE_FAILURES,
  POST_COMPACT_MAX_FILES_TO_RESTORE,
  POST_COMPACT_PER_FILE_TOKENS,
  POST_COMPACT_TOKEN_BUDGET,
  SNIP_RETAIN_COUNT,
  TRANSCRIPT_CAP_CHARS,
  TURN_FIXED_TOKENS,
  WARNING_THRESHOLD_BUFFER_TOKENS,
  computeTrigger,
  compactionTriggerProblem,
  parseTokenCount,
  isAboveErrorThreshold,
  isAboveWarningThreshold,
  percentLeft,
  pressureTier,
  shouldCompact,
  POST_COMPACT_SKILLS_TOKEN_BUDGET,
  POST_COMPACT_PER_SKILL_TOKENS,
} from "../../../src/shared/domain/compaction-thresholds.ts";
import {
  PERCENT_LEFT_CASES, SET_TRIGGER_CASES, THRESHOLD_CASES, TIER_CASES, TOKEN_COUNTS, TRIGGER_BOUNDARY, UNREPORTED_WINDOWS,
} from "./compaction-thresholds.fixtures.ts";

describe("the facts the thresholds are derived from", () => {
  it("a file_read result is cut at 32 000 characters, 8 000 tokens", () => {
    // Arrange
    const tokens = FILE_READ_CUT_TOKENS;

    // Act
    const chars = tokens * CHARS_PER_TOKEN;

    // Assert
    strictEqual(chars, 32_000);
  });

  it("an answer may reach the example settings' Llm:MaxTokens", () => {
    // Arrange
    const expected = 24_576;

    // Act
    const reserve = ANSWER_RESERVE_TOKENS;

    // Assert
    strictEqual(reserve, expected);
  });

  it("the compaction buffer is one turn's room: fixed parts, one cut read, a full answer", () => {
    // Arrange
    const turn = TURN_FIXED_TOKENS + FILE_READ_CUT_TOKENS + ANSWER_RESERVE_TOKENS;

    // Act
    const buffer = AUTOCOMPACT_BUFFER_TOKENS;

    // Assert
    strictEqual(buffer, turn);
    strictEqual(buffer, 36_576);
  });
});

describe("computeTrigger", () => {
  it("is window minus the buffer", () => {
    // Arrange
    const window = 180_000;

    // Act
    const trigger = computeTrigger(window);

    // Assert
    strictEqual(trigger, 180_000 - 36_576);
  });

  it("falls back to a default window of 128 000 tokens", () => {
    // Arrange
    const expected = 128_000;

    // Act
    const window = DEFAULT_CONTEXT_WINDOW;

    // Assert
    strictEqual(window, expected);
  });

  for (const window of UNREPORTED_WINDOWS) {
    it(`falls back to the default window when none is reported: ${window}`, () => {
      // Arrange
      const reported = window;

      // Act
      const trigger = computeTrigger(reported);

      // Assert
      strictEqual(trigger, DEFAULT_CONTEXT_WINDOW - AUTOCOMPACT_BUFFER_TOKENS);
    });
  }
});

describe("shouldCompact", () => {
  for (const c of TRIGGER_BOUNDARY) {
    it(`fires at the boundary (equality) and above, not below: ${c.name}`, () => {
      // Arrange
      const used = c.used(computeTrigger(180_000));

      // Act
      const fires = shouldCompact(used, 180_000);

      // Assert
      strictEqual(fires, c.fires);
    });
  }
});

describe("the other limits", () => {
  it("holds the breaker, transcript, snip and file-restore values", () => {
    // Arrange
    const expected = { breaker: 3, transcript: 48_000, snip: 5, filesToRestore: 5, perFile: 5_000 };

    // Act
    const limits = {
      breaker: MAX_CONSECUTIVE_FAILURES,
      transcript: TRANSCRIPT_CAP_CHARS,
      snip: SNIP_RETAIN_COUNT,
      filesToRestore: POST_COMPACT_MAX_FILES_TO_RESTORE,
      perFile: POST_COMPACT_PER_FILE_TOKENS,
    };

    // Assert
    deepStrictEqual(limits, expected);
  });

  it("restores a file whole only below file_read's own cut", () => {
    // Arrange
    const cut = FILE_READ_CUT_TOKENS;

    // Act
    const perFile = POST_COMPACT_PER_FILE_TOKENS;

    // Assert
    ok(perFile < cut);
  });

  it("bounds the file restore by construction: every file at its cap fits the budget", () => {
    // Arrange
    const everyFileAtItsCap = POST_COMPACT_MAX_FILES_TO_RESTORE * POST_COMPACT_PER_FILE_TOKENS;

    // Act
    const budget = POST_COMPACT_TOKEN_BUDGET;

    // Assert
    strictEqual(budget, everyFileAtItsCap);
  });
});

describe("pressure tiers", () => {
  it("warning fires when the room left is below the compaction buffer, error below one cut read", () => {
    // Arrange
    const expected = { warning: AUTOCOMPACT_BUFFER_TOKENS, error: FILE_READ_CUT_TOKENS };

    // Act
    const buffers = { warning: WARNING_THRESHOLD_BUFFER_TOKENS, error: ERROR_THRESHOLD_BUFFER_TOKENS };

    // Assert
    deepStrictEqual(buffers, expected);
  });

  for (const c of THRESHOLD_CASES) {
    it(c.name, () => {
      // Arrange
      const isAbove = c.tier === "warning" ? isAboveWarningThreshold : isAboveErrorThreshold;

      // Act
      const above = isAbove(c.used, c.window);

      // Assert
      strictEqual(above, c.above);
    });
  }

  for (const c of TIER_CASES) {
    it(`pressureTier ranks error > warning > ok: ${c.used} of 180 000 is ${c.tier}`, () => {
      // Arrange
      const { used } = c;

      // Act
      const tier = pressureTier(used, 180_000);

      // Assert
      strictEqual(tier, c.tier);
    });
  }

  for (const c of PERCENT_LEFT_CASES) {
    it(`percentLeft is clamped and rounded: ${c.name}`, () => {
      // Arrange
      const { used } = c;

      // Act
      const left = percentLeft(used, 180_000);

      // Assert
      strictEqual(left, c.left);
    });
  }
});

describe("post-compaction skills budget", () => {
  it("is five skills at their cap", () => {
    // Arrange
    const expectedPerSkill = 1_000;

    // Act
    const budget = { perSkill: POST_COMPACT_PER_SKILL_TOKENS, total: POST_COMPACT_SKILLS_TOKEN_BUDGET };

    // Assert
    strictEqual(budget.perSkill, expectedPerSkill);
    strictEqual(budget.total, 5 * POST_COMPACT_PER_SKILL_TOKENS);
  });

  it("is SEPARATE from the file-restore budget, not a share of it", () => {
    // Sharing one budget would let a handful of large files evict every playbook,
    // and the symptom would read as "the agent forgot the rules after a compaction".
    // Arrange
    const expected = { skills: 5_000, files: 25_000 };

    // Act
    const budgets = { skills: POST_COMPACT_SKILLS_TOKEN_BUDGET, files: POST_COMPACT_TOKEN_BUDGET };

    // Assert
    deepStrictEqual(budgets, expected);
  });

  it("caps one skill below the whole budget, so a single playbook cannot take it all", () => {
    // Arrange
    const budget = POST_COMPACT_SKILLS_TOKEN_BUDGET;

    // Act
    const perSkill = POST_COMPACT_PER_SKILL_TOKENS;

    // Assert
    ok(perSkill > 0);
    ok(perSkill < budget);
  });
});

describe("the compaction.trigger setting", () => {
  for (const c of TOKEN_COUNTS) {
    it(`reads a token count, with or without a k: ${JSON.stringify(c.value) ?? "undefined"}`, () => {
      // Arrange
      const { value } = c;

      // Act
      const count = parseTokenCount(value);

      // Assert
      strictEqual(count, c.count);
    });
  }

  it("accepts a token count, for /config set", () => {
    // Arrange
    const value = "90k";

    // Act
    const problem = compactionTriggerProblem(value);

    // Assert
    strictEqual(problem, undefined);
  });

  it("refuses a value that is not one, for /config set", () => {
    // Arrange
    const value = "soon";

    // Act
    const problem = compactionTriggerProblem(value);

    // Assert
    ok(problem?.includes("90k"), problem);
  });

  it("moves the trigger when given", () => {
    // Arrange
    const trigger = 90_000;

    // Act
    const moved = computeTrigger(180_000, trigger);

    // Assert
    strictEqual(moved, 90_000);
  });

  it("keeps the trigger at window minus the buffer when none is given", () => {
    // Arrange
    const trigger = undefined;

    // Act
    const kept = computeTrigger(180_000, trigger);

    // Assert
    strictEqual(kept, 180_000 - AUTOCOMPACT_BUFFER_TOKENS);
  });

  for (const c of SET_TRIGGER_CASES) {
    it(`compacts from the trigger given: ${c.used} ${c.fires ? "fires" : "does not fire"}`, () => {
      // Arrange
      const { used } = c;

      // Act
      const fires = shouldCompact(used, 180_000, 90_000);

      // Assert
      strictEqual(fires, c.fires);
    });
  }
});
