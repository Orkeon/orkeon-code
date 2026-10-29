// B-9 — the five behavior flags' semantics. Run:
//   node --test tests/shared/domain/agent-policy/behavior-flags.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  EFFORT_LEVELS, EFFORT_MAX_ITERATIONS, DEFAULT_EFFORT, resolveEffort, maxIterationsFor, providerEffort,
  MIN_PASSES, MAX_PASSES, DEFAULT_PASSES, resolvePasses,
  FAST_MODE_DROPPED_BLOCKS, fastModeDrops,
  PROACTIVE_CLAUSE, proactiveSuffix,
  DEFAULT_BEHAVIOR_FLAGS, resolveBehaviorFlags, describeActiveFlags,
} from "../../../../src/shared/domain/agent-policy/behavior-flags.ts";
import {
  EFFORT_JUNK, ESSENTIAL_BLOCKS, LEVEL_RUNGS, PASSES_JUNK, PASSES_OUT_OF_RANGE, PROVIDER_EFFORT_CASES, THINKING_CASES,
} from "./behavior-flags.fixtures.ts";
import { assertMentions, assertOmits } from "../../../support/assertions/text.ts";

describe("the unconfigured session keeps the pre-B-9 behaviour", () => {
  it("resolves an empty bag to the defaults", () => {
    // Arrange
    const bag = {};

    // Act
    const flags = resolveBehaviorFlags(bag);

    // Assert
    deepStrictEqual(flags, DEFAULT_BEHAVIOR_FLAGS);
  });

  // If this rung moved, every existing session would silently change how much
  // work one turn may do — without anyone touching a setting.
  it("medium effort IS the 40 iterations the loop used to hard-code", () => {
    // Arrange
    const level = DEFAULT_EFFORT;

    // Act
    const iterations = EFFORT_MAX_ITERATIONS[level];

    // Assert
    strictEqual(iterations, 40);
  });

  it("an unset effort gives the 40 iterations the loop used to hard-code", () => {
    // Arrange
    const raw = undefined;

    // Act
    const iterations = maxIterationsFor(raw);

    // Assert
    strictEqual(iterations, 40);
  });

  it("defaults to one review pass", () => {
    // Arrange
    const expected = 1;

    // Act
    const passes = DEFAULT_PASSES;

    // Assert
    strictEqual(passes, expected);
  });

  it("drops no block when /fast is off", () => {
    // Arrange
    const fast = false;

    // Act
    const dropped = fastModeDrops(fast);

    // Assert
    deepStrictEqual(dropped, []);
  });

  it("appends no follow-up clause when /proactive is off", () => {
    // Arrange
    const proactive = false;

    // Act
    const suffix = proactiveSuffix(proactive);

    // Assert
    strictEqual(suffix, "");
  });

  it("describes no active flag for the defaults", () => {
    // Arrange
    const flags = DEFAULT_BEHAVIOR_FLAGS;

    // Act
    const line = describeActiveFlags(flags);

    // Assert
    strictEqual(line, "");
  });
});

describe("/effort → the act() iteration ladder", () => {
  it("is monotonic across the five levels", () => {
    // Arrange
    const levels = EFFORT_LEVELS;

    // Act
    const rungs = levels.map((l) => EFFORT_MAX_ITERATIONS[l]);

    // Assert
    ok(rungs.every((n, i) => i === 0 || rungs[i - 1] < n), rungs.join(" < "));
  });

  for (const { level, iterations } of LEVEL_RUNGS) {
    it(`maps the level ${level} to its own rung, ${iterations} iterations`, () => {
      // Arrange
      const raw = level;

      // Act
      const max = maxIterationsFor(raw);

      // Assert
      strictEqual(max, iterations);
    });
  }

  it("normalises case and whitespace, as the bag stores raw strings", () => {
    // Arrange
    const raw = " HIGH ";

    // Act
    const level = resolveEffort(raw);

    // Assert
    strictEqual(level, "high");
  });

  // The bag is user-writable; a rotten value must not take the turn down.
  for (const junk of EFFORT_JUNK) {
    it(`falls back to the default on the junk ${String(junk)} rather than throwing`, () => {
      // Arrange
      const raw = junk;

      // Act
      const level = resolveEffort(raw);

      // Assert
      strictEqual(level, DEFAULT_EFFORT, String(junk));
    });
  }
});

describe("/passes → review rounds", () => {
  for (let n = MIN_PASSES; n <= MAX_PASSES; n++) {
    it(`accepts ${n}, within 1-5`, () => {
      // Arrange
      const raw = String(n);

      // Act
      const passes = resolvePasses(raw);

      // Assert
      strictEqual(passes, n);
    });
  }

  // /passes validates on the way in; this is the read side, where the only
  // useful answer to a stored 99 is "5", not a crash.
  for (const c of PASSES_OUT_OF_RANGE) {
    it(`clamps ${c.name} instead of rejecting it`, () => {
      // Arrange
      const expected = c.bound === "min" ? MIN_PASSES : MAX_PASSES;

      // Act
      const passes = resolvePasses(c.raw);

      // Assert
      strictEqual(passes, expected);
    });
  }

  for (const junk of PASSES_JUNK) {
    it(`falls back to the default on the junk ${String(junk)}`, () => {
      // Arrange
      const raw = junk;

      // Act
      const passes = resolvePasses(raw);

      // Assert
      strictEqual(passes, DEFAULT_PASSES, String(junk));
    });
  }
});

describe("/fast → the dropped blocks", () => {
  it("drops exactly the two advisory blocks", () => {
    // Arrange
    const fast = true;

    // Act
    const dropped = fastModeDrops(fast);

    // Assert
    deepStrictEqual(dropped, ["skills", "memory"]);
  });

  // The header is the cache prefix and the task is the request: dropping either
  // would change what is answered, not how fast.
  for (const essential of ESSENTIAL_BLOCKS) {
    it(`never drops the essential block ${essential}`, () => {
      // Arrange
      const dropped = FAST_MODE_DROPPED_BLOCKS as readonly string[];

      // Act
      const isDropped = dropped.includes(essential);

      // Assert
      strictEqual(isDropped, false, essential);
    });
  }
});

describe("/proactive → the follow-up clause", () => {
  it("appends the clause, separated from the task", () => {
    // Arrange
    const proactive = true;

    // Act
    const suffix = proactiveSuffix(proactive);

    // Assert
    strictEqual(suffix, `\n\n${PROACTIVE_CLAUSE}`);
  });

  it("bounds the suggestion list rather than inviting a second essay", () => {
    // Arrange
    const clause = PROACTIVE_CLAUSE;

    // Act
    const bounded = clause.includes("at most three");

    // Assert
    ok(bounded, clause);
  });
});

describe("providerEffort", () => {
  for (const { raw, expected } of PROVIDER_EFFORT_CASES) {
    it(`forwards a stored level only: ${JSON.stringify(raw) ?? String(raw)} sends ${String(expected)}, so an unset or junk value keeps the provider's default`, () => {
      // Arrange
      const stored = raw;

      // Act
      const level = providerEffort(stored);

      // Assert
      strictEqual(level, expected, String(raw));
    });
  }

  for (const c of THINKING_CASES) {
    it(`resolves the provider thinking: ${c.name}`, () => {
      // Arrange
      const { bag } = c;

      // Act
      const { thinking } = resolveBehaviorFlags(bag);

      // Assert
      strictEqual(thinking, c.thinking);
    });
  }
});

describe("describeActiveFlags", () => {
  it("names only what is off-default, with the effect", () => {
    // Arrange
    const flags = resolveBehaviorFlags({ effort: "high", fast: "true" });

    // Act
    const line = describeActiveFlags(flags);

    // Assert
    assertMentions(line, ["effort=high", "maxIterations=80", "fast=on"]);
    assertOmits(line, ["passes", "proactive"]);
  });

  it("reports the model override so a swapped model is never silent", () => {
    // Arrange
    const flags = resolveBehaviorFlags({ model: "kimi-k3" });

    // Act
    const line = describeActiveFlags(flags);

    // Assert
    assertMentions(line, ["model=kimi-k3"]);
  });

  it("names a stored effort with the provider's thinking, even medium", () => {
    // Arrange
    const flags = resolveBehaviorFlags({ effort: "medium" });

    // Act
    const line = describeActiveFlags(flags);

    // Assert
    assertMentions(line, ["provider thinking medium"]);
  });

  it("names a junk effort, resolved as unset, not at all", () => {
    // Arrange
    const flags = resolveBehaviorFlags({ effort: "junk" });

    // Act
    const line = describeActiveFlags(flags);

    // Assert
    strictEqual(line, "");
  });

  it("treats a blank model as unset", () => {
    // Arrange
    const bag = { model: "   " };

    // Act
    const { model } = resolveBehaviorFlags(bag);

    // Assert
    strictEqual(model, "");
  });
});
