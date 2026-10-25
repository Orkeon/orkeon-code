// runDevPlan over FakeFiles (the plan fixtures), FakeShell, FakeCodeIndex, a batch_anchors stub, FakeLlm and a
// fixed clock: the plan written then rewritten after the review, the golden renders, the
// blocked plan, the refusals before any model call, the re-ask, the replace rules, the
// review that fails, the warnings, and no write under .claude/ nor outside the code
// folder in any case. Run:
//   node --test src/crews/dev-plan/application/run-dev-plan.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { runDevPlan } from "./run-dev-plan.ts";
import { FakePrecedents, PRECEDENTS_SAMPLE } from "../../../../tests/support/doubles/fake-precedents.ts";
import {
  ANSWER, BLOCKED_END, CLEAR, CLEAR_SUMMARY, CODE, F1, F2, FEWER_BATCHES_TEXT, FOURTEEN_UNKNOWN_REUSE, INVENTORY, MAJOR_LINES,
  NEXT_LINE, PJ, PLAN, REFUSALS, REVIEW_BLOCKING, REVIEW_MAJOR, STARTED_PLAN_TEXT, fixture, recordListings, setup,
  withGoldenPlan, withThreeBatchPlan, written,
} from "./run-dev-plan.fixtures.ts";
import { assertGoldenRenders, assertGuarded, assertListedOnce } from "./run-dev-plan.assertions.ts";
import { assertMentions } from "../../../../tests/support/assertions/text.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("runDevPlan — a plan written and reviewed", () => {
  it("writes the plan, its sheets and plan.json, and ends on the next command (review CLEAR)", async () => {
    // Arrange
    const f = setup();

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    assertGuarded(f.files);
    deepStrictEqual(written(f), [PLAN, F1, F2, PJ, PJ]);
    strictEqual(f.llm.extracts.length, 2);
    strictEqual(f.llm.acts.length, 1);
    strictEqual(f.llm.acts[0].request.permissionMode, "plan");
    strictEqual(f.anchors.calls.length, 5);
    strictEqual(text, CLEAR_SUMMARY);
    const pj = JSON.parse(f.files.files.get(PJ) ?? "{}");
    deepStrictEqual([pj.version, pj.source, pj.prefix, pj.review], [1, "workbench/prune/SPEC-prune.md", "PRUNE", CLEAR]);
    deepStrictEqual(pj.inventory.entries.map((e: { ref: string; path: string; line: number }) => [e.ref, e.path, e.line]),
      INVENTORY.entries.map((e) => [e.ref, e.path, e.line]));
    deepStrictEqual(pj.answer, ANSWER);
  });

  it("puts a Major row under F1's ## Decisions: the golden renders, F1 and plan.json rewritten", async () => {
    // Arrange
    const f = setup();
    f.llm.extractions = [ANSWER, REVIEW_MAJOR];

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    assertGuarded(f.files);
    deepStrictEqual(written(f), [PLAN, F1, F2, PJ, F1, PJ]);
    assertGoldenRenders(f.files);
    assertMentions(text, [MAJOR_LINES]);
    ok(text.endsWith(NEXT_LINE));
    deepStrictEqual(JSON.parse(f.files.files.get(PJ) ?? "{}").review, REVIEW_MAJOR);
  });

  it("blocks every batch on a Blocking row and points back to the spec", async () => {
    // Arrange
    const f = setup();
    f.llm.extractions = [ANSWER, REVIEW_BLOCKING];

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    assertGuarded(f.files);
    assertMentions(f.files.files.get(PLAN) ?? "", [
      "### Batch F1 — Prune by age — blocked", "### Batch F2 — Command reference — blocked", "## 4. Open questions",
    ]);
    assertMentions(f.files.files.get(F1) ?? "", ["## Decisions\n- Blocked by question 1 of PRUNE-PLAN.md § 4 (2026-10-22)"]);
    deepStrictEqual(text.split("\n").slice(-2), BLOCKED_END);
    ok(!text.includes("/dev-implement"));
  });

  it("keeps the files and says the review did not run when the reviewer fails", async () => {
    // Arrange
    const f = setup();
    f.llm.answers = [new Error("provider down\nstack")];

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    assertGuarded(f.files);
    deepStrictEqual(written(f), [PLAN, F1, F2, PJ]);
    assertMentions(text, ["\nreview: not run (model-failed: provider down)\n"]);
    ok(text.endsWith("→ The plan is written but unreviewed: read it closely before implementing, or /dev-plan prune --replace to plan and review again."));
  });

  it("warns when the host's permission gate is off, and still reviews", async () => {
    // Arrange
    const f = setup();
    f.llm.gateEnabled = false;

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    assertMentions(text, ["warning: the host's permission gate is off; the reviewer was offered read tools only"]);
    strictEqual(f.llm.acts.length, 1);
  });

  it("says nothing of the permission gate when the host does not tell", async () => {
    // Arrange
    const quiet = setup();
    quiet.llm.gateEnabled = undefined;

    // Act
    const text = await runDevPlan({ source: "prune" }, quiet.deps);

    // Assert
    ok(!text.includes("permission gate"));
  });

  it("offers the reviewer the plan files, the source, the inventory and the targets", async () => {
    // Arrange
    const f = setup();

    // Act
    await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    assertMentions(f.llm.acts[0].prompt, [
      "mode: plan workbench/prune/",
      "- workbench/prune/PRUNE-PLAN.md\n- workbench/prune/PRUNE-PLAN-F1.md\n- workbench/prune/PRUNE-PLAN-F2.md",
      "Source it was planned from: workbench/prune/SPEC-prune.md",
      "I1 · src/shared/domain/memory.ts:18",
      "A row targets one of: plan, F1, F2.",
    ]);
  });
});

describe("runDevPlan — a prompt with no room for the inventory", () => {
  it("refuses before any model call and writes nothing", async () => {
    // Arrange
    const f = setup();
    const precedents = FakePrecedents.hits("p".repeat(26_000));

    // Act
    const text = await runDevPlan({ source: "prune" }, { ...f.deps, precedents: precedents.recall });

    // Assert
    ok(text.startsWith("dev-plan: the prompt leaves no room for the inventory"), text);
    strictEqual(f.deps.llm.extracts.length, 0);
    strictEqual(f.deps.files.writes.length, 0);
  });
});

describe("runDevPlan — T2, the shared memory's precedents", () => {
  it("recalls decisions and code structures from the code and the source's titles, the block in the planner's prompt", async () => {
    // Arrange
    const f = setup();
    const precedents = FakePrecedents.hits();

    // Act
    const text = await runDevPlan({ source: "prune" }, { ...f.deps, precedents: precedents.recall });

    // Assert
    deepStrictEqual(precedents.calls.map((c) => c.trigger), ["T2"]);
    ok(precedents.calls[0].query.startsWith("prune — "), precedents.calls[0].query);
    assertMentions(f.llm.extracts[0].prompt, [PRECEDENTS_SAMPLE]);
    ok(f.llm.extracts[0].prompt.indexOf(PRECEDENTS_SAMPLE) < f.llm.extracts[0].prompt.indexOf("Inventory (anchor refs I<n>):"));
    assertMentions(text, ["precedents recalled: shop-mistake-20261022-n-plus-one"]);
  });

  it("no block and no line when nothing is recalled", async () => {
    // Arrange
    const f = setup();
    const precedents = new FakePrecedents();

    // Act
    const text = await runDevPlan({ source: "prune" }, { ...f.deps, precedents: precedents.recall });

    // Assert
    for (const e of f.llm.extracts) ok(!e.prompt.includes("## Precedents"));
    ok(!text.includes("precedents recalled"), text);
  });
});

describe("runDevPlan — the planner's answer", () => {
  it("asks once more with the problems of a refused answer, then writes", async () => {
    // Arrange
    const f = setup();
    const bad = { ...ANSWER, reuse: ["I9"] };
    f.llm.extractions = [bad, ANSWER, CLEAR];

    // Act
    await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 3);
    const second = f.llm.extracts[1].prompt;
    const asked = second.indexOf("Your previous answer was refused; fix each of these:\n- reuse: I9 is not an inventory entry shown");
    ok(asked > 0 && asked < second.indexOf("Source (spec)"), "the problems come before the material");
    ok(written(f).includes(PLAN));
    assertGuarded(f.files);
  });

  it("asks once more when an existing anchor is absent or a create anchor is present", async () => {
    // Arrange
    const f = setup();
    f.files.listings.set(`${WORKSPACE}/docs/fr`, []);
    f.files.listings.set(`${WORKSPACE}/src/shared/domain`, ["memory.ts", "memory-prune.ts"]);
    f.llm.extractions = [ANSWER, ANSWER];

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 2);
    assertMentions(f.llm.extracts[1].prompt, [
      "- B2 S1: docs/fr/commands.md does not exist",
      "- B1 S1: src/shared/domain/memory-prune.ts exists: anchor it as existing, or by its ref",
    ]);
    ok(text.startsWith("dev-plan: the plan was refused twice; nothing is written.\n  B1 S1: "), text);
    deepStrictEqual(written(f), []);
  });

  it("lists each anchor folder once for the run, though both attempts check the anchors", async () => {
    // Arrange
    const f = setup();
    f.files.listings.set(`${WORKSPACE}/docs/fr`, []);
    f.llm.extractions = [ANSWER, ANSWER];
    const listed = recordListings(f.files);

    // Act
    await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 2);
    assertMentions(f.llm.extracts[1].prompt, ["- B2 S1: docs/fr/commands.md does not exist"]);
    assertListedOnce(listed, [`${WORKSPACE}/src/shared/domain`, `${WORKSPACE}/docs`, `${WORKSPACE}/docs/fr`]);
  });

  it("writes nothing after two refusals, and lists 12 problems then the count", async () => {
    // Arrange
    const f = setup();
    f.llm.extractions = [new Error("not JSON"), FOURTEEN_UNKNOWN_REUSE];

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    deepStrictEqual(written(f), []);
    strictEqual(f.llm.acts.length, 0);
    assertMentions(f.llm.extracts[1].prompt, ["- the answer did not parse: not JSON"]);
    const lines = text.split("\n");
    strictEqual(lines[0], "dev-plan: the plan was refused twice; nothing is written.");
    strictEqual(lines.length, 14);
    strictEqual(lines[13], "  … 2 more");
  });
});

describe("runDevPlan — refusals before the model", () => {
  it("stops on a Blocking open question: no inventory, no extract, no write", async () => {
    // Arrange
    const f = setup("SPEC-blocked.md");
    f.files.listings.set(CODE, ["SPEC-prune.md"]);
    f.files.files.set(`${CODE}/SPEC-prune.md`, fixture("SPEC-blocked.md"));

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    ok(text.startsWith("dev-plan: workbench/prune/SPEC-prune.md has 4 open Blocking question(s); no plan is written."), text);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.index.calls, []);
    deepStrictEqual(written(f), []);
  });

  it("refuses an existing plan without --replace", async () => {
    // Arrange
    const f = setup();
    f.files.listings.set(CODE, ["SPEC-prune.md", "PRUNE-PLAN.md", "PRUNE-PLAN-F1.md"]);

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    strictEqual(text, "dev-plan: workbench/prune/PRUNE-PLAN.md exists: /dev-plan prune --replace writes a new plan over it (nothing is merged)");
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(written(f), []);
  });

  it("never replaces a plan whose work has started: a TDD line ticked", async () => {
    // Arrange
    const f = setup();
    withGoldenPlan(f, fixture("expected/PRUNE-PLAN-F1.md").replace("TDD: RED [ ] GREEN [ ]", "TDD: RED [x] GREEN [ ]"));

    // Act
    const text = await runDevPlan({ source: "prune", replace: true }, f.deps);

    // Assert
    strictEqual(text, STARTED_PLAN_TEXT);
    deepStrictEqual(written(f), []);
  });

  it("never replaces a plan whose work has started: a step box ticked", async () => {
    // Arrange
    const boxed = setup();
    boxed.files.listings.set(CODE, ["SPEC-prune.md", "PRUNE-PLAN.md"]);
    boxed.files.files.set(PLAN, fixture("expected/PRUNE-PLAN.md").replace("- [ ] 1. An entry", "- [x] 1. An entry"));

    // Act
    const text = await runDevPlan({ source: "prune", replace: true }, boxed.deps);

    // Assert
    assertMentions(text, ["records work done (step 1 of F1 is ticked)"]);
  });

  it("replaces an untouched plan with --replace", async () => {
    // Arrange
    const f = setup();
    withGoldenPlan(f);

    // Act
    const text = await runDevPlan({ source: "prune", replace: true }, f.deps);

    // Assert
    ok(text.startsWith("dev-plan: workbench/prune/PRUNE-PLAN.md — 2 batches"), text);
    assertGuarded(f.files);
  });

  it("refuses a replace with fewer batches before any write, naming the sheets to remove", async () => {
    // Arrange
    const f = setup();
    withThreeBatchPlan(f);

    // Act
    const text = await runDevPlan({ source: "prune", replace: true }, f.deps);

    // Assert
    strictEqual(text, FEWER_BATCHES_TEXT);
    deepStrictEqual(written(f), []);
    strictEqual(f.llm.acts.length, 0);
  });

  for (const c of REFUSALS) {
    it(`refuses bad inputs, another checkout, and a source with no id: ${c.name}`, async () => {
      // Arrange
      const f = setup();
      c.arrange(f);

      // Act
      const text = await runDevPlan(c.input, f.deps);

      // Assert
      strictEqual(text, c.text);
      deepStrictEqual(written(f), []);
    });
  }

  it("refuses a run when the code index cannot be built", async () => {
    // Arrange
    const f = setup();
    f.index.failure = new Error("store offline");

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    strictEqual(text, "dev-plan: the code index cannot be built (store offline): anchors would be guesses, so no plan is written");
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(written(f), []);
  });
});

describe("runDevPlan — a change brief", () => {
  it("refuses a brief whose title names no kind", async () => {
    // Arrange
    const f = setup("CHANGE-prune.md");
    f.files.files.set(`${CODE}/CHANGE-prune.md`, fixture("CHANGE-cache.md").replace("# cache — The symbol map is loaded on every call — refactor", "# prune — Load once"));

    // Act
    const text = await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    strictEqual(text, "dev-plan: workbench/prune/CHANGE-prune.md: the title names no kind (bug, refactor or perf)");
    deepStrictEqual(written(f), []);
  });

  it("gives the planner the pinned test and the rows to characterise, numbered", async () => {
    // Arrange
    const f = setup("CHANGE-prune.md");
    f.files.files.set(`${CODE}/CHANGE-prune.md`, fixture("CHANGE-cache.md"));
    f.llm.extractions = [{}];

    // Act
    await runDevPlan({ source: "prune" }, f.deps);

    // Assert
    assertMentions(f.llm.extracts[0].prompt, [
      "Source (change, refactor): workbench/prune/CHANGE-prune.md",
      "Pinned tests:\n- loads the cached map once",
      "U1 — an absent map file gives an empty map\nU2 — a malformed map file is reported, not thrown",
    ]);
    deepStrictEqual(written(f), []);
  });
});
