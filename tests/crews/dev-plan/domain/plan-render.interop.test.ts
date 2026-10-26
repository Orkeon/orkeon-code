// The interoperability test of the plan renderer: what /dev-plan writes is what the
// harness's implement, verify and batches steps read, and what L-1 parses back. The
// golden renders are byte for byte; the patterns below are a file format. Run:
//   node --test src/crews/dev-plan/domain/plan-render.interop.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { renderPlan, repoLines } from "../../../../src/crews/dev-plan/domain/plan-render.ts";
import { runGateChecks } from "../../../../src/crews/dev-verify/domain/gate.ts";
import { parseBatchSheet, parseGlobalPlan, sheetProgress } from "../../../../src/shared/domain/dev/plan-format.ts";
import { planSelfCheck } from "../../../../src/shared/domain/dev/plan-checks.ts";
import type { ReviewAnswer } from "../../../../src/shared/domain/dev/review-answer.ts";
import { sheetFacts } from "../../../../src/shared/domain/dev/sheet-facts.ts";
import { blockingRows, parsePlanSource } from "../../../../src/shared/domain/dev/spec-format.ts";
import {
  BLOCKED_SPEC_ROWS, BRIEF, BRIEF_CTX, BY_REF, DATE, GOLDEN_FILES, HARNESS_PLAN_LINES, OTHER_REVIEWS, PACK, RENDERED,
  SHEET_SECTIONS, checked, contextOf, deliveredF1, f1AnchorPaths, files, fixture, json, renderSpec, sortedIds,
} from "./plan-render.interop.fixtures.ts";
import type { Capture } from "./plan-render.interop.fixtures.ts";
import { assertMatchesAll } from "./plan-render.interop.assertions.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("the fixtures", () => {
  it("the spec has its four ids and no Blocking question", () => {
    // Arrange
    const text = fixture("SPEC-prune.md");

    // Act
    const spec = parsePlanSource(text, "spec");

    // Assert
    deepStrictEqual(spec.ids.map((i) => i.id), ["UC-01", "BR-01", "BR-02", "BR-03"]);
    deepStrictEqual([spec.blocking.length, spec.openQuestions.length], [0, 1]);
  });

  it("the blocked spec has four Blocking questions, each caught", () => {
    // Arrange
    const text = fixture("SPEC-blocked.md");

    // Act
    const rows = blockingRows(text).map((r) => r.raw);

    // Assert
    deepStrictEqual(rows, BLOCKED_SPEC_ROWS);
  });

  it("the capture changes every anchor path of F1", () => {
    // Arrange
    const capture = json<Capture>("capture.json");

    // Act
    const paths = f1AnchorPaths();

    // Assert
    deepStrictEqual([...new Set(paths)].sort(), capture.changedFiles);
  });

  it("the capture carries each id of F1 once", () => {
    // Arrange
    const capture = json<Capture>("capture.json");

    // Act
    const facts = sheetFacts(RENDERED.sheets[0].text);

    // Assert
    strictEqual(capture.traitHits.length, facts.ids.length);
  });
});

describe("case 1: the golden renders", () => {
  for (const name of GOLDEN_FILES) {
    it(`renders ${name} byte for byte`, () => {
      // Arrange
      const review = json<ReviewAnswer>("review.json");

      // Act
      const file = files(renderSpec(review)).find((f) => f.name === name);

      // Assert
      strictEqual(file?.text, fixture(`expected/${name}`));
    });
  }
});

describe("case 2: L-1 parses every file back", () => {
  it("the global plan: no problem, the batches, their boxes and dependencies", () => {
    // Arrange
    const text = RENDERED.plan.text;

    // Act
    const plan = parseGlobalPlan(text);

    // Assert
    deepStrictEqual(plan.problems, []);
    deepStrictEqual([plan.prefix, plan.feature], ["PRUNE", "Prune old memory entries"]);
    deepStrictEqual(plan.batches.map((b) => [b.id, b.name, b.state.kind, b.steps.length]), [
      ["F1", "Prune by age", "open", 4], ["F2", "Command reference", "open", 2],
    ]);
    deepStrictEqual(plan.summary.map((r) => [r.id, r.ids, r.dependsOn]), [
      ["F1", "BR-01, BR-02, BR-03 / UC-01", []], ["F2", "UC-01", ["F1"]],
    ]);
  });

  it("the sheets: no problem, the steps, the behaviour steps and the dependencies", () => {
    // Arrange
    const sheets = RENDERED.sheets;

    // Act
    const [f1, f2] = sheets.map((s) => parseBatchSheet(s.text));

    // Assert
    deepStrictEqual([f1.problems, f2.problems], [[], []]);
    deepStrictEqual([f1.batch, f1.name, f1.dependsOn, f2.batch, f2.dependsOn], ["F1", "Prune by age", [], "F2", ["F1"]]);
    deepStrictEqual(f1.steps.map((s) => [s.number, s.tdd === null]), [[1, false], [2, false], [3, false], [4, true]]);
    strictEqual(f1.steps[3].title, "Build and tests");
    deepStrictEqual([sheetProgress(f1).behaviourSteps, sheetProgress(f2).behaviourSteps], [3, 1]);
  });

  it("a blocked plan parses its batches as state other", () => {
    // Arrange
    const text = renderSpec(json<ReviewAnswer>("review-blocking.json")).plan.text;

    // Act
    const plan = parseGlobalPlan(text);

    // Assert
    deepStrictEqual(plan.batches.map((b) => b.state), [{ kind: "other", text: "blocked" }, { kind: "other", text: "blocked" }]);
  });
});

describe("case 3: the /dev-verify gate on F1 once delivered", () => {
  it("is green with F1's capture, the pack's trait and the plan folder", () => {
    // Arrange
    const input = deliveredF1();

    // Act
    const report = runGateChecks(input);

    // Assert
    deepStrictEqual([report.green, report.missingDesignIds, report.untested, report.outside, report.stray], [true, [], [], [], []]);
  });
});

describe("case 4: the lines the harness reads", () => {
  it("every plan pattern matches the global plan", () => {
    // Arrange
    const review = json<ReviewAnswer>("review.json");

    // Act
    const text = renderSpec(review).plan.text;

    // Assert
    assertMatchesAll(text, HARNESS_PLAN_LINES.plan);
  });

  for (const s of RENDERED.sheets) {
    it(`every sheet pattern matches ${s.name}, and its sections come in order`, () => {
      // Arrange
      const { text } = s;

      // Act
      const headings = text.split("\n").filter((l) => l.startsWith("## "));

      // Assert
      assertMatchesAll(text, HARNESS_PLAN_LINES.sheet);
      deepStrictEqual(headings, SHEET_SECTIONS.filter((h) => headings.includes(h)));
    });
  }
});

describe("case 5: the plan's self-check", () => {
  it("passes on the reviewed renders", () => {
    // Arrange
    const r = RENDERED;

    // Act
    const result = planSelfCheck({ plan: r.plan, sheets: r.sheets, sourceIds: sortedIds() });

    // Assert
    deepStrictEqual(result, { ok: true, problems: [] });
  });

  for (const c of OTHER_REVIEWS) {
    it(`passes on the ${c.name} renders`, () => {
      // Arrange
      const r = renderSpec(c.review());

      // Act
      const result = planSelfCheck({ plan: r.plan, sheets: r.sheets, sourceIds: sortedIds() });

      // Assert
      deepStrictEqual(result, { ok: true, problems: [] });
    });
  }
});

describe("case 6: a render from a change brief", () => {
  it("reads the brief: two CH ids, one pinned row, two unpinned", () => {
    // Arrange
    const brief = BRIEF;

    // Act
    const ctx = contextOf(brief, "change");

    // Assert
    deepStrictEqual([brief.changeKind, ctx.sourceIds, ctx.pinned, ctx.unpinned],
      ["refactor", ["CH-01", "CH-02"], ["loads the cached map once"], ["U1", "U2"]]);
  });

  it("writes the Change line and a pinned row, and parses back clean", () => {
    // Arrange
    const answer = checked("answer-cache.json", BRIEF_CTX);

    // Act
    const out = renderPlan({
      prefix: "CACHE", sourceShown: "workbench/cache/CHANGE-cache.md", kind: "change", changeKind: BRIEF.changeKind,
      sourceIds: BRIEF.ids, repo: repoLines(PACK, ".orkeon/repo.yaml"), inventory: BY_REF,
      answer, review: null, date: DATE,
    });

    // Assert
    assertMentions(out.plan.text, ["\n- **Change**: `workbench/cache/CHANGE-cache.md` (`refactor`)\n"]);
    assertMentions(out.sheets[0].text, [
      "\n| 1 | `loads the cached map once` | pinned | `tests` | CH-01 |\n",
      "\n| 2 | `an absent map file gives an empty map` | unit | `tests` | — |\n",
    ]);
    strictEqual(out.plan.text.includes("U1"), false);
    assertMatchesAll(out.plan.text, HARNESS_PLAN_LINES.plan);
    deepStrictEqual(planSelfCheck({ plan: out.plan, sheets: out.sheets, sourceIds: ["CH-01", "CH-02"] }), { ok: true, problems: [] });
  });
});
