// B-9 — the five behavior flags' semantics. Run:
//   node --test src/shared/domain/agent-policy/behavior-flags.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  EFFORT_LEVELS, EFFORT_MAX_ITERATIONS, DEFAULT_EFFORT, resolveEffort, maxIterationsFor,
  MIN_PASSES, MAX_PASSES, DEFAULT_PASSES, resolvePasses,
  FAST_MODE_DROPPED_BLOCKS, fastModeDrops,
  PROACTIVE_CLAUSE, proactiveSuffix,
  DEFAULT_BEHAVIOR_FLAGS, resolveBehaviorFlags, describeActiveFlags,
} from "./behavior-flags.ts";

describe("the unconfigured session keeps the pre-B-9 behaviour", () => {
  it("resolves an empty bag to the defaults", () => {
    deepStrictEqual(resolveBehaviorFlags({}), DEFAULT_BEHAVIOR_FLAGS);
  });

  it("medium effort IS the 40 iterations the loop used to hard-code", () => {
    // If this rung moved, every existing session would silently change how much
    // work one turn may do — without anyone touching a setting.
    strictEqual(EFFORT_MAX_ITERATIONS[DEFAULT_EFFORT], 40);
    strictEqual(maxIterationsFor(undefined), 40);
  });

  it("defaults to one review pass and no dropped blocks", () => {
    strictEqual(DEFAULT_PASSES, 1);
    deepStrictEqual(fastModeDrops(false), []);
    strictEqual(proactiveSuffix(false), "");
    strictEqual(describeActiveFlags(DEFAULT_BEHAVIOR_FLAGS), "");
  });
});

describe("/effort → the act() iteration ladder", () => {
  it("is monotonic across the three levels", () => {
    const [low, medium, high] = EFFORT_LEVELS.map((l) => EFFORT_MAX_ITERATIONS[l]);
    ok(low < medium && medium < high, `${low} < ${medium} < ${high}`);
  });

  it("maps each level to its own rung", () => {
    strictEqual(maxIterationsFor("low"), 10);
    strictEqual(maxIterationsFor("medium"), 40);
    strictEqual(maxIterationsFor("high"), 80);
  });

  it("normalises case and whitespace, as the bag stores raw strings", () => {
    strictEqual(resolveEffort(" HIGH "), "high");
  });

  it("falls back to the default on junk rather than throwing", () => {
    // The bag is user-writable; a rotten value must not take the turn down.
    for (const junk of ["extreme", "", null, undefined, 3, {}]) {
      strictEqual(resolveEffort(junk as any), DEFAULT_EFFORT, String(junk));
    }
  });
});

describe("/passes → review rounds", () => {
  it("accepts 1-5", () => {
    for (let n = MIN_PASSES; n <= MAX_PASSES; n++) strictEqual(resolvePasses(String(n)), n);
  });

  it("clamps out-of-range values instead of rejecting them", () => {
    // /passes validates on the way in; this is the read side, where the only
    // useful answer to a stored 99 is "5", not a crash.
    strictEqual(resolvePasses("0"), MIN_PASSES);
    strictEqual(resolvePasses("99"), MAX_PASSES);
    strictEqual(resolvePasses("-4"), MIN_PASSES);
  });

  it("falls back to the default on junk", () => {
    for (const junk of ["two", "", "1.5", null, undefined]) {
      strictEqual(resolvePasses(junk as any), DEFAULT_PASSES, String(junk));
    }
  });
});

describe("/fast → the dropped blocks", () => {
  it("drops exactly the two advisory blocks", () => {
    deepStrictEqual(fastModeDrops(true), ["skills", "memory"]);
  });

  it("never drops the static header or the task", () => {
    // The header is the cache prefix and the task is the request: dropping either
    // would change what is answered, not how fast.
    for (const essential of ["staticHeader", "task", "preferences", "history"]) {
      strictEqual((FAST_MODE_DROPPED_BLOCKS as readonly string[]).includes(essential), false, essential);
    }
  });
});

describe("/proactive → the follow-up clause", () => {
  it("appends the clause, separated from the task", () => {
    strictEqual(proactiveSuffix(true), `\n\n${PROACTIVE_CLAUSE}`);
  });

  it("bounds the suggestion list rather than inviting a second essay", () => {
    ok(PROACTIVE_CLAUSE.includes("at most three"));
  });
});

describe("describeActiveFlags", () => {
  it("names only what is off-default, with the effect", () => {
    const line = describeActiveFlags(resolveBehaviorFlags({ effort: "high", fast: "true" }));
    ok(line.includes("effort=high"));
    ok(line.includes("maxIterations=80"));
    ok(line.includes("fast=on"));
    ok(!line.includes("passes"), line);
    ok(!line.includes("proactive"), line);
  });

  it("reports the model override so a swapped model is never silent", () => {
    ok(describeActiveFlags(resolveBehaviorFlags({ model: "kimi-k3" })).includes("model=kimi-k3"));
  });

  it("treats a blank model as unset", () => {
    strictEqual(resolveBehaviorFlags({ model: "   " }).model, "");
  });
});
