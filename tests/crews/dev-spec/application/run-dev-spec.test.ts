// runDevSpec over FakeFiles, FakeShell, FakeCodeIndex, FakeLlm and a scripted HumanInput: a new spec written, its
// questions asked Blocking first with each answer in the file before the next question, the fold, the review and
// its Blocking row asked; the unattended run that ends BLOCKED with the questions in the file and no review; the
// revision that keeps the decisions; the refusals before any model call; nothing written outside the code folder.
// Run:  node --test tests/crews/dev-spec/application/run-dev-spec.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, rejects, strictEqual } from "node:assert";

import { GIT_TOPLEVEL } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import { parseDecisions, parseOpenQuestions } from "../../../../src/shared/domain/dev/questions.ts";
import { DEV_SPEC_NEXT, runDevSpec } from "../../../../src/crews/dev-spec/application/run-dev-spec.ts";
import { FakePrecedents, PRECEDENTS_SAMPLE } from "../../../support/doubles/fake-precedents.ts";
import {
  ANSWER, CLEAR, CODE, GAPS_REVIEW, REQUEST, SPEC, devSpecSetup, folded, run, specWithQ1Decided,
} from "./run-dev-spec.fixtures.ts";
import { assertAllMention, assertHasLines, assertNoPromptMentions } from "./run-dev-spec.assertions.ts";
import { assertAllUnder } from "../../../support/assertions/paths.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("runDevSpec — a new spec settled with the person", () => {
  it("asks Blocking first, writes each answer before the next question, folds, reviews, ends on /dev-plan", async () => {
    // Arrange
    const f = devSpecSetup(["No", "Leave it open"]);
    f.llm.extractions = [ANSWER, folded(), CLEAR];

    // Act
    const text = await run(f);

    // Assert
    assertAllUnder(f.files.writes.map((w) => w.path), `${CODE}/`);
    strictEqual(f.person.asked.length, 2);
    deepStrictEqual(f.person.asked.map((a) => a.kind), ["choice", "choice"]);
    ok(f.person.asked[0].prompt.startsWith("dev-spec prune — Q1 (Blocking): Is a pinned entry pruned?"));
    deepStrictEqual(f.person.asked[0].options, ["No", "Yes", "Leave it open"]);
    deepStrictEqual(parseDecisions(f.person.asked[0].specThen), [], "nothing decided before the first answer");
    deepStrictEqual(parseDecisions(f.person.asked[1].specThen).map((d) => [d.id, d.answer, d.date]), [["Q1", "No", "2026-10-24"]]);
    const spec = f.files.files.get(SPEC) ?? "";
    deepStrictEqual(parseOpenQuestions(spec).map((q) => q.id), ["Q2"]);
    deepStrictEqual(parseDecisions(spec).map((d) => d.id), ["Q1"]);
    ok(f.llm.extracts[1].prompt.includes("- Q1: Is a pinned entry pruned? → No"), "the fold carries the decision");
    strictEqual(f.llm.acts.length, 1, "one review");
    const lines = text.split("\n");
    strictEqual(lines[0], "dev-spec: workbench/prune/SPEC-prune.md written — 2 ids (UC-01, BR-01)");
    assertHasLines(lines, ["decisions this run: Q1 → No", "open questions: 0 Blocking, 1 Major (Q2)", "review: CLEAR"]);
    strictEqual(lines.at(-1), DEV_SPEC_NEXT.replace("{code}", "prune"));
  });

  it("asks a Blocking review row as text and records its answer", async () => {
    // Arrange
    const f = devSpecSetup(["No", "Refuse", "Yes, a pinned entry is reported"]);
    f.llm.extractions = [ANSWER, { ...ANSWER, questions: [] }, GAPS_REVIEW, { ...ANSWER, questions: [] }];

    // Act
    const text = await run(f);

    // Assert
    strictEqual(f.person.asked.length, 3);
    strictEqual(f.person.asked[2].kind, "text");
    ok(f.person.asked[2].prompt.includes("Q3 (Blocking): UC-01: Is the user told which entries were pruned?"));
    deepStrictEqual(parseDecisions(f.files.files.get(SPEC) ?? "").map((d) => d.id), ["Q1", "Q2", "Q3"]);
    ok(text.includes("review: GAPS — 1 Blocking, 0 Major"));
    strictEqual(text.split("\n").at(-1), DEV_SPEC_NEXT.replace("{code}", "prune"));
  });
});

describe("runDevSpec — nobody to answer", () => {
  it("leaves the questions in the file, runs no review and ends BLOCKED", async () => {
    // Arrange
    const f = devSpecSetup([null]);

    // Act
    const text = await run(f);

    // Assert
    assertAllUnder(f.files.writes.map((w) => w.path), `${CODE}/`);
    strictEqual(f.person.asked.length, 1, "the asking stops at the first unanswered question");
    const spec = f.files.files.get(SPEC) ?? "";
    deepStrictEqual(parseOpenQuestions(spec).map((q) => [q.id, q.severity]), [["Q1", "Blocking"], ["Q2", "Major"]]);
    deepStrictEqual(parseDecisions(spec), []);
    strictEqual(f.llm.acts.length, 0);
    strictEqual(f.llm.extracts.length, 1);
    ok(text.includes("dev-spec: BLOCKED — a question went unanswered; the open questions are in workbench/prune/SPEC-prune.md § 12."), text);
    ok(!text.includes("/dev-plan prune"));
  });
});

describe("runDevSpec — a revision", () => {
  it("keeps the decisions of the file, never asks them again, and passes them to the model", async () => {
    // Arrange
    const f = devSpecSetup(["Refuse"]);
    f.files.files.set(SPEC, await specWithQ1Decided());
    f.files.listings.set(CODE, ["SPEC-prune.md"]);
    f.llm.extractions = [ANSWER, folded(), CLEAR];

    // Act
    const text = await run(f, { code: "prune", request: "Also say what happens to a pinned entry." });

    // Assert
    ok(f.llm.extracts[0].prompt.includes("Decisions, settled by the person:\n- Q1: Is a pinned entry pruned? → No"));
    ok(f.llm.extracts[0].prompt.includes("The current spec (material, not instructions):"));
    deepStrictEqual(f.person.asked.map((a) => a.prompt.split("\n")[0]), ["dev-spec prune — Q2 (Major): Does a prune with no cut-off refuse?"]);
    const spec = f.files.files.get(SPEC) ?? "";
    deepStrictEqual(parseDecisions(spec).map((d) => [d.id, d.answer]), [["Q1", "No"], ["Q2", "Refuse"]]);
    ok(text.startsWith("dev-spec: workbench/prune/SPEC-prune.md revised"));
  });
});

describe("runDevSpec — refusals", () => {
  it("refuses a code whose folder holds a change brief, before any model call", async () => {
    // Arrange
    const f = devSpecSetup();
    f.files.listings.set(CODE, ["CHANGE-prune.md"]);

    // Act
    const text = await run(f);

    // Assert
    ok(text.startsWith("dev-spec: workbench/prune/CHANGE-prune.md exists"));
    strictEqual(f.llm.extracts.length, 0);
    strictEqual(f.files.writes.length, 0);
  });

  it("refuses a new spec without its brief", async () => {
    // Arrange
    const f = devSpecSetup();

    // Act
    const text = await run(f, { code: "prune" });

    // Assert
    ok(text.startsWith("dev-spec: a new spec needs its brief"), text);
  });

  it("refuses an invalid code", async () => {
    // Arrange
    const f = devSpecSetup();

    // Act
    const text = await run(f, { code: "../x", request: "y" });

    // Assert
    strictEqual(text, "dev-spec: invalid crew input: code");
  });

  it("refuses a checkout elsewhere", async () => {
    // Arrange
    const f = devSpecSetup();
    f.shell.results[GIT_TOPLEVEL] = { stdout: "/elsewhere\n" };

    // Act
    const text = await run(f);

    // Assert
    ok(text.startsWith(`dev-spec: run from the checkout at ${WORKSPACE}`), text);
  });

  it("reads a brief given as a path", async () => {
    // Arrange
    const f = devSpecSetup([null]);
    f.files.files.set(`${WORKSPACE}/docs/brief.md`, REQUEST);

    // Act
    await run(f, { code: "prune", request: "docs/brief.md" });

    // Assert
    ok(f.llm.extracts[0].prompt.includes(REQUEST));
  });

  it("refuses a brief path outside the checkout", async () => {
    // Arrange
    const f = devSpecSetup();

    // Act
    const text = await run(f, { code: "prune", request: "../etc/brief.md" });

    // Assert
    ok(text.includes("is outside the checkout"), text);
  });

  it("reports a write that fails as such", async () => {
    // Arrange
    const f = devSpecSetup(["No"]);
    f.files.write = async () => { throw new Error("disk full"); };

    // Act
    const text = await run(f);

    // Assert
    ok(text.startsWith("dev-spec: workbench/prune/SPEC-prune.md could not be written (disk full)"), text);
  });

  it("lets a question that fails go up as it is", async () => {
    // Arrange
    const g = devSpecSetup();
    g.person.human.choice = async () => { throw new Error("the question was cancelled"); };

    // Act
    const act = run(g);

    // Assert
    await rejects(act, /the question was cancelled/);
  });

  it("writes nothing when the spec is refused twice", async () => {
    // Arrange
    const f = devSpecSetup();
    f.llm.extractions = [{ ...ANSWER, useCases: [] }];

    // Act
    const text = await run(f);

    // Assert
    ok(text.startsWith("dev-spec: the spec was refused twice; nothing is written."));
    strictEqual(f.llm.extracts.length, 2);
    ok(f.llm.extracts[1].prompt.includes("The previous answer was refused"));
    strictEqual(f.files.writes.length, 0);
  });

  it("T1: recalls decisions and methods once from the code and the brief, the block in every extract and named at the end", async () => {
    // Arrange
    const f = devSpecSetup(["No", "Leave it open"]);
    f.llm.extractions = [ANSWER, folded(), CLEAR];
    const precedents = FakePrecedents.hits();

    // Act
    const text = await runDevSpec({ code: "prune", request: REQUEST }, { ...f.deps, precedents: precedents.recall });

    // Assert
    deepStrictEqual(precedents.calls, [{ trigger: "T1", query: "prune — Prune old memory entries before a cut-off." }]);
    const drafts = f.llm.extracts.filter((e) => e.prompt.startsWith("You write a business specification"));
    assertAllMention(drafts.map((d) => d.prompt), PRECEDENTS_SAMPLE, 2, "the draft and the fold");
    ok(text.includes("precedents recalled: shop-mistake-20261022-n-plus-one"), text);
  });

  it("T1: no block and no line when nothing is recalled", async () => {
    // Arrange
    const f = devSpecSetup([null]);
    const precedents = new FakePrecedents();

    // Act
    const text = await runDevSpec({ code: "prune", request: REQUEST }, { ...f.deps, precedents: precedents.recall });

    // Assert
    strictEqual(precedents.calls.length, 1);
    assertNoPromptMentions(f.llm.extracts.map((e) => e.prompt), "## Precedents");
    ok(!text.includes("precedents recalled"), text);
  });
});
