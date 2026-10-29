// runDevBatches over the fixture work folder tests/fixtures/dev/workbench/demo/ (F1 done, F2 after F1,
// F3 alone), FakeFiles and a scripted git: the run record, the launch of the next batch, the log, the
// resume after a kill, a stop, the review of a batch whose dependencies closed, and the close of the
// plan with one push and one pull request. Run:
//   node --test tests/crews/dev-batches/application/run-dev-batches.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { gitPushCommand, gitPushedCheckCommand } from "../../../../src/shared/domain/git/close.ts";
import { appendToLog, closedLine } from "../../../../src/crews/dev-batches/domain/batches-log.ts";
import { ACTIVE_RECORD, batchesBranchName } from "../../../../src/crews/dev-batches/application/run-dev-batches.ts";
import {
  ASKING_MODES, BACK_FROM_F3, BAD_CONCURRENCIES, BRANCH_NAMES, BRANCH_PACK, BUDGET_STOPPED_AUDIT, F1_SHOW, F2_LAST_FINDING,
  F2_REVIEW_BRIEF, F2_STALE_LINE, FEAT_DEMO_EXISTS, GAPS_HUMAN_LINE, IN_PROGRESS_LINE, KEPT_F2_LINE, LOG, NO_REVIEWER_LINE,
  PR_ASSUMPTIONS, REPO_YAML, THREE_BATCH_RUNS, VALID_F2, VERDICT_F2,
  addGapsAudit, addUnfinishedAudit, beforeTheClose, blockingReviewer, clearReviewer, events, majorReviewer, markDone, mergedDetails,
  packedOnMain, parallelRecord, parallelSetup, prBody, pushes, record, reopenF1, run, setup, threeBatchesAfter, unparsableReviewer,
  FRESH_SESSION,
} from "./run-dev-batches.fixtures.ts";
import { assertHasLine, assertLastLineStarting, assertLastLineWith, assertLineWith, assertNoLineWith } from "./run-dev-batches.assertions.ts";
import { assertLineStarting, assertMentions } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("runDevBatches — a run", () => {
  it("records the run, logs the next batch launched and names it for /dev-implement with the dispatch's context", async () => {
    // Arrange
    const { files, deps } = setup();
    const input = { code: "demo", pr: true, permissionMode: "default", permissionRules: ["Bash(git push*)"], githubTool: true, hooks: [], effort: "high" };

    // Act
    const out = await run(input, deps);

    // Assert
    strictEqual(out.next?.crew, "dev-implement");
    deepStrictEqual(out.next?.input, {
      batch: "F2", plan: "demo", hooks: [], effort: "high", permissionMode: "default", permissionRules: ["Bash(git push*)"],
      githubTool: false, steps: 2,
    });
    assertHasLine(out.lines, "review of F2: CLEAR");
    assertLineStarting(out.lines, "→ F2 launched (2/3)");
    deepStrictEqual(events(files), ["F2 launched"]);
    const saved = record(files);
    deepStrictEqual([saved.code, saved.pr, saved.context.effort], ["demo", true, "high"]);
  });

  it("says when there is no run record to go on with", async () => {
    // Arrange
    const { deps } = setup();

    // Act
    const out = await run({}, deps);

    // Assert
    deepStrictEqual(out.lines, ["no /dev-batches run to go on with: /dev-batches <code>"]);
  });

  it("goes on without a code from the run record", async () => {
    // Arrange
    const { deps } = setup();
    await run({ code: "demo", effort: "low" }, deps);

    // Act
    const again = await run({}, deps);

    // Assert
    strictEqual(again.next?.input.batch, "F2");
    strictEqual(again.next?.input.effort, "low");
  });

  it("refuses another plan while a run is in progress, its record kept", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);

    // Act
    const out = await run({ code: "other" }, deps);

    // Assert
    deepStrictEqual(out.lines, [IN_PROGRESS_LINE]);
    strictEqual(record(files).code, "demo");
  });

  it("does not refuse another plan over a record whose run's log is closed", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);
    files.files.set(LOG, appendToLog(null, "demo", [closedLine(new Date(Date.UTC(2026, 9, 24, 10)))]));

    // Act
    const out = await run({ code: "other" }, deps);

    // Assert
    assertNoLineWith(out.lines, "is in progress");
    assertLastLineStarting(out.lines, "BLOCKED — no plan under workbench/other/");
  });

  it("refuses a read-only session mode", async () => {
    // Arrange
    const { deps } = setup();

    // Act
    const out = await run({ code: "demo", permissionMode: "plan" }, deps);

    // Assert
    assertLastLineStarting(out.lines, "BLOCKED — the session mode plan");
  });

  it("refuses a code that is not a folder name", async () => {
    // Arrange
    const { deps } = setup();

    // Act
    const out = await run({ code: "../x" }, deps);

    // Assert
    ok(out.lines[0].startsWith("BLOCKED — '../x' is not a work code"), out.lines.join("\n"));
  });

  it("runs concurrency 1 as the sequential run", async () => {
    // Arrange
    const plain = setup();
    const sequential = await run({ code: "demo" }, plain.deps);
    const one = setup();

    // Act
    const out = await run({ code: "demo", concurrency: 1 }, one.deps);

    // Assert
    deepStrictEqual(out, sequential);
    ok(!("concurrency" in (out.next?.input ?? {})));
    ok(!("concurrency" in record(one.files).context));
  });

  for (const concurrency of BAD_CONCURRENCIES) {
    it(`refuses a concurrency of ${JSON.stringify(concurrency)} before reading or writing anything`, async () => {
      // Arrange
      const { files, shell, deps } = setup();
      const before = new Map(files.files);

      // Act
      const refused = await run({ code: "demo", concurrency }, deps);

      // Assert
      strictEqual(refused.lines.length, 1);
      ok(refused.lines[0].startsWith("BLOCKED — concurrency "), refused.lines[0]);
      strictEqual(refused.next, undefined);
      deepStrictEqual(files.files, before);
      deepStrictEqual(shell.commands, []);
    });
  }

  it("killed during a batch and run again, relaunches the first batch not done, without a second review", async () => {
    // Arrange
    const { files, deps } = setup();
    const llm = clearReviewer();
    await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });
    const reviewsAtTheKill = llm.acts.length;

    // Act
    const again = await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });

    // Assert
    strictEqual(reviewsAtTheKill, 1);
    strictEqual(again.next?.input.batch, "F2");
    assertLineStarting(again.lines, "→ F2 relaunched");
    strictEqual(llm.acts.length, 1);
    deepStrictEqual(events(files), ["F2 launched", "F2 relaunched"]);
  });
});

describe("runDevBatches — back from a batch", () => {
  it("launches F1 first when the plan's three batches are open", async () => {
    // Arrange
    const at = await threeBatchesAfter(0);

    // Act
    const first = await run(THREE_BATCH_RUNS[0].input, at.deps);

    // Assert
    strictEqual(first.next?.input.batch, "F1");
  });

  it("launches F2 once F1 is committed", async () => {
    // Arrange
    const at = await threeBatchesAfter(1);

    // Act
    const second = await run(THREE_BATCH_RUNS[1].input, at.deps);

    // Assert
    strictEqual(second.next?.input.batch, "F2");
  });

  it("launches F3 once F2 is committed, F2 said done and committed", async () => {
    // Arrange
    const at = await threeBatchesAfter(2);

    // Act
    const third = await run(THREE_BATCH_RUNS[2].input, at.deps);

    // Assert
    strictEqual(third.next?.input.batch, "F3");
    assertHasLine(third.lines, "✓ F2 done and committed");
  });

  it("runs a three-batch plan to one push and one pull request, each commit named by its close", async () => {
    // Arrange
    const { files, shell, deps } = await threeBatchesAfter(3);

    // Act
    const last = await run(THREE_BATCH_RUNS[3].input, deps);

    // Assert
    strictEqual(last.next, undefined);
    deepStrictEqual(events(files), ["F1 launched", "F1 returned", "F1 merged", "F2 launched", "F2 returned", "F2 merged",
      "F3 launched", "F3 returned", "F3 merged", "closed"]);
    deepStrictEqual(mergedDetails(files), ["1111111", "2222222", "abc1234"]);
    strictEqual(pushes(shell), 1);
    assertHasLine(last.lines, "✓ pushed feat/demo to origin");
    assertMentions(prBody(files), [PR_ASSUMPTIONS]);
    deepStrictEqual(record(files), { code: null });
  });

  it("says a closed run is closed when run again, and pushes nothing more", async () => {
    // Arrange
    const { shell, deps } = await threeBatchesAfter(4);

    // Act
    const closed = await run({ code: "demo" }, deps);

    // Assert
    assertLastLineWith(closed.lines, "every batch is done and the run is closed");
    strictEqual(pushes(shell), 1);
  });

  it("stops on a batch the chain left not done: logged, and a human decides", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);

    // Act
    const out = await run({ after: ["", "BLOCKED — step 2: the tests stay red"] }, deps);

    // Assert
    strictEqual(out.next, undefined);
    assertHasLine(out.lines, "F2 stopped BLOCKED — step 2: the tests stay red");
    deepStrictEqual(events(files), ["F2 launched", "F2 stopped"]);
  });

  it("names the next batch with the mode and rules the hop read again, over the hooks and effort its record kept (Orkeon #220)", async () => {
    // Arrange
    const { deps } = setup();
    await run({ code: "demo", permissionMode: "acceptEdits", permissionRules: [], githubTool: true, hooks: [{ n: 1 }], effort: "high" }, deps);

    // Act
    const out = await run({ after: ["✓ committed 1111111 on feat/demo: 2 file(s)"], ...FRESH_SESSION }, { ...deps, reviewerFor: () => clearReviewer() });

    // Assert
    deepStrictEqual(
      [out.next?.input.permissionMode, out.next?.input.permissionRules, out.next?.input.githubTool, out.next?.input.hooks, out.next?.input.effort],
      [FRESH_SESSION.permissionMode, FRESH_SESSION.permissionRules, false, [{ n: 1 }], "high"],
    );
  });

  it("relaunches a batch the chain left not done when typed again", async () => {
    // Arrange
    const { deps } = setup();
    await run({ code: "demo" }, deps);
    await run({ after: ["", "BLOCKED — step 2: the tests stay red"] }, deps);

    // Act
    const again = await run({ code: "demo" }, deps);

    // Assert
    strictEqual(again.next?.input.batch, "F2");
  });

  it("stops on the audit's own BLOCKED line, even with a GAPS verdict written for an unfinished audit", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);
    const line = "dev-verify: BLOCKED — the step's budget is spent (tokens: x): the capture stays in c/; GAPS written to v";

    // Act
    const out = await run({ after: ["", line] }, deps);

    // Assert
    assertHasLine(out.lines, "F2 stopped BLOCKED — the step's budget is spent (tokens: x): the capture stays in c/; GAPS written to v");
    deepStrictEqual(events(files), ["F2 launched", "F2 stopped"]);
  });

  it("takes a batch committed but not marked done for done: logged merged, said", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);
    const after = ["✓ committed 3333333 on feat/demo: 1 file(s)", "⚠ DEMO-PLAN-F2.md could not be marked done: EACCES"];

    // Act
    const out = await run({ after }, deps);

    // Assert
    assertHasLine(out.lines, "⚠ F2 is not marked done in its sheet or the plan: mark it by hand");
    strictEqual(out.next?.input.batch, "F3");
    deepStrictEqual(events(files), ["F2 launched", "F2 returned", "F2 merged", "F3 launched"]);
  });

  it("never launches again a batch committed but not marked done, its sheet still open", async () => {
    // Arrange
    const { deps } = setup();
    await run({ code: "demo" }, deps);
    await run({ after: ["✓ committed 3333333 on feat/demo: 1 file(s)", "⚠ DEMO-PLAN-F2.md could not be marked done: EACCES"] }, deps);

    // Act
    const later = await run({ code: "demo" }, deps);

    // Assert
    strictEqual(later.next?.input.batch, "F3");
  });

  it("reviews no batch that depends on nothing", async () => {
    // Arrange
    const { files, deps } = setup();
    reopenF1(files);
    const llm = clearReviewer();

    // Act
    await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });

    // Assert
    strictEqual(llm.acts.length, 0);
  });

  it("hands the reviewer the next sheet and what the closed batch changed, four read tools and eight turns", async () => {
    // Arrange
    const { files, shell, deps } = setup();
    reopenF1(files);
    const llm = clearReviewer();
    shell.results["git show --format= '1111111'"] = F1_SHOW;
    await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });
    markDone(files, "F1");

    // Act
    const out = await run({ after: ["✓ committed 1111111 on feat/demo: 2 file(s)"] }, { ...deps, reviewerFor: () => llm });

    // Assert
    strictEqual(out.next?.input.batch, "F2");
    assertHasLine(out.lines, "review of F2: CLEAR");
    strictEqual(llm.acts.length, 1);
    const { prompt, request } = llm.acts[0];
    assertMentions(prompt, F2_REVIEW_BRIEF);
    ok(prompt.indexOf("### workbench/demo/DEMO-PLAN.md\n```text\n") > prompt.indexOf("### what F1 changed"), prompt);
    deepStrictEqual(request.tools, ["file_read", "node_outline", "node_read", "codebase_search"]);
    strictEqual(request.maxIterations, 8);
    strictEqual(request.permissionMode, "plan");
  });

  it("does not launch a batch whose review raises a Blocking question", async () => {
    // Arrange
    const { files, deps } = setup();
    const llm = blockingReviewer();

    // Act
    const out = await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });

    // Assert
    strictEqual(out.next, undefined);
    assertHasLine(out.lines, "review of F2: GAPS — 1 Blocking, 0 Major");
    deepStrictEqual(events(files), ["F2 stopped"]);
  });

  it("stops a batch whose review has no reviewer", async () => {
    // Arrange
    const { files, deps } = setup();

    // Act
    const out = await run({ code: "demo" }, { ...deps, reviewerFor: undefined });

    // Assert
    strictEqual(out.next, undefined);
    strictEqual(out.lines.at(-1), NO_REVIEWER_LINE);
    deepStrictEqual(events(files), ["F2 stopped"]);
  });

  it("stops a batch whose review did not parse", async () => {
    // Arrange
    const { files, deps } = setup();
    const llm = unparsableReviewer();

    // Act
    const out = await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });

    // Assert
    strictEqual(out.next, undefined);
    assertLastLineStarting(out.lines, "→ F2 not launched: the review could not run (unparsable: ");
    deepStrictEqual(events(files), ["F2 stopped"]);
  });

  it("reviews again a batch stopped because its review did not run", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, { ...deps, reviewerFor: undefined });
    const llm = clearReviewer();

    // Act
    const again = await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });

    // Assert
    strictEqual(again.next?.input.batch, "F2");
    strictEqual(llm.acts.length, 1);
    deepStrictEqual(events(files), ["F2 stopped", "F2 relaunched"]);
  });

  it("hands the launched batch the Major rows as stale lines", async () => {
    // Arrange
    const { deps } = setup();
    const llm = majorReviewer();

    // Act
    const out = await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });

    // Assert
    deepStrictEqual(out.next?.input.stale, [F2_STALE_LINE]);
  });

  it("launches a batch whose Blocking review was settled, typed again, without a second review", async () => {
    // Arrange
    const { deps } = setup();
    const llm = blockingReviewer();
    await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });

    // Act
    const again = await run({ code: "demo" }, { ...deps, reviewerFor: () => llm });

    // Assert
    strictEqual(again.next?.input.batch, "F2");
    strictEqual(llm.acts.length, 1);
  });

  it("closes on the default branch without contrib.branch", async () => {
    // Arrange
    const { files, deps } = setup("main");
    await beforeTheClose(files, deps);

    // Act
    const closed = await run(BACK_FROM_F3, deps);

    // Assert
    assertLineStarting(closed.lines, "✓ every batch is committed on main, the default branch");
  });

  it("closes on the default branch with contrib.branch when the run's branch does not exist, saying the pack asks for one", async () => {
    // Arrange
    const { files, deps } = packedOnMain();
    await beforeTheClose(files, deps);

    // Act
    const said = await run(BACK_FROM_F3, deps);

    // Assert
    assertHasLine(said.lines, "⚠ the pack asks for a work branch (feat|fix/<slug>), but the batches are committed on main");
    assertLineStarting(said.lines, "✓ every batch is committed on main, the default branch");
  });

  it("refuses the close on the default branch with contrib.branch while the run's branch exists", async () => {
    // Arrange
    const { files, shell, deps } = packedOnMain();
    await run({ code: "demo" }, deps);
    shell.results[FEAT_DEMO_EXISTS] = { exitCode: 0 };
    markDone(files, "F2");
    await run({ after: [] }, deps);
    markDone(files, "F3");

    // Act
    const refused = await run(BACK_FROM_F3, deps);

    // Assert
    assertHasLine(refused.lines,
      "✗ close: main is the default branch and the pack asks for a work branch (feat|fix/<slug>): git switch feat/demo, then /dev-batches demo");
    ok(!events(files).includes("closed"));
    strictEqual(record(files).code, "demo");
  });

  it("on the default branch with contrib.branch, creates the run's branch before the launch", async () => {
    // Arrange
    const { files, shell, deps } = setup("main");
    files.files.set(REPO_YAML, BRANCH_PACK);
    shell.results[FEAT_DEMO_EXISTS] = { exitCode: 1 };

    // Act
    const out = await run({ code: "demo" }, deps);

    // Assert
    ok(shell.commands.includes("git switch -c 'feat/demo'"), shell.commands.join("\n"));
    strictEqual(out.next?.input.batch, "F2");
  });
});

describe("runDevBatches — what comes back and the close", () => {
  it("relaunches a GAPS batch with the verdict's rows as correction", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);

    // Act
    const out = await run({ after: ["→ /dev-implement F2 — correction: Major Scope: y"] }, deps);

    // Assert
    strictEqual(out.next?.crew, "dev-implement");
    strictEqual(out.next?.input.correction, F2_LAST_FINDING);
    assertLineStarting(out.lines, "→ F2 relaunched, audit round 3 of 3: /dev-implement F2 demo — correction: ");
    deepStrictEqual(events(files), ["F2 launched", "F2 returned", "F2 relaunched"]);
  });

  it("hands a batch to a human after three GAPS rounds", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);
    // The fixture's verdict file holds two GAPS audits before the launch: the third one is written since.
    addGapsAudit(files);

    // Act
    const out = await run({ after: ["→ /dev-implement F2 — correction: Major Scope: y"] }, deps);

    // Assert
    strictEqual(out.next, undefined);
    assertHasLine(out.lines, "F2 returned GAPS");
    assertHasLine(out.lines, GAPS_HUMAN_LINE);
  });

  it("relaunches a budget-stopped audit without correction", async () => {
    // Arrange
    const { files, deps } = setup();
    files.files.set(VERDICT_F2, VALID_F2);
    await run({ code: "demo" }, deps);
    addUnfinishedAudit(files);

    // Act
    const out = await run({ after: BUDGET_STOPPED_AUDIT }, deps);

    // Assert
    strictEqual(out.next?.crew, "dev-implement");
    strictEqual(out.next?.input.correction, undefined);
    deepStrictEqual(events(files), ["F2 launched", "F2 returned", "F2 relaunched"]);
  });

  it("typed after a hop the chain's depth refused, logs what a GAPS audit written since the launch says", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);
    // The fixture's verdict file holds two GAPS audits before the launch: a third one is written since.
    addGapsAudit(files);

    // Act
    const out = await run({}, deps);

    // Assert
    strictEqual(out.next, undefined);
    assertHasLine(out.lines, "F2 returned GAPS");
    deepStrictEqual(events(files), ["F2 launched", "F2 returned"]);
  });

  it("typed after a hop the chain's depth refused, logs nothing for a VALID audit without a commit and names the close by hand", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);
    files.files.set(VERDICT_F2, `${files.files.get(VERDICT_F2)}\n${VALID_F2}`);

    // Act
    const typed = await run({}, deps);

    // Assert
    // A VALID audit and no commit: its chain may still be closing it, so nothing is logged (the chain's answer would
    // find the batch stopped); the close by hand is named.
    strictEqual(typed.next, undefined);
    assertHasLine(typed.lines, "F2: an audit since its launch says VALID, and no commit yet: its chain may still be closing it (nothing logged)");
    assertHasLine(typed.lines, "→ wait for the chain's answer; else the close (/dev-implement F2 demo --close), then /dev-batches demo goes on");
    deepStrictEqual(events(files), ["F2 launched"]);
  });

  it("typed over an audit with no verdict since the launch, logs the stop: a dead chain never answers, a human decides", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);
    files.files.set(VERDICT_F2, `${files.files.get(VERDICT_F2) ?? ""}\n# DEMO-VERIFY-F2 — 2026-10-24 11:00 — fast\n\nAudit in progress.\n`);

    // Act
    const typed = await run({}, deps);

    // Assert
    assertNoLineWith(typed.lines, "nothing logged");
    // What the last verdict read says is logged (here the earlier GAPS of the fixture): never a silent wait.
    strictEqual(events(files).length, 2);
  });

  it("logs at the launch the audits the batch's verdict file already holds", async () => {
    // Arrange
    const { files, deps } = setup();
    files.files.set(VERDICT_F2, VALID_F2);

    // Act
    await run({ code: "demo" }, deps);

    // Assert
    ok((files.files.get(LOG) ?? "").includes("F2 launched audits 1"), files.files.get(LOG));
  });

  it("typed after a cut with no audit since the launch, relaunches the batch; an audit before the launch is not one", async () => {
    // Arrange
    const { files, deps } = setup();
    files.files.set(VERDICT_F2, VALID_F2);
    await run({ code: "demo" }, deps);

    // Act
    const typed = await run({}, deps);

    // Assert
    strictEqual(typed.next?.input.batch, "F2");
    deepStrictEqual(events(files), ["F2 launched", "F2 relaunched"]);
  });

  it("logs a VALID batch its close did not commit as a stop, with the close's ✗ line", async () => {
    // Arrange
    const { files, deps } = setup();
    files.files.set(VERDICT_F2, VALID_F2);
    await run({ code: "demo" }, deps);

    // Act
    const out = await run({ after: ["✗ git commit failed: hook refused"] }, deps);

    // Assert
    assertHasLine(out.lines, "F2 stopped BLOCKED — close: git commit failed: hook refused");
  });

  it("keeps the commits local under a rule that denies the push, and closes the run", async () => {
    // Arrange
    const { files, shell, deps } = setup();
    await beforeTheClose(files, deps, { permissionMode: "default", permissionRules: ["deny shell_command command=git push*"] });

    // Act
    const out = await run(BACK_FROM_F3, deps);

    // Assert
    assertHasLine(out.lines, "✗ not pushed: a session rule denies 'git push -u origin 'feat/demo''; the commits stay local");
    strictEqual(shell.commands.some((c) => c.startsWith("git push")), false);
    strictEqual(events(files).at(-1), "closed");
  });

  it("leaves the run open when the push fails", async () => {
    // Arrange
    const { files, shell, deps } = setup();
    shell.results[gitPushCommand("feat/demo")] = { exitCode: 1, stderr: "rejected\n" };
    await beforeTheClose(files, deps);

    // Act
    const out = await run(BACK_FROM_F3, deps);

    // Assert
    ok(out.lines.some((l) => l.startsWith("the run stays open: /dev-batches demo tries the push again")
      && l.includes("push from a terminal (git push -u origin 'feat/demo')")), out.lines.join("\n"));
    strictEqual(events(files).includes("closed"), false);
  });

  it("tries the push again at the next run after a failed one, and closes the run", async () => {
    // Arrange
    const { files, shell, deps } = setup();
    shell.results[gitPushCommand("feat/demo")] = { exitCode: 1, stderr: "rejected\n" };
    await beforeTheClose(files, deps);
    await run(BACK_FROM_F3, deps);
    shell.results[gitPushCommand("feat/demo")] = { exitCode: 0 };

    // Act
    await run({ code: "demo" }, deps);

    // Assert
    strictEqual(events(files).at(-1), "closed");
  });

  it("closes the run on a branch pushed by hand, without pushing it again", async () => {
    // Arrange
    const { files, shell, deps } = setup();
    shell.results[gitPushCommand("feat/demo")] = { exitCode: 128, stderr: "fatal: could not read from remote\n" };
    await beforeTheClose(files, deps);
    await run(BACK_FROM_F3, deps);
    const closedBeforeTheHandPush = events(files).includes("closed");
    shell.results[gitPushedCheckCommand("feat/demo")] = { stdout: "abc123\nabc123\n" };
    const pushesBefore = pushes(shell);

    // Act
    const out = await run({ code: "demo" }, deps);

    // Assert
    strictEqual(closedBeforeTheHandPush, false);
    assertHasLine(out.lines, "✓ feat/demo is on origin already");
    strictEqual(pushes(shell), pushesBefore);
    strictEqual(events(files).at(-1), "closed");
  });

  it("does not overwrite the run in progress for a code that has no plan", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo" }, deps);

    // Act
    const out = await run({ code: "demi" }, deps);

    // Assert
    // Refused before the plan is even looked for: another run is in progress.
    assertLastLineStarting(out.lines, "BLOCKED — the run of demo is in progress");
    strictEqual(record(files).code, "demo");
  });

  it("takes the context of a typed run without a code", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo", permissionMode: "default", effort: "low" }, deps);

    // Act
    const out = await run({ permissionMode: "default", effort: "high" }, deps);

    // Assert
    strictEqual(out.next?.input.effort, "high");
    strictEqual(record(files).context.effort, "high");
  });

  it("keeps the record's context for a run refused by its session mode", async () => {
    // Arrange
    const { files, deps } = setup();
    await run({ code: "demo", permissionMode: "default", effort: "low" }, deps);
    await run({ permissionMode: "default", effort: "high" }, deps);

    // Act
    const out = await run({ permissionMode: "plan" }, deps);

    // Assert
    assertLastLineStarting(out.lines, "BLOCKED — the session mode plan");
    strictEqual(record(files).context.permissionMode, "default");
  });

  it("launches nothing when its log cannot be written", async () => {
    // Arrange
    const { files, deps } = setup();
    const write = files.write.bind(files);
    files.write = async (path: string, content: string) => { if (path === LOG) throw new Error("read-only"); return write(path, content); };

    // Act
    const out = await run({ code: "demo" }, deps);

    // Assert
    strictEqual(out.next, undefined);
    assertLastLineStarting(out.lines, "BLOCKED — the log must be writable");
  });
});

describe("batchesBranchName", () => {
  for (const c of BRANCH_NAMES) {
    it(c.name, () => {
      // Arrange
      const pattern = c.pattern;

      // Act
      const name = batchesBranchName(pattern, "demo");

      // Assert
      strictEqual(name, c.expected);
    });
  }
});

describe("runDevBatches — a parallel run", () => {
  it("runs the wave itself, both batches under their worktrees, and names itself next with the concurrency", async () => {
    // Arrange
    const { files, deps, runs } = parallelSetup();

    // Act
    const out = await run({ code: "demo", concurrency: 2, permissionMode: "bypassPermissions" }, deps);

    // Assert
    deepStrictEqual(runs, [
      { batch: "F2", root: `${WORKSPACE}/.orkeon/worktrees/demo-F2`, mode: "bypassPermissions" },
      { batch: "F3", root: `${WORKSPACE}/.orkeon/worktrees/demo-F3`, mode: "bypassPermissions" },
    ]);
    deepStrictEqual(out.next, { crew: "dev-batches", input: { concurrency: 2 } });
    deepStrictEqual(events(files), ["F2 launched", "F3 launched", "F2 returned", "F2 merged", "F3 returned", "F3 merged"]);
    strictEqual(record(files).context.concurrency, 2);
  });

  for (const mode of ASKING_MODES) {
    it(`refuses the mode ${mode}, which asks before shell commands, typed`, async () => {
      // Arrange
      const { deps, runs } = parallelSetup();

      // Act
      const out = await run({ code: "demo", concurrency: 2, permissionMode: mode }, deps);

      // Assert
      strictEqual(out.lines.at(-1), `BLOCKED — concurrency 2 refused: the session mode ${mode} asks before shell commands, and two batches would ask at once: /mode bypassPermissions, or run with --concurrency 1`);
      deepStrictEqual(runs, []);
    });
  }

  it("refuses a mode that asks before shell commands, read back by a chained run", async () => {
    // Arrange
    const { files, deps } = parallelSetup();
    files.files.set(ACTIVE_RECORD, parallelRecord("acceptEdits"));

    // Act
    const out = await run({ concurrency: 2 }, deps);

    // Assert
    assertLastLineStarting(out.lines, "BLOCKED — concurrency 2 refused: the session mode acceptEdits");
  });

  it("goes on from the record's concurrency when a chained run is handed none: handed on with it, nothing run", async () => {
    // Arrange
    const { files, deps, runs } = parallelSetup();
    files.files.set(ACTIVE_RECORD, parallelRecord());

    // Act
    const out = await run({}, deps);

    // Assert
    strictEqual(runs.length, 0);
    deepStrictEqual(out.next, { crew: "dev-batches", input: { concurrency: 2 } });
  });

  it("runs the wave in the run handed the record's concurrency, its budget sized to it", async () => {
    // Arrange
    const { files, deps, runs } = parallelSetup();
    files.files.set(ACTIVE_RECORD, parallelRecord());
    await run({}, deps);

    // Act
    const out = await run({ concurrency: 2 }, deps);

    // Assert
    strictEqual(out.next?.crew, "dev-batches");
    strictEqual(runs.length, 2);
  });

  it("goes on in parallel when the plan's run is typed again without --concurrency (a refused hop typed again)", async () => {
    // Arrange
    const { files, deps } = parallelSetup();
    files.files.set(ACTIVE_RECORD, parallelRecord());

    // Act
    const out = await run({ code: "demo", permissionMode: "bypassPermissions" }, deps);

    // Assert
    deepStrictEqual(out.next, { crew: "dev-batches", input: { concurrency: 2 } }, out.lines.join("\n"));
    strictEqual(out.lines.at(-1), "→ the run of demo goes on, 2 batches at once");
    strictEqual(record(files).context.concurrency, 2);
  });

  it("goes back to one at a time on a typed --concurrency 1, the record's concurrency dropped", async () => {
    // Arrange
    const { files, deps, runs } = parallelSetup();
    files.files.set(ACTIVE_RECORD, parallelRecord());

    // Act
    const out = await run({ code: "demo", concurrency: 1, permissionMode: "bypassPermissions" }, deps);

    // Assert
    deepStrictEqual(runs, []);
    strictEqual(out.next?.crew, "dev-implement", out.lines.join("\n"));
    strictEqual(record(files).context.concurrency, undefined);
  });

  it("refuses to run here, one at a time, a batch a parallel run kept in its worktree, naming how to go on", async () => {
    // Arrange
    const { files, deps } = parallelSetup();
    files.listings.set(`${WORKSPACE}/.orkeon/worktrees`, ["demo-F2"]);

    // Act
    const out = await run({ code: "demo", permissionMode: "bypassPermissions" }, deps);

    // Assert
    strictEqual(out.next, undefined);
    strictEqual(out.lines.at(-1), KEPT_F2_LINE);
  });

  it("refuses a parallel run on a host without batch agents", async () => {
    // Arrange
    const { deps } = parallelSetup();
    delete deps.runBatch;

    // Act
    const out = await run({ code: "demo", concurrency: 3, permissionMode: "bypassPermissions" }, deps);

    // Assert
    strictEqual(out.lines.at(-1), "BLOCKED — concurrency 3 refused: no batch agents on this host; run with --concurrency 1");
  });

  it("ends the run on a GAPS beside a VALID batch: the VALID one merged, nothing named next", async () => {
    // Arrange
    const { files, deps } = parallelSetup();
    deps.runBatch = async (r) => (r.batch === "F2"
      ? { batch: "F2", verdict: "VALID", hash: "1", lines: [], spent: 1 }
      : { batch: "F3", verdict: "GAPS", lines: ["→ Batch F3 GAPS"], spent: 1 });

    // Act
    const out = await run({ code: "demo", concurrency: 2, permissionMode: "bypassPermissions" }, deps);

    // Assert
    strictEqual(out.next, undefined);
    deepStrictEqual(events(files), ["F2 launched", "F3 launched", "F2 returned", "F2 merged", "F3 returned"]);
    assertLineWith(out.lines, ".orkeon/worktrees/demo-F3 kept");
  });

  it("probes the first wave of a typed run, and refuses the run when git fails under the worktree", async () => {
    // Arrange
    const { deps, runs } = parallelSetup();
    const probed: string[] = [];
    deps.probe = async (root) => { probed.push(root); return { exitCode: 128, top: "" }; };

    // Act
    const out = await run({ code: "demo", concurrency: 2, permissionMode: "bypassPermissions" }, deps);

    // Assert
    deepStrictEqual(probed, [`${WORKSPACE}/.orkeon/worktrees/demo-F2`]);
    deepStrictEqual(runs, []);
    assertLastLineWith(out.lines, "Orkeon/orkeon#191");
  });

  it("probes no wave of a chained run", async () => {
    // Arrange
    const { files, deps } = parallelSetup();
    files.files.set(ACTIVE_RECORD, parallelRecord());
    const probed: string[] = [];
    deps.probe = async (root) => { probed.push(root); return { exitCode: 0, top: root }; };

    // Act
    await run({ concurrency: 2 }, deps);

    // Assert
    deepStrictEqual(probed, []);
  });
});
