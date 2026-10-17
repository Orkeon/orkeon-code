// B-9 — lens selection (`review.lenses`) and the review plan line. Run:
//   node_modules/.bin/tsx --test crews/code-review/domain/lenses.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  LENSES, lensKeys, selectLenses, describeReviewPlan, resolveLensSelection,
} from "./lenses.ts";
import { CONFIG_KEYS } from "../../../shared/domain/config-schema.ts";

describe("selectLenses", () => {
  it("returns all three when the setting is unset or blank", () => {
    for (const unset of [undefined, null, "", "   ", ",,"]) {
      deepStrictEqual(selectLenses(unset).lenses.map((l) => l.key), lensKeys(), String(unset));
    }
  });

  it("narrows to the named lenses", () => {
    const s = selectLenses("security,style");
    deepStrictEqual(s.lenses.map((l) => l.key), ["security", "style"]);
    deepStrictEqual(s.unknown, []);
  });

  it("keeps the canonical order, not the setting's", () => {
    // Reports from two runs must be diffable; the lens order is not the operator's
    // to permute by accident.
    deepStrictEqual(selectLenses("style,correctness").lenses.map((l) => l.key), ["correctness", "style"]);
  });

  it("tolerates spacing and case", () => {
    deepStrictEqual(selectLenses(" SECURITY , style ").lenses.map((l) => l.key), ["security", "style"]);
  });

  it("reports an unknown name instead of dropping it in silence", () => {
    const s = selectLenses("security,perf");
    deepStrictEqual(s.lenses.map((l) => l.key), ["security"]);
    deepStrictEqual(s.unknown, ["perf"]);
  });

  it("falls back to all three when NOTHING matched", () => {
    // A review narrowed to zero lenses would write an empty report that looks
    // like a clean bill of health. Full set + a warning is the only safe answer.
    const s = selectLenses("perf,a11y");
    deepStrictEqual(s.lenses.map((l) => l.key), lensKeys());
    deepStrictEqual(s.unknown, ["perf", "a11y"]);
  });

  it("de-duplicates a repeated unknown", () => {
    deepStrictEqual(selectLenses("perf,perf,security").unknown, ["perf"]);
  });
});

describe("the key space still points at a real consumer", () => {
  it("declares review.lenses with the lens vocabulary in its description", () => {
    const spec = CONFIG_KEYS.find((k) => k.key === "review.lenses");
    ok(spec, "review.lenses must stay settable");
    for (const key of lensKeys()) ok(spec!.description.includes(key), key);
  });
});

describe("describeReviewPlan", () => {
  it("says pass, singular, for one", () => {
    strictEqual(describeReviewPlan(LENSES, 1), "1 pass × 3 lens(es): correctness, security, style");
  });
  it("says passes, plural, beyond one", () => {
    ok(describeReviewPlan(LENSES, 3).startsWith("3 passes × 3 lens(es)"));
  });
  it("names the source when it is not the default (B-12)", () => {
    ok(describeReviewPlan(LENSES, 1, "input").includes("lenses from the input"));
    ok(!describeReviewPlan(LENSES, 1, "default").includes("lenses from"));
  });
});

describe("resolveLensSelection — B-12: input beats the setting", () => {
  it("uses the input when it names a lens", () => {
    // /review --lens and /security-review narrow on purpose; a standing preference
    // must not override a deliberate act on this run.
    const r = resolveLensSelection({ input: "security", config: "style" });
    deepStrictEqual(r.lenses.map((l) => l.key), ["security"]);
    strictEqual(r.source, "input");
  });

  it("accepts an array input as well as a comma string", () => {
    const r = resolveLensSelection({ input: ["security", "style"] });
    deepStrictEqual(r.lenses.map((l) => l.key), ["security", "style"]);
    strictEqual(r.source, "input");
  });

  it("counts an explicit request for all three as an input", () => {
    // Not "narrower than the full set": naming all three IS a choice, and it must
    // win over a setting that says otherwise.
    const r = resolveLensSelection({ input: "correctness,security,style", config: "style" });
    strictEqual(r.source, "input");
    strictEqual(r.lenses.length, 3);
  });

  it("falls to the setting when the input is empty", () => {
    const r = resolveLensSelection({ input: "", config: "style" });
    deepStrictEqual(r.lenses.map((l) => l.key), ["style"]);
    strictEqual(r.source, "config");
  });

  it("falls to the setting when the input names nothing known", () => {
    // The caller meant to narrow; the honest answer to "narrow to something I do
    // not have" is the next-widest thing they configured — and the typo is reported.
    const r = resolveLensSelection({ input: "perf", config: "security" });
    deepStrictEqual(r.lenses.map((l) => l.key), ["security"]);
    strictEqual(r.source, "config");
    ok(r.unknown.includes("perf"));
  });

  it("defaults to all three with neither source set", () => {
    const r = resolveLensSelection({});
    deepStrictEqual(r.lenses.map((l) => l.key), lensKeys());
    strictEqual(r.source, "default");
  });

  it("keeps a typo visible even when nothing was selected from either source", () => {
    const r = resolveLensSelection({ input: "perf", config: "a11y" });
    strictEqual(r.source, "default");
    deepStrictEqual(r.unknown.sort(), ["a11y", "perf"]);
  });
});
