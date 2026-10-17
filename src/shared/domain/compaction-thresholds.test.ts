// F3.1 — threshold math. Run: node_modules/.bin/tsx --test shared/domain/compaction-thresholds.test.ts
import { describe, it } from "node:test";
import { strictEqual, ok } from "node:assert";
import {
  AUTOCOMPACT_BUFFER_TOKENS,
  DEFAULT_CONTEXT_WINDOW,
  ERROR_THRESHOLD_BUFFER_TOKENS,
  MAX_CONSECUTIVE_FAILURES,
  POST_COMPACT_MAX_FILES_TO_RESTORE,
  POST_COMPACT_PER_FILE_TOKENS,
  POST_COMPACT_TOKEN_BUDGET,
  SNIP_RETAIN_COUNT,
  TRANSCRIPT_CAP_CHARS,
  WARNING_THRESHOLD_BUFFER_TOKENS,
  computeTrigger,
  isAboveErrorThreshold,
  isAboveWarningThreshold,
  percentLeft,
  pressureTier,
  shouldCompact,
  POST_COMPACT_SKILLS_TOKEN_BUDGET,
  POST_COMPACT_PER_SKILL_TOKENS,
} from "./compaction-thresholds.ts";

describe("computeTrigger", () => {
  it("is window minus the buffer", () => {
    strictEqual(computeTrigger(180_000), 167_000);
  });

  it("falls back to the default window when none is reported", () => {
    strictEqual(computeTrigger(0), DEFAULT_CONTEXT_WINDOW - AUTOCOMPACT_BUFFER_TOKENS);
    strictEqual(computeTrigger(-1), DEFAULT_CONTEXT_WINDOW - AUTOCOMPACT_BUFFER_TOKENS);
  });
});

describe("shouldCompact", () => {
  it("fires at the boundary (equality) and above, not below", () => {
    strictEqual(shouldCompact(166_999, 180_000), false);
    strictEqual(shouldCompact(167_000, 180_000), true);
    strictEqual(shouldCompact(179_000, 180_000), true);
  });
});

describe("constants (source-verbatim)", () => {
  it("holds the documented values", () => {
    strictEqual(AUTOCOMPACT_BUFFER_TOKENS, 13_000);
    strictEqual(MAX_CONSECUTIVE_FAILURES, 3);
    strictEqual(TRANSCRIPT_CAP_CHARS, 16_000);
    strictEqual(SNIP_RETAIN_COUNT, 5);
  });
  it("holds the E-4/E-5 values (baseline 07)", () => {
    strictEqual(POST_COMPACT_MAX_FILES_TO_RESTORE, 5);
    strictEqual(POST_COMPACT_TOKEN_BUDGET, 50_000);
    strictEqual(POST_COMPACT_PER_FILE_TOKENS, 5_000);
    strictEqual(WARNING_THRESHOLD_BUFFER_TOKENS, 30_000);
    strictEqual(ERROR_THRESHOLD_BUFFER_TOKENS, 8_000);
  });
});

describe("pressure tiers (E-5)", () => {
  it("warning fires at window − 30 k, error at window − 8 k (equality counts)", () => {
    strictEqual(isAboveWarningThreshold(149_999, 180_000), false);
    strictEqual(isAboveWarningThreshold(150_000, 180_000), true);
    strictEqual(isAboveErrorThreshold(171_999, 180_000), false);
    strictEqual(isAboveErrorThreshold(172_000, 180_000), true);
  });
  it("falls back to the default window when none is reported", () => {
    strictEqual(isAboveWarningThreshold(150_000, 0), true);
    strictEqual(isAboveErrorThreshold(150_000, 0), false);
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

describe("post-compaction skills budget (B-13)", () => {
  it("ACCEPTANCE 2 — the skills budget is 25 000 tokens, matching baseline 07 §1", () => {
    strictEqual(POST_COMPACT_SKILLS_TOKEN_BUDGET, 25_000);
  });

  it("is SEPARATE from the file-restore budget, not a share of it", () => {
    // Sharing one budget would let a handful of large files evict every playbook,
    // and the symptom would read as "the agent forgot the rules after a compaction".
    // Both values are pinned rather than compared: tsc rightly points out that two
    // literal types can never overlap, so a `!==` here asserts nothing at all.
    strictEqual(POST_COMPACT_SKILLS_TOKEN_BUDGET, 25_000);
    strictEqual(POST_COMPACT_TOKEN_BUDGET, 50_000, "the file budget must not have moved");
  });

  it("caps one skill below the whole budget, so a single playbook cannot take it all", () => {
    ok(POST_COMPACT_PER_SKILL_TOKENS > 0);
    ok(POST_COMPACT_PER_SKILL_TOKENS < POST_COMPACT_SKILLS_TOKEN_BUDGET);
  });
});
