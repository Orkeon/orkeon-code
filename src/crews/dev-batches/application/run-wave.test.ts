// One wave of a parallel /dev-batches over FakeShell, FakeFiles and a fake runBatch: the batches start together
// under their own worktrees, seeded first; the driver alone logs, merges the VALID ones in id order, harvests and
// removes their worktrees; a stop keeps its worktree, its files there alone, names the command that relaunches it
// there and ends the run once the wave settles. Run:
//   node --test src/crews/dev-batches/application/run-wave.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { outcomeOf, runBatchChain, runWave } from "./run-wave.ts";
import type { BatchOutcome, BatchRun } from "./run-wave.ts";
import { FakeFiles } from "../../../../tests/support/doubles/fake-files.ts";
import {
  AUDIT_GAPS, AUDIT_VALID, Book, F2_DONE_PLAN, F2_RELAUNCH_LINE, F3_GAPS, F3_RELAUNCH_LINE, FailingClose, GATE_RED, IGNORED,
  LAUNCH, MERGED, NOT_IGNORED_LINE, OPEN_PLAN, PROBE_REFUSED_LINE, RUN, SHEET, VERIFY_INPUT, WORKTREE_ROOT_REFUSED, WT, add,
  ahead, batchWrites, bookOf, deferred, head, implemented, mainFiles, merge, rebase, refuseFirstMerge, remove, request, shellFor,
  shellReopening, spend, status, tickingClock, traceCheckoutWrites, valid,
} from "./run-wave.fixtures.ts";
import { assertLineWith, assertNoLineStarting, assertNoLineWith, assertNotRan, assertRan, assertRanAfter } from "./run-wave.assertions.ts";
import { assertLineStarting } from "../../../../tests/support/assertions/text.ts";
import { WORKSPACE } from "../../../shared/domain/vfs.ts";

describe("runWave", () => {
  it("starts every batch of the wave before any settles, each under its own worktree, seeded first", async () => {
    // Arrange
    const shell = shellFor(["F2", "F3"]);
    const started: BatchRun[] = [];
    const seededPlans: Array<[string, string | undefined]> = [];
    const release: Array<() => void> = [];
    const files = mainFiles();
    const book = new Book();
    const runBatch = (run: BatchRun): Promise<BatchOutcome> => {
      started.push(run);
      seededPlans.push([run.batch, files.files.get(`${run.root}/todo/prune/PRUNE-PLAN.md`)]);
      return new Promise((done) => release.push(() => done(valid(run.batch))));
    };

    // Act
    const pending = runWave(request(["F2", "F3"], book), { files, shell, runBatch });
    for (let i = 0; i < 200 && started.length < 2; i++) await Promise.resolve();
    const startedBeforeRelease = started.map((r) => [r.batch, r.root, r.branch]);
    const savedBeforeRelease = book.saved;
    release.forEach((r) => r());
    const out = await pending;

    // Assert
    deepStrictEqual(startedBeforeRelease, [
      ["F2", `${WORKSPACE}/.orkeon/worktrees/prune-F2`, "batches/prune/F2"],
      ["F3", `${WORKSPACE}/.orkeon/worktrees/prune-F3`, "batches/prune/F3"],
    ]);
    deepStrictEqual(seededPlans, [["F2", "plan"], ["F3", "plan"]], "each batch seeded before its run");
    ok(savedBeforeRelease >= 1, "the launches are written before the batches run");
    strictEqual(out.stopped, false);
    assertRan(shell, add("F2"), add("F3"));
  });

  it("logs launched for each, then each batch's lines in id order; merges in id order, the second rebased", async () => {
    // Arrange
    const shell = shellFor(["F2", "F3"]);
    refuseFirstMerge(shell, "F3");
    const book = new Book();
    const files = mainFiles();
    traceCheckoutWrites(files, shell);
    // F3 settles first, F2 released once F3 has returned: the log still follows the ids.
    const f2 = deferred<BatchOutcome>();
    const runBatch = (r: BatchRun): Promise<BatchOutcome> => {
      batchWrites(files, r.root, r.batch);
      if (r.batch === "F2") return f2.promise;
      const f3 = Promise.resolve(valid("F3"));
      void f3.then(() => f2.resolve(valid("F2")));
      return f3;
    };

    // Act
    const out = await runWave(request(["F2", "F3"], book), { files, shell, runBatch });

    // Assert
    deepStrictEqual(book.events(), [
      "F2 launched prune-F2 audits 0", "F3 launched prune-F3 audits 0",
      "F2 returned VALID", "F2 merged abc2def", "F3 returned VALID", "F3 merged abc3def",
    ]);
    deepStrictEqual(shell.commands.filter((c) => c.startsWith("git merge --ff-only")), [merge("F2"), merge("F3"), merge("F3")]);
    assertRan(shell, rebase("F3"), remove("F3"));
    assertRanAfter(shell, remove("F2"), merge("F2"));
    // Harvested after the merge, so that a merge's checkout of a tracked sheet is never overwritten.
    assertRanAfter(shell, `write ${WORKSPACE}/${SHEET("F2")}`, merge("F2"));
    strictEqual(files.files.get(`${WORKSPACE}/${SHEET("F3")}`), "F3 ticked");
    strictEqual(files.files.get(`${WORKSPACE}/todo/prune/PRUNE-VERIFY-F2.md`), "verdict");
    strictEqual(out.stopped, false);
    assertLineStarting(out.lines, "✓ F2 VALID");
  });

  it("merges the VALID batch beside a GAPS one; the GAPS one's files stay in its kept worktree, its correction logged and the relaunch named", async () => {
    // Arrange
    const shell = shellFor(["F2", "F3"]);
    const book = new Book();
    const files = mainFiles();
    const gaps: string[] = [];
    const runBatch = async (r: BatchRun): Promise<BatchOutcome> => {
      batchWrites(files, r.root, r.batch);
      return r.batch === "F2" ? valid("F2") : F3_GAPS;
    };
    const afterGaps = async (vfsPath: string): Promise<string[]> => { gaps.push(vfsPath); return ["→ 1 candidate mistake: /dev-learn"]; };

    // Act
    const out = await runWave(request(["F2", "F3"], book), { files, shell, runBatch, afterGaps });

    // Assert
    deepStrictEqual(book.events().slice(2), ["F2 returned VALID", "F2 merged abc2def", "F3 returned GAPS — correction: Major tests: none"]);
    assertNotRan(shell, merge("F3"), remove("F3"));
    // The main checkout never claims F3's work: its sheet and verdict stay in the worktree with its code.
    strictEqual(files.files.get(`${WORKSPACE}/${SHEET("F3")}`), "sheet F3");
    ok(!files.files.has(`${WORKSPACE}/todo/prune/PRUNE-VERIFY-F3.md`));
    deepStrictEqual(gaps, [`${WT("F3")}/todo`]);
    strictEqual(out.stopped, true);
    ok(out.lines.includes("→ 1 candidate mistake: /dev-learn"));
    assertNoLineWith(out.lines, "/dev-implement");
    strictEqual(files.files.get(`${WORKSPACE}/${SHEET("F2")}`), "F2 ticked");
    assertLineWith(out.lines, ".orkeon/worktrees/prune-F3 kept", "test suite");
    strictEqual(out.lines.at(-1), F3_RELAUNCH_LINE);
  });

  it("marks a merged batch done in the main checkout's global plan, a GAPS one left open; each event at its own time", async () => {
    // Arrange
    const shell = shellFor(["F2", "F3"]);
    const book = new Book();
    const files = mainFiles();
    files.files.set(`${WORKSPACE}/todo/prune/PRUNE-PLAN.md`, OPEN_PLAN);
    const runBatch = async (r: BatchRun): Promise<BatchOutcome> => {
      batchWrites(files, r.root, r.batch);
      return r.batch === "F2" ? valid("F2") : { batch: "F3", verdict: "GAPS", spent: 30, lines: ["→ Batch F3 GAPS"] };
    };

    // Act
    const out = await runWave(request(["F2", "F3"], book, { clock: tickingClock() }), { files, shell, runBatch });

    // Assert
    strictEqual(files.files.get(`${WORKSPACE}/todo/prune/PRUNE-PLAN.md`), F2_DONE_PLAN);
    deepStrictEqual(book.added.map((l) => l.slice(2, 18)), ["2026-10-24 10:00", "2026-10-24 10:01", "2026-10-24 10:02", "2026-10-24 10:03", "2026-10-24 10:05"]);
    assertNoLineStarting(out.lines, "⚠");
  });

  it("says a global plan it cannot mark as a ⚠ line, the merge standing", async () => {
    // Arrange
    const shell = shellFor(["F2"]);
    const files = mainFiles();
    files.files.delete(`${WORKSPACE}/todo/prune/PRUNE-PLAN.md`);
    const runBatch = async (r: BatchRun): Promise<BatchOutcome> => { batchWrites(files, r.root, r.batch); return valid("F2"); };

    // Act
    const out = await runWave(request(["F2"], new Book()), { files, shell, runBatch });

    // Assert
    assertLineStarting(out.lines, "⚠ PRUNE-PLAN.md: batch F2 not marked done");
    strictEqual(out.stopped, false);
  });

  it("relaunches a GAPS batch in its worktree with the correction its log entry carries", async () => {
    // Arrange
    const shell = shellReopening(["F2"], "F2");
    const book = bookOf([
      "- 2026-10-24 09:00 F2 launched prune-F2 audits 0", "- 2026-10-24 09:30 F2 returned GAPS — correction: Major tests: none",
    ]);
    const runs: BatchRun[] = [];

    // Act
    await runWave(request(["F2"], book), { files: mainFiles(), shell, runBatch: async (r) => { runs.push(r); return valid("F2"); } });

    // Assert
    deepStrictEqual(runs.map((r) => [r.batch, r.correction]), [["F2", "Major tests: none"]]);
    assertNotRan(shell, add("F2"));
  });

  it("refuses the wave when the dev state is not ignored by git: nothing made", async () => {
    // Arrange
    const shell = shellFor(["F2"]);
    shell.results[IGNORED] = { exitCode: 1 };
    let ran = false;

    // Act
    const out = await runWave(request(["F2"], new Book()), { files: mainFiles(), shell, runBatch: async () => { ran = true; return valid("F2"); } });

    // Assert
    strictEqual(ran, false);
    assertNotRan(shell, add("F2"));
    strictEqual(out.lines.at(-1), NOT_IGNORED_LINE);
  });

  it("stops on a rebase conflict: logged BLOCKED — merge, the worktree kept and named", async () => {
    // Arrange
    const shell = shellFor(["F2"]);
    shell.results[merge("F2")] = { exitCode: 128, stderr: "fatal: Not possible to fast-forward, aborting.\n" };
    shell.results[rebase("F2")] = { exitCode: 1, stderr: "CONFLICT (content): Merge conflict in src/a.ts\n" };
    const book = new Book();

    // Act
    const out = await runWave(request(["F2"], book), { files: new FakeFiles(), shell, runBatch: async () => valid("F2") });

    // Assert
    const last = book.events().at(-1)!;
    ok(last.startsWith("F2 stopped BLOCKED — merge: not merged, the rebase stopped (CONFLICT"), last);
    assertNotRan(shell, remove("F2"));
    strictEqual(out.stopped, true);
    assertLineWith(out.lines, ".orkeon/worktrees/prune-F2 kept");
    strictEqual(out.lines.at(-1), F2_RELAUNCH_LINE);
  });

  it("says a batch the runtime rejected, and a budget stop, as BLOCKED stops", async () => {
    // Arrange
    const shell = shellFor(["F2", "F3"]);
    const book = new Book();
    const runBatch = async (r: BatchRun): Promise<BatchOutcome> => {
      if (r.batch === "F2") throw new Error(WORKTREE_ROOT_REFUSED);
      return { batch: "F3", verdict: "BLOCKED", lines: ["stopped BLOCKED — budget: 120 tool calls"], spent: 120 };
    };

    // Act
    const out = await runWave(request(["F2", "F3"], book), { files: new FakeFiles(), shell, runBatch });

    // Assert
    deepStrictEqual(book.events().slice(2), [
      `F2 stopped BLOCKED — ${WORKTREE_ROOT_REFUSED}`,
      "F3 stopped BLOCKED — budget: 120 tool calls",
    ]);
    strictEqual(out.stopped, true);
  });

  it("reuses the worktree of a batch the log leaves launched: relaunched, nothing created", async () => {
    // Arrange
    const shell = shellReopening(["F2"], "F2");
    const book = bookOf(["- 2026-10-24 09:00 F2 launched prune-F2 audits 0"]);
    const runs: string[] = [];

    // Act
    await runWave(request(["F2"], book), { files: new FakeFiles(), shell, runBatch: async (r) => { runs.push(r.batch); return valid("F2"); } });

    // Assert
    assertNotRan(shell, add("F2"));
    deepStrictEqual(runs, ["F2"]);
    strictEqual(book.events()[0], "F2 relaunched prune-F2 audits 0");
  });

  it("refuses a branch of the batch that exists without its worktree on it: nothing launched", async () => {
    // Arrange
    const shell = shellReopening(["F2"], "F2");
    shell.results[head("F2")] = { exitCode: 128, stderr: "fatal: cannot change to '.orkeon/worktrees/prune-F2'\n" };
    const book = new Book();
    let ran = false;

    // Act
    const out = await runWave(request(["F2"], book), { files: new FakeFiles(), shell, runBatch: async () => { ran = true; return valid("F2"); } });

    // Assert
    strictEqual(ran, false);
    deepStrictEqual(book.added, []);
    ok(out.stopped && out.lines.at(-1)!.startsWith("BLOCKED — worktree: "), out.lines.join("\n"));
  });

  it("merges without a run a batch whose worktree sheet is done and whose branch holds the close's commit", async () => {
    // Arrange
    const shell = shellReopening(["F2"], "F2");
    shell.results[ahead("F2")] = { stdout: "1\n" };
    const files = new FakeFiles();
    files.files.set(`${WORKSPACE}/.orkeon/worktrees/prune-F2/todo/prune/PRUNE-PLAN-F2.md`, "# PRUNE-PLAN-F2 — prune — done (2026-10-24)\n");
    const book = bookOf(["- 2026-10-24 09:00 F2 launched prune-F2 audits 0"]);
    let ran = false;

    // Act
    await runWave(request(["F2"], book), { files, shell, runBatch: async () => { ran = true; return valid("F2"); } });

    // Assert
    strictEqual(ran, false);
    deepStrictEqual(book.events(), ["F2 returned VALID", "F2 merged abc2def"]);
    assertRan(shell, merge("F2"));
  });

  it("removes without a run a done batch whose branch the work branch already holds (killed between merge and removal)", async () => {
    // Arrange
    const shell = shellReopening(["F2"], "F2");
    shell.results[ahead("F2")] = { stdout: "0\n" };
    shell.results[MERGED("F2")] = { exitCode: 0 };
    const files = mainFiles();
    files.files.set(`${WT("F2")}/${SHEET("F2")}`, "# PRUNE-PLAN-F2 — prune — done (2026-10-24)\n");
    const book = bookOf(["- 2026-10-24 09:00 F2 launched prune-F2 audits 0"]);
    let ran = false;

    // Act
    const out = await runWave(request(["F2"], book), { files, shell, runBatch: async () => { ran = true; return valid("F2"); } });

    // Assert
    strictEqual(ran, false);
    assertRan(shell, remove("F2"));
    strictEqual(out.stopped, false);
  });

  it("says a removal git refuses as a ⚠ line, the merge standing", async () => {
    // Arrange
    const shell = shellFor(["F2"]);
    shell.results[status("F2")] = { stdout: "?? tmp.log\n" };

    // Act
    const out = await runWave(request(["F2"], new Book()), { files: new FakeFiles(), shell, runBatch: async () => valid("F2") });

    // Assert
    assertLineStarting(out.lines, "⚠ refused: .orkeon/worktrees/prune-F2 holds 1 uncommitted");
    strictEqual(out.stopped, false);
  });

  it("probes git under the first worktree before any launch; a failure refuses the run and removes the worktrees made", async () => {
    // Arrange
    const shell = shellFor(["F2", "F3"]);
    const book = new Book();
    let ran = false;
    const roots: string[] = [];

    // Act
    const out = await runWave(request(["F2", "F3"], book, { probe: true }), {
      files: new FakeFiles(), shell,
      runBatch: async () => { ran = true; return valid("F2"); },
      probe: async (root) => { roots.push(root); return { exitCode: 128, top: "" }; },
    });

    // Assert
    deepStrictEqual(roots, [`${WORKSPACE}/.orkeon/worktrees/prune-F2`]);
    strictEqual(ran, false);
    deepStrictEqual(book.added, []);
    strictEqual(out.lines.at(-1), PROBE_REFUSED_LINE);
    assertRan(shell, remove("F2"), remove("F3"));
  });

  it("goes on when the probe's top is the worktree", async () => {
    // Arrange
    const shell = shellFor(["F2"]);
    const ran: string[] = [];

    // Act
    await runWave(request(["F2"], new Book(), { probe: true }), {
      files: new FakeFiles(), shell, runBatch: async (r) => { ran.push(r.batch); return valid("F2"); },
      probe: async (root) => ({ exitCode: 0, top: `${root}\n` }),
    });

    // Assert
    deepStrictEqual(ran, ["F2"]);
  });

  it("refuses a probe's top that is another folder", async () => {
    // Arrange
    const shell = shellFor(["F2"]);

    // Act
    const out = await runWave(request(["F2"], new Book(), { probe: true }), {
      files: new FakeFiles(), shell, runBatch: async () => valid("F2"),
      probe: async () => ({ exitCode: 0, top: `${WORKSPACE}\n` }),
    });

    // Assert
    ok(out.stopped && out.lines.at(-1)!.includes("Orkeon/orkeon#191"));
  });

  it("stops before any launch when a worktree cannot be seeded", async () => {
    // Arrange
    const shell = shellFor(["F2"]);
    const files = mainFiles();
    files.writeErrors.push({ prefix: "", error: () => new Error("No space left on device") });
    let ran = false;

    // Act
    const out = await runWave(request(["F2"], new Book()), { files, shell, runBatch: async () => { ran = true; return valid("F2"); } });

    // Assert
    strictEqual(ran, false);
    strictEqual(out.lines.at(-1), "BLOCKED — seed: .orkeon/worktrees/prune-F2 not seeded: No space left on device");
  });

  it("hands each batch its open steps", async () => {
    // Arrange
    const shell = shellFor(["F2", "F3"]);
    const steps: Array<number | undefined> = [];

    // Act
    await runWave(request(["F2", "F3"], new Book(), { steps: (b) => (b === "F2" ? 3 : undefined) }), {
      files: new FakeFiles(), shell, runBatch: async (r) => { steps.push(r.steps); return valid(r.batch); },
    });

    // Assert
    deepStrictEqual(steps, [3, undefined]);
  });
});

describe("runBatchChain", () => {
  it("runs implement, the audit, then the close without a push, and answers VALID with the commit", async () => {
    // Arrange
    const inputs: unknown[] = [];
    const implement = async (input: Record<string, unknown>): Promise<string> => {
      inputs.push(input);
      return input.close ? JSON.stringify({ lines: ["✓ committed 1a2b3c4 on batches/prune/F2: 3 file(s)"] }) : implemented;
    };
    const verify = async (input: Record<string, unknown>): Promise<string> => { inputs.push(input); return AUDIT_VALID; };

    // Act
    const out = await runBatchChain(RUN, LAUNCH, { implement, verify, spend: spend() });

    // Assert
    deepStrictEqual(inputs, [
      { ...LAUNCH, batch: "F2", steps: 2 },
      VERIFY_INPUT,
      { ...LAUNCH, batch: "F2", close: true, push: false },
    ]);
    strictEqual(out.verdict, "VALID");
    strictEqual(out.hash, "1a2b3c4");
    strictEqual(out.spent, 10);
  });

  it("answers GAPS without a close", async () => {
    // Arrange
    const chain = new FailingClose();

    // Act
    const gaps = await runBatchChain(RUN, LAUNCH, { implement: chain.implement, verify: async () => AUDIT_GAPS, spend: spend() });

    // Assert
    deepStrictEqual([gaps.verdict, gaps.correction], ["GAPS", "Major tests: none"]);
    strictEqual(chain.closes, 0);
  });

  it("answers BLOCKED when the implement names no audit", async () => {
    // Arrange
    const implement = async () => JSON.stringify({ lines: ["BLOCKED — step 1: the red tests did not fail"] });

    // Act
    const none = await runBatchChain(RUN, LAUNCH, { implement, verify: async () => AUDIT_VALID, spend: spend() });

    // Assert
    deepStrictEqual([none.verdict, none.lines[0]], ["BLOCKED", "BLOCKED — step 1: the red tests did not fail"]);
  });

  it("answers BLOCKED when the close commits nothing", async () => {
    // Arrange
    const chain = new FailingClose();

    // Act
    const unclosed = await runBatchChain(RUN, LAUNCH, { implement: chain.implement, verify: async () => AUDIT_VALID, spend: spend() });

    // Assert
    deepStrictEqual([unclosed.verdict, unclosed.lines.at(-1)], ["BLOCKED", "BLOCKED — close: git commit failed (nothing to commit)"]);
  });

  it("says why an audit that wrote no verdict stopped: its last line, with the gate's failure", async () => {
    // Arrange
    const verify = async () => GATE_RED;

    // Act
    const out = await runBatchChain(RUN, LAUNCH, { implement: async () => implemented, verify, spend: spend() });

    // Assert
    deepStrictEqual([out.verdict, out.lines.at(-1)],
      ["BLOCKED", "stopped BLOCKED — dev-verify wrote no verdict: GATE — batch F2: RED — fix and run again, no audit before (design ids …)"]);
  });

  it("says why an audit that wrote no verdict stopped: its last line, a dev-verify refusal", async () => {
    // Arrange
    const verify = async () => "dev-verify: BLOCKED — the gate could not run 'git status'\n";

    // Act
    const other = await runBatchChain(RUN, LAUNCH, { implement: async () => implemented, verify, spend: spend() });

    // Assert
    strictEqual(other.lines.at(-1), "stopped BLOCKED — dev-verify wrote no verdict: dev-verify: BLOCKED — the gate could not run 'git status'");
  });

  it("hands a relaunched batch's correction to its implement", async () => {
    // Arrange
    const inputs: Array<Record<string, unknown>> = [];
    const implement = async (input: Record<string, unknown>): Promise<string> => { inputs.push(input); return implemented; };

    // Act
    await runBatchChain({ ...RUN, correction: "Major tests: none" }, LAUNCH, { implement, verify: async () => AUDIT_GAPS, spend: spend() });

    // Assert
    deepStrictEqual(inputs[0], { ...LAUNCH, batch: "F2", steps: 2, correction: "Major tests: none" });
  });

  it("stops the batch once its tool calls are spent: stopped BLOCKED — budget", async () => {
    // Arrange
    let audits = 0;
    const verify = async (): Promise<string> => { audits++; return AUDIT_VALID; };

    // Act
    const out = await runBatchChain(RUN, LAUNCH, { implement: async () => implemented, verify, spend: spend(120, 120) });

    // Assert
    deepStrictEqual([out.verdict, out.lines.at(-1), out.spent, audits], ["BLOCKED", "stopped BLOCKED — budget: 120 tool calls", 120, 0]);
  });
});

describe("outcomeOf", () => {
  it("blocks the batch when its agent answers the JSON of another batch", () => {
    // Arrange
    const answered = JSON.stringify({ batch: "F3", verdict: "VALID", lines: ["✓ F3"], spent: 4 });

    // Act
    const outcome = outcomeOf("F2", answered);

    // Assert
    deepStrictEqual(outcome, { batch: "F2", verdict: "BLOCKED", lines: [`BLOCKED — the batch agent answered: ${answered}`], spent: 0 });
  });

  it("blocks the batch on a text that is not JSON, with its first line", () => {
    // Arrange
    const answered = "the model gave up\nsecond line";

    // Act
    const outcome = outcomeOf("F2", answered);

    // Assert
    deepStrictEqual(outcome, { batch: "F2", verdict: "BLOCKED", lines: ["BLOCKED — the batch agent answered: the model gave up"], spent: 0 });
  });
});
