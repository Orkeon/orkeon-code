// Compaction thresholds: each number is pinned together with the fact it is derived
// from, so changing the fact without the number (or the reverse) fails here.
// Run: node --test src/shared/domain/compaction-thresholds.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";
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
} from "./compaction-thresholds.ts";

describe("the facts the thresholds are derived from", () => {
  it("a file_read result is cut at 32 000 characters, 8 000 tokens", () => {
    strictEqual(FILE_READ_CUT_TOKENS * CHARS_PER_TOKEN, 32_000);
  });
  it("an answer may reach the example settings' Llm:MaxTokens", () => {
    strictEqual(ANSWER_RESERVE_TOKENS, 24_576);
  });
  it("the compaction buffer is one turn's room: fixed parts, one cut read, a full answer", () => {
    strictEqual(AUTOCOMPACT_BUFFER_TOKENS, TURN_FIXED_TOKENS + FILE_READ_CUT_TOKENS + ANSWER_RESERVE_TOKENS);
    strictEqual(AUTOCOMPACT_BUFFER_TOKENS, 36_576);
  });
});

describe("computeTrigger", () => {
  it("is window minus the buffer", () => {
    strictEqual(computeTrigger(180_000), 180_000 - 36_576);
  });
  it("falls back to the default window when none is reported", () => {
    strictEqual(DEFAULT_CONTEXT_WINDOW, 128_000);
    strictEqual(computeTrigger(0), DEFAULT_CONTEXT_WINDOW - AUTOCOMPACT_BUFFER_TOKENS);
    strictEqual(computeTrigger(-1), DEFAULT_CONTEXT_WINDOW - AUTOCOMPACT_BUFFER_TOKENS);
  });
});

describe("shouldCompact", () => {
  it("fires at the boundary (equality) and above, not below", () => {
    const trigger = computeTrigger(180_000);
    strictEqual(shouldCompact(trigger - 1, 180_000), false);
    strictEqual(shouldCompact(trigger, 180_000), true);
    strictEqual(shouldCompact(179_000, 180_000), true);
  });
});

describe("the other limits", () => {
  it("holds the breaker, transcript, snip and file-restore values", () => {
    strictEqual(MAX_CONSECUTIVE_FAILURES, 3);
    strictEqual(TRANSCRIPT_CAP_CHARS, 48_000);
    strictEqual(SNIP_RETAIN_COUNT, 5);
    strictEqual(POST_COMPACT_MAX_FILES_TO_RESTORE, 5);
    strictEqual(POST_COMPACT_PER_FILE_TOKENS, 5_000);
  });
  it("restores a file whole only below file_read's own cut", () => {
    ok(POST_COMPACT_PER_FILE_TOKENS < FILE_READ_CUT_TOKENS);
  });
  it("bounds the file restore by construction: every file at its cap fits the budget", () => {
    strictEqual(POST_COMPACT_TOKEN_BUDGET, POST_COMPACT_MAX_FILES_TO_RESTORE * POST_COMPACT_PER_FILE_TOKENS);
  });
});

describe("pressure tiers", () => {
  it("warning fires when the room left is below the compaction buffer, error below one cut read", () => {
    strictEqual(WARNING_THRESHOLD_BUFFER_TOKENS, AUTOCOMPACT_BUFFER_TOKENS);
    strictEqual(ERROR_THRESHOLD_BUFFER_TOKENS, FILE_READ_CUT_TOKENS);
    strictEqual(isAboveWarningThreshold(180_000 - 36_576 - 1, 180_000), false);
    strictEqual(isAboveWarningThreshold(180_000 - 36_576, 180_000), true);
    strictEqual(isAboveErrorThreshold(171_999, 180_000), false);
    strictEqual(isAboveErrorThreshold(172_000, 180_000), true);
  });
  it("falls back to the default window when none is reported", () => {
    strictEqual(isAboveWarningThreshold(100_000, 0), true);
    strictEqual(isAboveErrorThreshold(100_000, 0), false);
  });
  it("pressureTier ranks error > warning > ok", () => {
    strictEqual(pressureTier(100_000, 180_000), "ok");
    strictEqual(pressureTier(160_000, 180_000), "warning");
    strictEqual(pressureTier(175_000, 180_000), "error");
  });
  it("percentLeft is clamped and rounded", () => {
    strictEqual(percentLeft(90_000, 180_000), 50);
    strictEqual(percentLeft(200_000, 180_000), 0);
    strictEqual(percentLeft(0, 180_000), 100);
  });
});

describe("post-compaction skills budget", () => {
  it("is five skills at their cap", () => {
    strictEqual(POST_COMPACT_PER_SKILL_TOKENS, 1_000);
    strictEqual(POST_COMPACT_SKILLS_TOKEN_BUDGET, 5 * POST_COMPACT_PER_SKILL_TOKENS);
  });

  it("is SEPARATE from the file-restore budget, not a share of it", () => {
    // Sharing one budget would let a handful of large files evict every playbook,
    // and the symptom would read as "the agent forgot the rules after a compaction".
    strictEqual(POST_COMPACT_SKILLS_TOKEN_BUDGET, 5_000);
    strictEqual(POST_COMPACT_TOKEN_BUDGET, 25_000);
  });

  it("caps one skill below the whole budget, so a single playbook cannot take it all", () => {
    ok(POST_COMPACT_PER_SKILL_TOKENS > 0);
    ok(POST_COMPACT_PER_SKILL_TOKENS < POST_COMPACT_SKILLS_TOKEN_BUDGET);
  });
});

describe("the compaction.trigger setting", () => {
  it("reads a token count, with or without a k", () => {
    strictEqual(parseTokenCount("90000"), 90_000);
    strictEqual(parseTokenCount(" 90k "), 90_000);
    strictEqual(parseTokenCount("1.5k"), 1_500);
    strictEqual(parseTokenCount("ninety"), undefined);
    strictEqual(parseTokenCount("0"), undefined);
    strictEqual(parseTokenCount(undefined), undefined);
  });
  it("refuses a value that is not one, for /config set", () => {
    strictEqual(compactionTriggerProblem("90k"), undefined);
    ok(compactionTriggerProblem("soon")?.includes("90k"));
  });
  it("moves the trigger when given, and only then", () => {
    strictEqual(computeTrigger(180_000, 90_000), 90_000);
    strictEqual(computeTrigger(180_000, undefined), 180_000 - AUTOCOMPACT_BUFFER_TOKENS);
    strictEqual(shouldCompact(90_000, 180_000, 90_000), true);
    strictEqual(shouldCompact(89_999, 180_000, 90_000), false);
  });
});
