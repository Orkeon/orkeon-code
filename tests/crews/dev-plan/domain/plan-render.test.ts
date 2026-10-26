// Unit tests for the plan renderer: the Scope lines from the pack, the anchor kinds, the
// review's rows in the plan and the sheets, the blocked state, the ids and the joins. Run:
//   node --test tests/crews/dev-plan/domain/plan-render.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { repoLines } from "../../../../src/crews/dev-plan/domain/plan-render.ts";
import type { ReviewAnswer } from "../../../../src/shared/domain/dev/review-answer.ts";
import {
  BLOCKING_AND_MAJOR_ON_F1, BLOCKING_QUESTION_ROW, LABELLED_REVIEW, LISTS, MAJOR_ON_F2, MAJOR_ON_F2_DECISION, MAJOR_ON_PLAN,
  MAJOR_ON_PLAN_SECTION, MAJOR_THEN_BLOCKING_ON_PLAN, NO_ID_AND_LAYERS, NO_PACK_COMMANDS, PACK, PACK_COMMANDS, PACK_LAYOUT,
  REVERSED_NON_APPLICABLE, STEP_NOTE, THREE_KINDS, THREE_KINDS_ROW, UNORDERED_IDS, json, lineStarting, linesOf, pack, render,
} from "./plan-render.fixtures.ts";
import { assertOneBulletEach, assertTidyFile } from "./plan-render.assertions.ts";
import { assertMentions } from "../../../support/assertions/text.ts";

describe("repoLines", () => {
  it("writes each command key, set or absent, then where the pack is", () => {
    // Arrange
    const shown = ".orkeon/repo.yaml";

    // Act
    const r = repoLines(PACK, shown);

    // Assert
    strictEqual(r.commands, PACK_COMMANDS);
    strictEqual(r.layout, PACK_LAYOUT);
    deepStrictEqual(r.absent, ["commands.build_test", "commands.test_project", "commands.test_integration"]);
  });

  it("leaves an absent layout key out", () => {
    // Arrange
    const some = pack("layout:\n  tests: test\ncommands:\n  test: make test\n");

    // Act
    const r = repoLines(some, "repo.yaml");

    // Assert
    strictEqual(r.layout, "tests `test` — from `repo.yaml`");
    ok(r.absent.includes("layout.domain"));
  });

  it("says when the pack names no root", () => {
    // Arrange
    const none = pack("commands:\n  test: make test\n");

    // Act
    const r = repoLines(none, "repo.yaml");

    // Assert
    strictEqual(r.layout, "(not in the pack) — from `repo.yaml`");
  });

  it("marks every key absent without a pack", () => {
    // Arrange
    const noPack = null;

    // Act
    const r = repoLines(noPack, null);

    // Assert
    strictEqual(r.commands, NO_PACK_COMMANDS);
    strictEqual(r.layout, "(not in the pack) — no repository pack: add .orkeon/repo.yaml");
    strictEqual(r.absent.length, 11);
  });
});

describe("renderPlan: the files", () => {
  it("names the plan and one sheet per batch, every line without a trailing space, one final line break", () => {
    // Arrange
    const over = {};

    // Act
    const out = render(over);

    // Assert
    deepStrictEqual([out.plan.name, ...out.sheets.map((s) => s.name)], ["PRUNE-PLAN.md", "PRUNE-PLAN-F1.md", "PRUNE-PLAN-F2.md"]);
    for (const text of [out.plan.text, ...out.sheets.map((s) => s.text)]) assertTidyFile(text);
  });

  it("writes a brief's source line and its sheets' Change line", () => {
    // Arrange
    const over = { kind: "change" as const, changeKind: "refactor" as const, sourceShown: "workbench/cache/CHANGE-cache.md" };

    // Act
    const out = render(over);

    // Assert
    strictEqual(lineStarting(out.plan.text, "- **Change**"), "- **Change**: `workbench/cache/CHANGE-cache.md` (`refactor`)");
    strictEqual(linesOf(out.sheets[0].text)[2], "> Batch F1 of `PRUNE-PLAN.md`. Change: `workbench/cache/CHANGE-cache.md`.");
  });
});

describe("renderPlan: ids and joins", () => {
  it("orders a batch's ids BR and CH by number, then UC after a slash", () => {
    // Arrange
    const edit = UNORDERED_IDS;

    // Act
    const out = render({}, edit);

    // Assert
    strictEqual(lineStarting(out.plan.text, "| F1 |")?.split(" | ")[2], "BR-01, BR-02, BR-03, BR-9, BR-10 / UC-01");
    assertMentions(out.sheets[0].text, ["**Ids**: BR-01, BR-02, BR-03, BR-9, BR-10 / UC-01. **Depends on**: [none]"]);
    strictEqual(lineStarting(out.sheets[1].text, "The command reference"), "The command reference and the memory page describe /memory prune. **Ids**: UC-01. **Depends on**: F1");
  });

  it("joins reuse with ; and the owners with +, and writes none for an empty list", () => {
    // Arrange
    const edit = LISTS;

    // Act
    const out = render({}, edit);

    // Assert
    strictEqual(lineStarting(out.plan.text, "- **Reuse**"), "- **Reuse**: none");
    strictEqual(lineStarting(out.plan.text, "- **Out of scope**"), "- **Out of scope**: one; two");
    strictEqual(lineStarting(out.plan.text, "- **Assumptions**"), "- **Assumptions**: the store is local");
    strictEqual(lineStarting(out.plan.text, "| UC-01"), "| UC-01 — Prune old memory entries | `runMemory()` + `pruneEntries()` | F1, F2 |");
  });

  it("lists the non-applicable rules in design-rule order whatever the answer's order", () => {
    // Arrange
    const edit = REVERSED_NON_APPLICABLE;

    // Act
    const out = render({}, edit);

    // Assert
    ok(lineStarting(out.plan.text, "- **Non-applicable rules**")?.startsWith("- **Non-applicable rules**: DDD-04: N/A — the cut-off"));
  });

  it("writes the step note after a blank line and before the TDD line", () => {
    // Arrange
    const over = {};

    // Act
    const text = render(over).sheets[1].text;

    // Assert
    assertMentions(text, [STEP_NOTE]);
  });

  it("writes a dash for a test without an id, and the layer labels in order", () => {
    // Arrange
    const edit = NO_ID_AND_LAYERS;

    // Act
    const out = render({}, edit);

    // Assert
    assertMentions(out.sheets[0].text, ["| 2 | `refuses a cut-off in the future` | unit | `src/shared/domain` | — |"]);
    const labels = linesOf(out.sheets[0].text).filter((l) => /^\*\*(Domain|Application|Adapters|Tests)\*\*$/.test(l));
    deepStrictEqual(labels, ["**Domain**", "**Application**", "**Adapters**", "**Tests**"]);
  });
});

describe("renderPlan: anchors", () => {
  it("renders the three kinds in each column", () => {
    // Arrange
    const edit = THREE_KINDS;

    // Act
    const out = render({}, edit);

    // Assert
    strictEqual(lineStarting(out.sheets[0].text, "| 1 — "), THREE_KINDS_ROW);
  });

  it("closes the table with the build step row", () => {
    // Arrange
    const over = {};

    // Act
    const out = render(over);

    // Assert
    strictEqual(lineStarting(out.sheets[0].text, "| 4 — "), "| 4 — Build and tests | — | — | — |");
  });
});

describe("renderPlan: the review", () => {
  it("leaves ## Decisions out of a sheet with no decision and no review row", () => {
    // Arrange
    const over = {};

    // Act
    const out = render(over);

    // Assert
    assertMentions(out.sheets[0].text, ["## Decisions\n- 2026-10-22 — The age is read"]);
    strictEqual(out.sheets[1].text.includes("## Decisions"), false);
    strictEqual(out.plan.text.includes("Open questions"), false);
  });

  it("puts a Major row on a batch under its sheet's ## Decisions, created when absent, and adds no ## 4", () => {
    // Arrange
    const review = MAJOR_ON_F2;

    // Act
    const out = render({ review });

    // Assert
    assertMentions(out.sheets[1].text, [MAJOR_ON_F2_DECISION]);
    strictEqual(out.plan.text.includes("## 4. Open questions"), false);
    assertMentions(out.plan.text, ["### Batch F1 — Prune by age — open"]);
  });

  it("puts a plan-level Major row in ## 4 and keeps the batches open", () => {
    // Arrange
    const review = MAJOR_ON_PLAN;

    // Act
    const text = render({ review }).plan.text;

    // Assert
    ok(text.endsWith(MAJOR_ON_PLAN_SECTION));
    assertMentions(text, ["— open\n"]);
  });

  it("lower-cases the classification labels in every review cell and decision line", () => {
    // Arrange
    const review = LABELLED_REVIEW;

    // Act
    const out = render({ review });

    // Assert
    assertMentions(out.sheets[0].text, ["review (Major): Should the non-applicable rules list name DDD-05? Evidence: applied rules row of § 3."]);
    assertMentions(out.plan.text, ["| 1 | Major | Is APP-02 right under non-applicable rules? | non-applicable rules of § 1 |"]);
    strictEqual(linesOf(out.sheets[0].text).filter((l) => l.includes("Applied rules")).length, 1);
  });

  it("blocks every batch on a Blocking row and points the targeted sheet to the question", () => {
    // Arrange
    const review = json<ReviewAnswer>("review-blocking.json");

    // Act
    const out = render({ review });

    // Assert
    deepStrictEqual(linesOf(out.plan.text).filter((l) => l.startsWith("### Batch")), [
      "### Batch F1 — Prune by age — blocked", "### Batch F2 — Command reference — blocked",
    ]);
    ok(out.plan.text.endsWith(BLOCKING_QUESTION_ROW));
    assertMentions(out.sheets[0].text, ["## Decisions\n- Blocked by question 1 of PRUNE-PLAN.md § 4 (2026-10-22)\n- 2026-10-22 — The age is read"]);
    strictEqual(out.sheets[1].text.includes("## Decisions"), false);
  });

  it("numbers Blocking rows before plan-level Major rows, and a plan-wide Blocking row reaches every sheet", () => {
    // Arrange
    const review = MAJOR_THEN_BLOCKING_ON_PLAN;

    // Act
    const out = render({ review });

    // Assert
    assertMentions(out.plan.text, ["| 1 | Blocking | Is a cut-off required? | § 4 |\n| 2 | Major | Is the reason of F2 right? | ## 0. Summary |\n"]);
    for (const s of out.sheets) assertMentions(s.text, ["## Decisions\n- Blocked by question 1 of PRUNE-PLAN.md § 4 (2026-10-22)\n"]);
  });

  it("writes the Blocked by line and the review's Major lines under ## Decisions in one format, a bullet", () => {
    // Arrange
    const review = BLOCKING_AND_MAJOR_ON_F1;

    // Act
    const text = render({ review }).sheets[0].text;

    // Assert
    assertOneBulletEach(text, ["Blocked by question", "review (Major)"]);
  });
});
