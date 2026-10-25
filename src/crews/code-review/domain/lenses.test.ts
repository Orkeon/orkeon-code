// B-9 — lens selection (`review.lenses`) and the review plan line. Run:
//   node --test src/crews/code-review/domain/lenses.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual, ok } from "node:assert";

import {
  LENSES, lensKeys, selectLenses, describeReviewPlan, resolveLensSelection,
} from "./lenses.ts";
import { CONFIG_KEYS } from "../../../shared/domain/config-schema.ts";
import { UNSET_SETTINGS } from "./lenses.fixtures.ts";
import { assertMentions } from "./lenses.assertions.ts";

describe("selectLenses", () => {
  for (const unset of UNSET_SETTINGS) {
    it(`returns all three when the setting is ${unset.name}`, () => {
      // Arrange
      const setting = unset.value;

      // Act
      const s = selectLenses(setting);

      // Assert
      deepStrictEqual(s.lenses.map((l) => l.key), lensKeys(), String(setting));
    });
  }

  it("narrows to the named lenses", () => {
    // Arrange
    const setting = "security,style";

    // Act
    const s = selectLenses(setting);

    // Assert
    deepStrictEqual(s.lenses.map((l) => l.key), ["security", "style"]);
    deepStrictEqual(s.unknown, []);
  });

  it("keeps the canonical order, not the setting's", () => {
    // Reports from two runs must be diffable; the lens order is not the operator's
    // to permute by accident.
    // Arrange
    const setting = "style,correctness";

    // Act
    const s = selectLenses(setting);

    // Assert
    deepStrictEqual(s.lenses.map((l) => l.key), ["correctness", "style"]);
  });

  it("tolerates spacing and case", () => {
    // Arrange
    const setting = " SECURITY , style ";

    // Act
    const s = selectLenses(setting);

    // Assert
    deepStrictEqual(s.lenses.map((l) => l.key), ["security", "style"]);
  });

  it("reports an unknown name instead of dropping it in silence", () => {
    // Arrange
    const setting = "security,perf";

    // Act
    const s = selectLenses(setting);

    // Assert
    deepStrictEqual(s.lenses.map((l) => l.key), ["security"]);
    deepStrictEqual(s.unknown, ["perf"]);
  });

  it("falls back to all three when NOTHING matched", () => {
    // A review narrowed to zero lenses would write an empty report that looks
    // like a clean bill of health. Full set + a warning is the only safe answer.
    // Arrange
    const setting = "perf,a11y";

    // Act
    const s = selectLenses(setting);

    // Assert
    deepStrictEqual(s.lenses.map((l) => l.key), lensKeys());
    deepStrictEqual(s.unknown, ["perf", "a11y"]);
  });

  it("de-duplicates a repeated unknown", () => {
    // Arrange
    const setting = "perf,perf,security";

    // Act
    const s = selectLenses(setting);

    // Assert
    deepStrictEqual(s.unknown, ["perf"]);
  });
});

describe("the key space still points at a real consumer", () => {
  it("declares review.lenses with the lens vocabulary in its description", () => {
    // Arrange
    const keys = CONFIG_KEYS;

    // Act
    const spec = keys.find((k) => k.key === "review.lenses");

    // Assert
    ok(spec, "review.lenses must stay settable");
    assertMentions(spec!.description, lensKeys());
  });
});

describe("describeReviewPlan", () => {
  it("says pass, singular, for one", () => {
    // Arrange
    const passes = 1;

    // Act
    const plan = describeReviewPlan(LENSES, passes);

    // Assert
    strictEqual(plan, "1 pass × 3 lens(es): correctness, security, style");
  });

  it("says passes, plural, beyond one", () => {
    // Arrange
    const passes = 3;

    // Act
    const plan = describeReviewPlan(LENSES, passes);

    // Assert
    ok(plan.startsWith("3 passes × 3 lens(es)"));
  });

  it("names the source when it is not the default (B-12)", () => {
    // Arrange
    const source = "input";

    // Act
    const plan = describeReviewPlan(LENSES, 1, source);

    // Assert
    ok(plan.includes("lenses from the input"));
  });

  it("names no source when it is the default (B-12)", () => {
    // Arrange
    const source = "default";

    // Act
    const plan = describeReviewPlan(LENSES, 1, source);

    // Assert
    ok(!plan.includes("lenses from"));
  });
});

describe("resolveLensSelection — B-12: input beats the setting", () => {
  it("uses the input when it names a lens", () => {
    // /review --lens and /security-review narrow on purpose; a standing preference
    // must not override a deliberate act on this run.
    // Arrange
    const sources = { input: "security", config: "style" };

    // Act
    const r = resolveLensSelection(sources);

    // Assert
    deepStrictEqual(r.lenses.map((l) => l.key), ["security"]);
    strictEqual(r.source, "input");
  });

  it("accepts an array input as well as a comma string", () => {
    // Arrange
    const sources = { input: ["security", "style"] };

    // Act
    const r = resolveLensSelection(sources);

    // Assert
    deepStrictEqual(r.lenses.map((l) => l.key), ["security", "style"]);
    strictEqual(r.source, "input");
  });

  it("counts an explicit request for all three as an input", () => {
    // Not "narrower than the full set": naming all three IS a choice, and it must
    // win over a setting that says otherwise.
    // Arrange
    const sources = { input: "correctness,security,style", config: "style" };

    // Act
    const r = resolveLensSelection(sources);

    // Assert
    strictEqual(r.source, "input");
    strictEqual(r.lenses.length, 3);
  });

  it("falls to the setting when the input is empty", () => {
    // Arrange
    const sources = { input: "", config: "style" };

    // Act
    const r = resolveLensSelection(sources);

    // Assert
    deepStrictEqual(r.lenses.map((l) => l.key), ["style"]);
    strictEqual(r.source, "config");
  });

  it("falls to the setting when the input names nothing known", () => {
    // The caller meant to narrow; the honest answer to "narrow to something I do
    // not have" is the next-widest thing they configured — and the typo is reported.
    // Arrange
    const sources = { input: "perf", config: "security" };

    // Act
    const r = resolveLensSelection(sources);

    // Assert
    deepStrictEqual(r.lenses.map((l) => l.key), ["security"]);
    strictEqual(r.source, "config");
    ok(r.unknown.includes("perf"));
  });

  it("defaults to all three with neither source set", () => {
    // Arrange
    const sources = {};

    // Act
    const r = resolveLensSelection(sources);

    // Assert
    deepStrictEqual(r.lenses.map((l) => l.key), lensKeys());
    strictEqual(r.source, "default");
  });

  it("keeps a typo visible even when nothing was selected from either source", () => {
    // Arrange
    const sources = { input: "perf", config: "a11y" };

    // Act
    const r = resolveLensSelection(sources);

    // Assert
    strictEqual(r.source, "default");
    deepStrictEqual(r.unknown.sort(), ["a11y", "perf"]);
  });
});
