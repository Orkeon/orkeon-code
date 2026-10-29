// runDevImplement over FakeFiles, a scripted shell (git status from a fake tree, each test file red or
// green), two scripted roles that write into that tree, and fake shell jobs: the steps in order, the
// checks that stop a batch, the resume, the hand-over to /dev-verify, and the close. Run:
//   node --test tests/crews/dev-implement/application/run-dev-implement.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FakePrecedents } from "../../../support/doubles/fake-precedents.ts";
import { BATCHES_ACTIVE_RECORD } from "../../../../src/shared/domain/dev/batches-state.ts";
import { touchedPath, verdictMarkOf } from "../../../../src/crews/dev-implement/application/touched.ts";
import { implementInputs, runDevImplement } from "../../../../src/crews/dev-implement/application/run-dev-implement.ts";
import {
  ADD_AND_COMMIT, AFFECTED_RUN, assumesUniqueIds, atTheClose, AUTHOR_BOTH, authorLeavesOutput, blockedLine, closing, commitsAsAda,
  costIndex, CYCLE_RERUN, CYCLE_SHEET, DIR, DONE_SHEET, EXISTING_SHEET, F1, F1_FILES, FINDING, gaps, graphIndex, greenByItself,
  IMPLEMENTER_BOTH, implementerLeavesOutput, later, noGitIdentity, ONE_GAPS, ONE_STEP, ONE_STEP_CO_LOCATED, PACK_CO_LOCATED,
  PACK_WITH_BRANCH, PACK_WITH_PROJECT, PACK_WITHOUT_TESTS, parse, PROJECT_LEFT_OUT, pushes, recorded, rewritesA, setup, SHEET, SHEET_PATH,
  STALE, STALE_ENDING, STEP_1_DONE, stubsA, stubsTheModule, TICKED, ticksItsBox, touchedRecord, UNFINISHED, untidy, VALID, VERDICT_PATH, weakensTest,
  writesCode, writesFailingA, writesFailingAWithStub, writesOtherProduction, writesPassingTest, writesTest, writesTestOnly,
} from "./run-dev-implement.fixtures.ts";
import { assertBlockedSaying, assertBlockedStarting, assertLine, assertLineStarting, assertNoPrecedents, assertNotBlocked, assertPromptsEndWith, assertTicked } from "./run-dev-implement.assertions.ts";
import { assertMentions } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("runDevImplement — the steps", () => {
  it("runs every step RED then GREEN, ticks each box once seen, and hands over to the audit", async () => {
    // Arrange
    const t = setup(AUTHOR_BOTH, IMPLEMENTER_BOTH);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(a.next, { crew: "dev-verify", input: { batch: "F1", plan: "demo", mode: "fast" } });
    assertTicked(t.files.files.get(SHEET_PATH) ?? "", TICKED, 2);
    deepStrictEqual(t.jobs.started, ["npm run build", "npm test"]);
    strictEqual(t.shell.commands.filter((c) => c === "npm ci").length, 1); // restored once, for both steps
    deepStrictEqual(touchedRecord(t).touched, ["src/a.ts", "src/b.ts", "tests/a.test.ts", "tests/b.test.ts"]);
  });

  it("puts the whitespace git diff --check refuses right in the files a role changed, and says so", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [untidy]);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    strictEqual(t.files.files.get(`${WORKSPACE}/src/a.ts`), "export const a = 1;\n");
    strictEqual(t.files.files.get(`${WORKSPACE}/tests/a.test.ts`), "test tests/a.test.ts");
    assertLine(a, "whitespace ✓ — src/a.ts: trailing whitespace on 1 line, 2 blank lines at EOF removed");
    ok(!a.lines.some((l) => l.includes("whitespace ✓ — tests/a.test.ts")), a.lines.join("\n"));
  });

  it("gives each role its own tools in acceptEdits, and its brief", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")]);

    // Act
    await runDevImplement(F1, t.deps);

    // Assert
    const red = t.roles["test-author"].acts[0];
    const green = t.roles.implementer.acts[0];
    strictEqual(red.request.permissionMode, "acceptEdits");
    ok(red.request.tools?.includes("run_tests") && !red.request.tools?.includes("run_build"));
    ok(green.request.tools?.includes("run_build"));
    ok(red.prompt.includes("`does one`") && red.prompt.includes("node --test tests/a.test.ts"));
    ok(green.prompt.includes("not ok 1"));
    // Each brief carries the sheet; the implementer's carries the test file the test author wrote, the test
    // author's none (its file is to create).
    ok(red.prompt.includes("## In this brief (do not open these files again)\n### workbench/demo/DEMO-PLAN-F1.md\n```text\n# DEMO-PLAN-F1"), red.prompt);
    ok(!red.prompt.includes("### tests/a.test.ts"), red.prompt);
    ok(green.prompt.includes("### tests/a.test.ts\n```text\ntest tests/a.test.ts\n```"), green.prompt);
  });

  it("blocks a production write at RED outside the step's stubs, and ticks nothing", async () => {
    // Arrange
    const t = setup([writesOtherProduction], []);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    strictEqual(blockedLine(a), "BLOCKED — step 1 RED: a production path changed before a red test: src/other.ts" +
      " (log: workbench/demo/logs/F1-run_tests-1.log)");
    strictEqual(t.files.files.get(SHEET_PATH), SHEET);
    strictEqual(a.next, undefined);
  });

  it("blocks a RED whose tests pass at once", async () => {
    // Arrange
    const t = setup([writesPassingTest], []);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedStarting(a, "BLOCKED — step 1 RED: the new tests pass at once");
  });

  it("blocks a test write at GREEN, RED alone ticked", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [weakensTest]);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedStarting(a, "BLOCKED — step 1 GREEN: a test file changed while turning it green: tests/a.test.ts");
    ok((t.files.files.get(SHEET_PATH) ?? "").includes("TDD: RED [x] GREEN [ ] COST [ ]"));
  });

  it("asks once for a missing Cost line, and stops on a port call in a loop", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")],
      [writesCode("src/a.ts", "tests/a.test.ts", "no cost here"), () => "Cost: 9 reads, 0 writes; a read in a loop over entries"]);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedStarting(a, "BLOCKED — step 1 COST: a port call in a loop");
    deepStrictEqual(t.roles.implementer.acts[1].request.tools, []);
    ok((t.files.files.get(SHEET_PATH) ?? "").includes("TDD: RED [x] GREEN [x] COST [ ]"));
  });

  it("resumes at the first open step", async () => {
    // Arrange
    const t = setup([writesTest("tests/b.test.ts")], [writesCode("src/b.ts", "tests/b.test.ts")], STEP_1_DONE);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    strictEqual(t.roles["test-author"].acts.length, 1);
    ok(t.roles["test-author"].acts[0].prompt.includes("step 2"));
  });

  it("blocks a red suite with its log, and hands over nothing", async () => {
    // Arrange
    const t = setup(AUTHOR_BOTH, IMPLEMENTER_BOTH);
    t.jobs.exit["npm test"] = 1;

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedStarting(a, "BLOCKED — test: 'npm test' exited 1 (log: workbench/demo/logs/F1-test.txt)");
    ok((t.files.files.get(`${DIR}/logs/F1-test.txt`) ?? "").endsWith("exit=1\n"));
    strictEqual(a.next, undefined);
  });

  it("puts the sheet back and blocks when a role ticks a box itself", async () => {
    // Arrange
    const t = setup([ticksItsBox], []);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedStarting(a, "BLOCKED — step 1 RED: test-author changed the plan folder (workbench/demo/DEMO-PLAN-F1.md)");
    strictEqual(t.files.files.get(SHEET_PATH), SHEET);
  });

  it("keeps what a role's own test runs leave in the tree out of its changes", async () => {
    // Arrange
    const t = setup([authorLeavesOutput], [implementerLeavesOutput], ONE_STEP);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(touchedRecord(t).touched, ["src/a.ts", "tests/a.test.ts"]);
  });

  it("refuses a batch that is not F<n>", async () => {
    // Arrange
    const t = setup([], []);

    // Act
    const a = parse(await runDevImplement({ batch: "x" }, t.deps));

    // Assert
    assertBlockedSaying(a, "F<n>");
  });

  it("refuses a pack without layout.tests", async () => {
    // Arrange
    const t = setup([], []);
    t.files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, PACK_WITHOUT_TESTS);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedSaying(a, "layout.tests");
  });
});

describe("runDevImplement — the close", () => {
  it("refuses without a VALID verdict", async () => {
    // Arrange
    const t = atTheClose(SHEET, null);
    t.files.files.set(VERDICT_PATH, VALID.replace("VALID", "GAPS"));

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true }, t.deps));

    // Assert
    assertBlockedSaying(a, "not VALID: nothing is committed");
  });

  it("refuses a read-only session mode before anything is read or run", async () => {
    // Arrange
    const t = atTheClose(SHEET, null);

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true, permissionMode: "plan" }, t.deps));

    // Assert
    assertBlockedSaying(a, "the session mode plan is read-only");
    deepStrictEqual(t.shell.commands, []);
  });

  it("refuses when no file was recorded", async () => {
    // Arrange
    const t = atTheClose(SHEET, null);

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true }, t.deps));

    // Assert
    assertBlockedSaying(a, "no file recorded");
  });

  it("refuses a verdict not written since the last run changed the batch", async () => {
    // Arrange
    const t = atTheClose(DONE_SHEET, recorded(verdictMarkOf(VALID)));

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true }, t.deps));

    // Assert
    assertBlockedSaying(a, "audit it again");
  });

  it("refuses a sheet with a box still open", async () => {
    // Arrange
    const t = atTheClose(SHEET);

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true }, t.deps));

    // Assert
    assertBlockedSaying(a, "step 1, 2 of DEMO-PLAN-F1.md still has a TDD box open");
  });

  it("commits exactly the recorded files, nothing else of the tree", async () => {
    // Arrange
    const t = atTheClose();
    commitsAsAda(t);

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true }, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(t.shell.commands.filter((c) => c.includes(" add -- ") || c.includes(" commit ")), ADD_AND_COMMIT);
  });

  it("stops at git's missing identity, before any commit", async () => {
    // Arrange
    const t = atTheClose();
    noGitIdentity(t);

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true }, t.deps));

    // Assert
    ok(a.lines.some((l) => /identity|git config/i.test(l)), a.lines.join("\n"));
    strictEqual(t.shell.commands.some((c) => c.startsWith("git commit")), false);
  });
});

describe("runDevImplement — wave 4", () => {
  it("runs two steps on one test file as one cycle: both REDs, one GREEN, one Cost", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts"), rewritesA("test a, two")], [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    assertLine(a, "cycle 1/1 — steps 1-2 (tests/a.test.ts)");
    strictEqual(t.roles["test-author"].acts.length, 2);
    strictEqual(t.roles.implementer.acts.length, 1);
    ok(t.roles.implementer.acts[0].prompt.includes("does two"));
    ok(a.lines.some((l) => l.startsWith("steps 1-2 GREEN ✓")) && a.lines.some((l) => l.startsWith("steps 1-2 COST ✓")));
    assertTicked(t.files.files.get(SHEET_PATH) ?? "", TICKED, 2);
  });

  it("refuses a later RED of a cycle whose tests add no failure to the file's", async () => {
    // Arrange
    const t = setup([writesFailingA("test a", 1, "red"), rewritesA("test a, two passing at once")],
      [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedSaying(a, "step 2 RED: the new tests add no failure (failures 1 → 1)");
    strictEqual(t.roles.implementer.acts.length, 0);
  });

  it("on a rerun after BLOCKED, refuses a RED that adds no failure to the one an earlier step ticked", async () => {
    // Arrange
    const t = setup([rewritesA("test a, two passing at once")], [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_RERUN);
    t.tree.write("tests/a.test.ts", "test a");
    t.tree.failures.set("tests/a.test.ts", 1);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedSaying(a, "step 2 RED: the new tests add no failure (failures 1 → 1)");
    strictEqual(t.roles.implementer.acts.length, 0);
  });

  it("on a rerun after BLOCKED, takes the failures the ticked step left as the baseline, never the BLOCKED step's own", async () => {
    // Arrange
    // Step 2's tests, written before the run stopped, still fail: the suite counts 2, step 1's tick left 1.
    const t = setup([rewritesA("test a, two again")], [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_RERUN);
    t.tree.write("tests/a.test.ts", "test a, two");
    t.tree.failures.set("tests/a.test.ts", 2);
    t.files.files.set(`${DIR}/logs/F1-red-failures.json`, JSON.stringify({ 1: 1 }));

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    assertLine(a, "step 2 RED ✓ — tests/a.test.ts");
  });

  it("records the failures each ticked RED leaves, for a rerun's baseline", async () => {
    // Arrange
    const t = setup([writesFailingA("test a", 1, "red"), writesFailingA("test a, two", 2, "more")],
      [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);

    // Act
    await runDevImplement(F1, t.deps);

    // Assert
    deepStrictEqual(JSON.parse(t.files.files.get(`${DIR}/logs/F1-red-failures.json`) ?? "{}"), { 1: 1, 2: 2 });
  });

  it("accepts a later RED of a cycle that adds a failure", async () => {
    // Arrange
    const t = setup([writesFailingA("test a", 1, "red"), writesFailingA("test a, two", 2, "more")],
      [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    assertLine(a, "step 2 RED ✓ — tests/a.test.ts");
  });

  it("keeps a stub an earlier RED of the cycle wrote open to a later RED: its GREEN has not run", async () => {
    // Arrange
    const t = setup([
      writesFailingAWithStub("test a", "throw one", 1, "red"),
      writesFailingAWithStub("test a, two", "throw one, two", 2, "more"),
    ], [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_SHEET);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(t.roles["test-author"].acts.map((x) => x.writable), [["src/a.ts"], ["src/a.ts"]]);
    ok(t.roles["test-author"].acts[1].prompt.includes("hold no logic, in `src/a.ts`"), t.roles["test-author"].acts[1].prompt);
    assertLine(a, "step 2 RED ✓ — tests/a.test.ts (stubs: src/a.ts)");
  });

  it("on a rerun, keeps open the stub a RED-ticked step of the cycle wrote", async () => {
    // Arrange
    const t = setup([writesFailingAWithStub("test a, two", "throw one, two", 2, "more")],
      [writesCode("src/a.ts", "tests/a.test.ts")], CYCLE_RERUN);
    t.tree.write("tests/a.test.ts", "test a");
    t.tree.write("src/a.ts", "throw one");
    t.tree.failures.set("tests/a.test.ts", 1);
    t.files.files.set(touchedPath("demo", "F1"), recorded());

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(t.roles["test-author"].acts[0].writable, ["src/a.ts"]);
  });

  it("never leaves a `to create` file that exists already writable as a stub", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    t.files.files.set(`${WORKSPACE}/src/a.ts`, "export const one = () => 1;");

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(t.roles["test-author"].acts[0].writable, []);
  });

  it("lets the test author write the step's `to create` production files as stubs, and no other", async () => {
    // Arrange
    const t = setup([stubsA], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(t.roles["test-author"].acts[0].writable, ["src/a.ts"]);
    deepStrictEqual(t.roles.implementer.acts[0].writable, []);
    assertLine(a, "step 1 RED ✓ — tests/a.test.ts (stubs: src/a.ts)");
  });

  it("tells a co-located test file by the pack's layout.test_files", async () => {
    // Arrange
    const t = setup([writesTest("src/a.test.ts")], [writesCode("src/a.ts", "src/a.test.ts")], ONE_STEP_CO_LOCATED);
    t.files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, PACK_CO_LOCATED);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    assertLine(a, "step 1 RED ✓ — src/a.test.ts");
  });

  it("refuses GREEN when no file changed yet the tests turned green (m3)", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [greenByItself], ONE_STEP);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertBlockedSaying(a, "a test that turns green by itself is flaky");
  });

  it("writes a role's assumptions under ## Assumptions, to be validated by the user", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [assumesUniqueIds], ONE_STEP);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    ok((t.files.files.get(SHEET_PATH) ?? "").includes("| H1 | the ids are unique | the user |"));
  });

  it("appends a correction as a new step and runs it; the audit then resumes", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], DONE_SHEET);
    t.files.files.set(VERDICT_PATH, ONE_GAPS);

    // Act
    const a = parse(await runDevImplement({ ...F1, correction: FINDING }, t.deps));

    // Assert
    assertNotBlocked(a);
    assertLineStarting(a, "correction appended to DEMO-PLAN-F1.md as step 4");
    const sheet = t.files.files.get(SHEET_PATH) ?? "";
    ok(sheet.includes("### Step 4 — Correction C1 — Major Test: step 1 misses the empty case"), sheet);
    assertTicked(sheet, TICKED, 3);
    strictEqual(a.next?.input.mode, "resume");
    ok(t.roles["test-author"].acts[0].prompt.includes("step 1 misses the empty case"));
  });

  it("counts a budget-stopped audit as a round", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], DONE_SHEET);
    t.files.files.set(VERDICT_PATH, gaps("2026-10-24 10:00") + UNFINISHED);

    // Act
    const a = parse(await runDevImplement({ ...F1, correction: FINDING }, t.deps));

    // Assert
    assertNotBlocked(a);
    assertLine(a, "⚠ 2 audit rounds in GAPS: the third still GAPS goes to a human");
  });

  it("warns of the rounds of GAPS once two finished audits found gaps, an unfinished one between them", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], DONE_SHEET);
    t.files.files.set(VERDICT_PATH, gaps("2026-10-24 10:00") + UNFINISHED + gaps("2026-10-24 12:00"));

    // Act
    const a = parse(await runDevImplement({ ...F1, correction: FINDING }, t.deps));

    // Assert
    assertNotBlocked(a);
    strictEqual(a.lines.some((l) => l.includes("audit rounds in GAPS")), true);
  });

  it("T3: recalls before each red act, the block after the test author's contract, none in the implementer's; named at the end", async () => {
    // Arrange
    const t = setup(AUTHOR_BOTH, IMPLEMENTER_BOTH);
    const precedents = new FakePrecedents();
    precedents.blocks.set("T3", { block: "## Precedents\nT3 block", ids: ["shop-mistake-20261022-x"] });
    t.deps.precedents = precedents.recall;

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(precedents.calls.map((c) => c.trigger), ["T3", "T3"]);
    ok(precedents.calls[0].query.startsWith("DEMO-PLAN-F1"), precedents.calls[0].query);
    assertPromptsEndWith(t.roles["test-author"].acts, "## Precedents\nT3 block");
    assertNoPrecedents(t.roles.implementer.acts);
    assertLine(a, "precedents recalled: shop-mistake-20261022-x");
  });

  it("T3: no block and no line when nothing is recalled", async () => {
    // Arrange
    const t = setup(AUTHOR_BOTH, IMPLEMENTER_BOTH);
    t.deps.precedents = new FakePrecedents().recall;

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNoPrecedents([...t.roles["test-author"].acts, ...t.roles.implementer.acts]);
    ok(!a.lines.some((l) => l.startsWith("precedents recalled")), a.lines.join("\n"));
  });

  it("T5: a correction recalls mistakes from its finding, the block in both roles' prompts", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], DONE_SHEET);
    const precedents = new FakePrecedents();
    precedents.blocks.set("T5", { block: "## Precedents\nT5 block", ids: ["shop-mistake-20261022-empty"] });
    t.deps.precedents = precedents.recall;

    // Act
    const a = parse(await runDevImplement({ ...F1, correction: FINDING }, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(precedents.calls[0], { trigger: "T5", query: "Major Test: step 1 misses the empty case" });
    ok(t.roles["test-author"].acts[0].prompt.includes("## Precedents\nT5 block"));
    ok(t.roles.implementer.acts[0].prompt.includes("## Precedents\nT5 block"));
    assertLine(a, "precedents recalled: shop-mistake-20261022-empty");
  });

  it("refuses a correction naming an id the sheet does not carry", async () => {
    // Arrange
    const t = setup([], []);

    // Act
    const a = parse(await runDevImplement({ ...F1, correction: "Major Scope: BR-99 is missing" }, t.deps));

    // Assert
    assertBlockedStarting(a, "BLOCKED — correction:");
    assertBlockedSaying(a, "/dev-change");
    strictEqual(t.files.files.get(SHEET_PATH), SHEET);
  });

  it("runs the affected projects once the whole suite went green for the batch", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    t.files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, PACK_WITH_PROJECT);
    t.files.files.set(touchedPath("demo", "F1"), JSON.stringify({ touched: [], verdictMark: "none", suiteGreen: true }));

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(t.jobs.started, ["npm run build", "node --test tests"]);
    ok((t.files.files.get(`${DIR}/logs/F1-test-affected.txt`) ?? "").endsWith("exit=0\n"));
    strictEqual(touchedRecord(t).suiteGreen, true);
  });

  it("records the whole suite green, and empties the affected log", async () => {
    // Arrange
    const t = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);

    // Act
    const a = parse(await runDevImplement({ ...F1, githubTool: true, permissionMode: "default", permissionRules: ["deny git_push"] }, t.deps));

    // Assert
    assertNotBlocked(a);
    strictEqual(t.files.files.get(`${DIR}/logs/F1-test-affected.txt`), "");
    ok((t.files.files.get(`${DIR}/logs/F1-build.txt`) ?? "").endsWith("exit=0\n"));
    const record = touchedRecord(t);
    strictEqual(record.suiteGreen, true);
    deepStrictEqual(record.pr, { githubTool: true, permissionMode: "default", permissionRules: ["deny git_push"] });
  });

  it("measures the cycle's cost: flagged sends it back to /dev-plan", async () => {
    // Arrange
    const flagged = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    flagged.deps.costIndex = costIndex(true);

    // Act
    const a = parse(await runDevImplement(F1, flagged.deps));

    // Assert
    assertBlockedSaying(a, "COST: measured Cost: 1 read", "back to /dev-plan");
    ok(flagged.shell.commands.includes("git diff -U0 HEAD -- 'src/a.ts'"));
    ok((flagged.files.files.get(SHEET_PATH) ?? "").includes("TDD: RED [x] GREEN [x] COST [ ]"));
  });

  it("measures the cycle's cost: clean is said beside the stated line", async () => {
    // Arrange
    const clean = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);
    clean.deps.costIndex = costIndex(false);

    // Act
    const b = parse(await runDevImplement(F1, clean.deps));

    // Assert
    assertNotBlocked(b);
    assertLineStarting(b, "step 1 COST ✓ — Cost: 1 reads, 0 writes; none; measured: Cost: 1 read");
  });

  it("measures the cycle's cost: without an index, says it was not computed", async () => {
    // Arrange
    const none = setup([writesTest("tests/a.test.ts")], [writesCode("src/a.ts", "tests/a.test.ts")], ONE_STEP);

    // Act
    const c = parse(await runDevImplement(F1, none.deps));

    // Assert
    ok(c.lines.some((l) => l.includes("; measured: not computed — ")), c.lines.join("\n"));
  });

  it("refreshes the batch's files in the index, then adds the graph's test projects to the sheet's", async () => {
    // Arrange
    const index = graphIndex([`${WORKSPACE}/`], { projects: ["tests/integration", "tests", "a;b"], classes: ["A"] });
    const t = later(index);

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    assertNotBlocked(a);
    deepStrictEqual(index.refreshed.at(-1), F1_FILES);
    // affected_tests looks each file up under the indexed root: relative paths, never absolute ones.
    deepStrictEqual(index.asked, [["src/a.ts", "tests/a.test.ts"]]);
    assertLine(a, PROJECT_LEFT_OUT);
    assertLine(a, "index: 2 files of F1 refreshed");
    deepStrictEqual(t.jobs.started, ["npm run build", "node --test tests", "node --test tests/integration"]);
    assertLineStarting(a, AFFECTED_RUN);
  });

  it("runs the whole suite again when the graph reaches every test", async () => {
    // Arrange
    const t = later(graphIndex([WORKSPACE], { all: true }));

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    deepStrictEqual(t.jobs.started, ["npm run build", "npm test"]);
    assertLineStarting(a, "test ✓ — npm test (the whole suite again: the graph reaches every test from these changes)");
  });

  it("refreshes the index before the build, so a red build leaves no stale graph", async () => {
    // Arrange
    const index = graphIndex([WORKSPACE], {});
    const t = later(index);
    t.jobs.exit["npm run build"] = 1;

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    ok(blockedLine(a) !== undefined, a.lines.join("\n"));
    deepStrictEqual(index.refreshed.at(-1), F1_FILES);
    assertLine(a, "index: 2 files of F1 refreshed");
  });

  it("names the files the graph could not place when it falls back to the whole suite", async () => {
    // Arrange
    const t = later(graphIndex([WORKSPACE], { all: true, unresolved: ["src/a.ts"] }));

    // Act
    const a = parse(await runDevImplement(F1, t.deps));

    // Assert
    deepStrictEqual(t.jobs.started, ["npm run build", "npm test"]);
    assertLineStarting(a, "test ✓ — npm test (the whole suite again: the graph could not place src/a.ts)");
  });

  it("keeps the sheet's projects alone when the index is absent, and says so", async () => {
    // Arrange
    const absent = later(graphIndex([], { projects: ["tests/integration"] }));

    // Act
    const a = parse(await runDevImplement(F1, absent.deps));

    // Assert
    assertLine(a, `index: not refreshed — ${WORKSPACE} is not indexed`);
    deepStrictEqual(absent.jobs.started, ["npm run build", "node --test tests"]);
  });

  it("keeps the sheet's projects alone when the graph fails, and says so", async () => {
    // Arrange
    const failing = later(graphIndex([WORKSPACE], new Error("graph down\nmore")));

    // Act
    const b = parse(await runDevImplement(F1, failing.deps));

    // Assert
    assertLine(b, "affected tests: the graph was not read — graph down; the sheet's projects alone");
    deepStrictEqual(failing.jobs.started, ["npm run build", "node --test tests"]);
  });

  it("restores once, before any act, and logs it (run_build's `restored` is wrapped-tools.test.ts's)", async () => {
    // Arrange
    const t = setup([writesTestOnly], [], ONE_STEP);

    // Act
    await runDevImplement(F1, t.deps);

    // Assert
    ok((t.files.files.get(`${DIR}/logs/F1-restore.txt`) ?? "").startsWith("# $ npm ci\n"));
    strictEqual(t.shell.commands.filter((c) => c === "npm ci").length, 1);
  });
});

describe("runDevImplement — the close marks and the branch", () => {
  it("marks the sheet and the plan's batch done once committed, the context read back from the record", async () => {
    // Arrange
    const t = closing("feat/demo");

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true, push: false }, t.deps));

    // Assert
    assertNotBlocked(a);
    ok((t.files.files.get(SHEET_PATH) ?? "").startsWith("# DEMO-PLAN-F1 — Demo — done (2026-10-24)\n"));
    const plan = t.files.files.get(`${DIR}/DEMO-PLAN.md`) ?? "";
    ok(plan.includes("### Batch F1 — Demo — done (2026-10-24)\n- [x] 1. One\n- [x] 2. Two"), plan);
    ok(plan.includes("### Batch F2 — Next — open\n- [ ] 1. Later"));
    deepStrictEqual(t.contexts, [{ githubTool: true, permissionMode: "default", permissionRules: [] }]);
  });

  it("commits a batch /dev-batches closes without pushing it, the crew's inputs keeping its push: false (L-7)", async () => {
    // Arrange
    // The input /dev-batches launches for a VALID batch (commands-dev-batches.test.ts, "closes a VALID batch
    // without pushing it"), read as the crew reads its inputs.
    const launched = { batch: "F1", plan: "demo", close: true, push: false };
    const batches = closing("feat/demo");

    // Act
    const a = parse(await runDevImplement(implementInputs(launched), batches.deps));

    // Assert
    assertLineStarting(a, "✓ committed ");
    deepStrictEqual(pushes(batches), []);
    ok(!a.lines.some((l) => l.includes("pushed") || l.includes("gh pr create")), a.lines.join("\n"));
  });

  it("still pushes a typed --close, the sheet's assumptions in the pull request's body", async () => {
    // Arrange
    const typed = closing("feat/demo");
    typed.files.files.set(SHEET_PATH, `${typed.files.files.get(SHEET_PATH)!}\n## Assumptions\n| H1 | ids are stable | the user |\n`);

    // Act
    await runDevImplement(implementInputs({ batch: "F1", plan: "demo", close: true }), typed.deps);

    // Assert
    deepStrictEqual(pushes(typed), ["git push -u origin 'feat/demo'"], "a typed --close still pushes");
    const body = typed.files.writes.find((w) => w.path.endsWith("/PR.md"))?.content ?? "";
    ok(body.includes("| H1 | ids are stable | the user |"), "the sheet's assumptions reach the pull request's body");
  });

  it("reads the stale lines of its input", () => {
    // Arrange
    const args = { batch: "F1", stale: [...STALE, 7] };

    // Act
    const inputs = implementInputs(args);

    // Assert
    deepStrictEqual(inputs.stale, STALE);
  });

  it("ends the prompts of both roles with the stale lines of its launch", async () => {
    // Arrange
    const t = setup(AUTHOR_BOTH, IMPLEMENTER_BOTH);

    // Act
    const a = parse(await runDevImplement({ ...F1, stale: STALE }, t.deps));

    // Assert
    assertNotBlocked(a);
    assertPromptsEndWith([...t.roles["test-author"].acts, ...t.roles.implementer.acts], STALE_ENDING);
  });

  it("reads a push given as the text false as no push", () => {
    // Arrange
    const args = { push: "false" };

    // Act
    const inputs = implementInputs(args);

    // Assert
    strictEqual(inputs.push, false);
  });

  it("commits a typed close without pushing while a /dev-batches run of its plan is in progress", async () => {
    // Arrange
    const inRun = closing("feat/demo");
    inRun.files.files.set(BATCHES_ACTIVE_RECORD, JSON.stringify({ code: "demo", pr: false, context: {} }));

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true }, inRun.deps));

    // Assert
    assertLine(a, "not pushed: /dev-batches demo is in progress, its close pushes the plan's branch once");
    assertLineStarting(a, "✓ committed ");
    deepStrictEqual(pushes(inRun), []);
  });

  it("pushes a typed close while a /dev-batches run of another plan is in progress", async () => {
    // Arrange
    const other = closing("feat/demo");
    other.files.files.set(BATCHES_ACTIVE_RECORD, JSON.stringify({ code: "another", pr: false, context: {} }));

    // Act
    await runDevImplement({ ...F1, close: true }, other.deps);

    // Assert
    deepStrictEqual(pushes(other), ["git push -u origin 'feat/demo'"], "another plan's run changes nothing");
  });

  it("creates the work branch on the default branch when the pack asks for one", async () => {
    // Arrange
    const t = closing("main", PACK_WITH_BRANCH);

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true, push: false }, t.deps));

    // Assert
    assertNotBlocked(a);
    ok(t.shell.commands.includes("git switch -c 'feature/demo-f1'"), t.shell.commands.join("\n"));
    ok(a.lines.some((l) => l.startsWith("✓ branch feature/demo-f1 created from main")));
  });

  it("stops when that branch exists already", async () => {
    // Arrange
    const t = closing("main", PACK_WITH_BRANCH);
    t.shell.results["git rev-parse --verify --quiet 'refs/heads/feature/demo-f1'"] = { exitCode: 0, stdout: "abc\n" };

    // Act
    const a = parse(await runDevImplement({ ...F1, close: true, push: false }, t.deps));

    // Assert
    assertBlockedSaying(a, "the branch feature/demo-f1 exists already");
    strictEqual(t.shell.commands.some((c) => c.includes(" commit ")), false);
  });
});

describe("runDevImplement — the files a role gets", () => {
  it("opens an existing production file of the step to the test author, for a missing declaration's stub", async () => {
    // Arrange
    const t = setup(AUTHOR_BOTH, IMPLEMENTER_BOTH, EXISTING_SHEET);

    // Act
    await runDevImplement(F1, t.deps);

    // Assert
    deepStrictEqual(t.roles["test-author"].acts[0].writable, ["src/a.ts"]);
  });

  it("carries to the implementer the stub RED wrote, shown as existing", async () => {
    // Arrange
    const t = setup([stubsTheModule, writesTest("tests/b.test.ts")], IMPLEMENTER_BOTH);

    // Act
    await runDevImplement(F1, t.deps);

    // Assert
    const green = t.roles.implementer.acts[0].prompt;
    assertMentions(green, ["### src/a.ts\n```text\nthrow one\n```", "- `src/a.ts` — existing (stubbed at RED), in this brief"]);
  });
});
