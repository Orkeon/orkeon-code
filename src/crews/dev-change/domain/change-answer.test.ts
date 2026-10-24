// checkChangeAnswer: what a change brief's JSON must hold for each kind - a number in a perf criterion, a protected
// behaviour for a refactor, no design words, a TBD backed by a question - and pinOnlyKnown turning an unknown pin
// into unpinned. A feature is routed and not checked.
// Run:  node --test src/crews/dev-change/domain/change-answer.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { checkChangeAnswer, criterionId, pinOnlyKnown } from "./change-answer.ts";
import type { ChangeAnswer } from "./change-answer.ts";

const good = (over: Partial<ChangeAnswer> = {}): ChangeAnswer => ({
  route: "change", name: "The map is read on every call", summary: "A second request reads the file again.",
  evidence: [], suspected: "", criteria: [{ name: "Read once", statement: "a second request reads no file within 5 ms", proof: "the reproduction turns green", severity: "blocking" }],
  mustNotChange: [{ behaviour: "an absent map gives an empty map", pinnedBy: "loads an absent map" }],
  scope: [], constraints: [], assumptions: [], questions: [], ...over,
});
const problems = (v: unknown, kind: "bug" | "refactor" | "perf"): string[] => {
  const r = checkChangeAnswer(v, kind);
  return r.ok ? [] : r.problems;
};

describe("checkChangeAnswer", () => {
  it("accepts a well-formed brief of each kind, and a feature without checks", () => {
    for (const kind of ["bug", "refactor", "perf"] as const) deepStrictEqual(problems(good(), kind), [], kind);
    ok(checkChangeAnswer({ route: "feature" }, "bug").ok);
  });

  it("asks a perf change for a number and a refactor for a protected behaviour", () => {
    const noNumber = good({ criteria: [{ name: "Faster", statement: "a second request is faster", proof: "the timing", severity: "blocking" }] });
    ok(problems(noNumber, "perf").some((p) => p.includes("a number")));
    strictEqual(problems(noNumber, "bug").length, 0);
    ok(problems(good({ mustNotChange: [] }), "refactor").some((p) => p.includes("must not change")));
  });

  it("refuses design words, a TBD without a question, a broken cell and no criterion", () => {
    ok(problems(good({ summary: "Add a new class MapCache." }), "bug").some((p) => p.startsWith("no design")));
    ok(problems(good({ summary: "The limit is TBD." }), "bug").some((p) => p.includes("TBD")));
    ok(problems(good({ mustNotChange: [{ behaviour: "a | b", pinnedBy: "" }] }), "bug").some((p) => p.includes("'|'")));
    ok(problems(good({ criteria: [] }), "bug").some((p) => p.includes("at least one")));
    strictEqual(criterionId(0), "CH-01");
  });
});

describe("pinOnlyKnown", () => {
  it("keeps a pin the index shows and turns the others unpinned", () => {
    const a = good({ mustNotChange: [{ behaviour: "x", pinnedBy: "`known test`" }, { behaviour: "y", pinnedBy: "ghost" }, { behaviour: "z", pinnedBy: "" }] });
    const r = pinOnlyKnown(a, (n) => n === "known test");
    deepStrictEqual(r.answer.mustNotChange.map((m) => m.pinnedBy), ["known test", "unpinned", "unpinned"]);
    deepStrictEqual(r.unknown, ["ghost"]);
  });
});
