// runDevLearn over FakeFiles loaded from tests/fixtures/dev/learn, FakeShell, FakeLlm
// and a fixed clock: --list (no model, no write), the proposals written for the one
// eligible axis, each code filter, the re-ask, the reconcile texts, the unchanged
// skip, the refusals, and no write under .claude/. Run:
//   node --test tests/crews/dev-learn/application/run-dev-learn.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { GIT_TOPLEVEL, GIT_WORKTREE_LIST } from "../../../../src/shared/application/dev/resolve-work-folder.ts";
import { motifId } from "../../../../src/shared/domain/dev/learn-proposals.ts";
import { runDevLearn } from "../../../../src/crews/dev-learn/application/run-dev-learn.ts";
import {
  AXIS_TEST_LIST, BACKLOG_LIST, BAD_AXES, CODE_DROPS, HEAD, HEAD_TWO_TREATED, OUT, OWNER_LINES_REASK, REMOVED_LINE_PROBLEM, T,
  THREE, badThenGoodAnswer, diskFull, earlierRunKeptNoMotif, motifsDroppedByCode, motifsRemovingAKeptLine,
  motifsWithAbsentOwners, newMotifFoundInOwner, noAxisOverThree, oneMotifProposed, ownerLinesThenBadAnswer, recorded,
  removedLineNotInOwner, setup, twoFailedAnswers, MOTIF_1, ownerLinesThenRefusedAnswer, HARNESS_OWNER_LINES,
  UNSEEN_REFINES_REASK, harnessOwnerHoldsKeyTerm, refinesBeforeOwnerLines, REFUSED_LISTED,
} from "./run-dev-learn.fixtures.ts";
import { assertNoClaudeWrite, writtenTestAxis } from "./run-dev-learn.assertions.ts";
import { assertMentions } from "../../../support/assertions/text.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("runDevLearn — --list", () => {
  it("prints the backlog per axis and the refused motifs: no model call, no write", async () => {
    // Arrange
    const f = setup();

    // Act
    const text = await runDevLearn({ list: true }, f.deps);

    // Assert
    deepStrictEqual(text.split("\n"), BACKLOG_LIST);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });

  for (const axis of ["Test", "tests"]) {
    it(`prints one axis as the harness's script does, named ${axis}`, async () => {
      // Arrange
      const f = setup();

      // Act
      const text = await runDevLearn({ axis, list: true }, f.deps);

      // Assert
      strictEqual(text, AXIS_TEST_LIST);
      deepStrictEqual(f.files.writes, []);
    });
  }

  it("prints the Placement axis as the harness's script does", async () => {
    // Arrange
    const f = setup();

    // Act
    const text = await runDevLearn({ axis: "Placement", list: true }, f.deps);

    // Assert
    strictEqual(text.split("\n").slice(1).join("\n") + "\n", recorded("axis-Placement.py.txt"));
    deepStrictEqual(f.files.writes, []);
  });

  it("says an axis without untreated gaps has nothing to list", async () => {
    // Arrange
    const f = setup();

    // Act
    const text = await runDevLearn({ axis: "Cost", list: true }, f.deps);

    // Assert
    strictEqual(text, `${HEAD}\ndev-learn: nothing untreated on axis Cost`);
    deepStrictEqual(f.files.writes, []);
  });
});

describe("runDevLearn — proposals", () => {
  it("asks once for the one eligible axis when no owner holds a key term, and writes both files under learn-<date>/", async () => {
    // Arrange
    const f = oneMotifProposed();
    const id = motifId("Test", THREE);

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 1);
    assertMentions(f.llm.extracts[0].prompt, ["Axis: Test", ...Object.values(T), "- CONTRIBUTING.md"]);
    deepStrictEqual(f.files.writes.map((w) => w.path), [`${OUT}/proposals.json`, `${OUT}/PROPOSALS.md`]);
    deepStrictEqual(text.split("\n"), [
      HEAD,
      `axis Test — 4 batches: 1 motifs proposed (${id}), 1 dropped`,
      "written: workbench/learn-2026-10-22/PROPOSALS.md",
      `→ /dev-learn --accept ${id}`,
      "  or /dev-learn --refuse <id> for each one you reject — read the lines first in PROPOSALS.md",
    ]);
    const axis = writtenTestAxis(f.files);
    strictEqual(axis.outcome, "proposed");
    deepStrictEqual(axis.shownRows, [T.exports, T.invoices, T.ledger1, T.ledger1b, T.ledger3]);
    deepStrictEqual(axis.motifs[0].batches, ["ledger/F1", "ledger/F3", "invoices/F2"]);
    strictEqual(axis.motifs[0].reconcile,
      "'refusal test' not found in CONTRIBUTING.md");
    ok(f.files.files.get(`${OUT}/PROPOSALS.md`)?.startsWith("# Learn proposals — 2026-10-22\n"));
    assertNoClaudeWrite(f.files);
  });

  it("lists a harness refusal under the slug code matches it by", async () => {
    // Arrange
    const f = oneMotifProposed();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    assertMentions(f.llm.extracts[0].prompt, REFUSED_LISTED);
  });

  it("drops by code a motif over two batches, a refused topic and a harness-refused title", async () => {
    // Arrange
    const f = motifsDroppedByCode();

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    const axis = writtenTestAxis(f.files);
    strictEqual(axis.outcome, "no-motif");
    deepStrictEqual(axis.dropped, CODE_DROPS);
    ok(text.includes("axis Test — 4 batches: no motif kept, 4 dropped\n"), text);
    ok(text.endsWith("→ nothing to decide: the axes return once new gaps arrive"), text);
  });

  it("takes a kept line of the harness out of the lines removed", async () => {
    // Arrange
    const f = motifsRemovingAKeptLine();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    const axis = writtenTestAxis(f.files);
    deepStrictEqual(axis.motifs.map((m) => m.linesRemoved), [["Keep it short."]]);
    deepStrictEqual(axis.dropped, [{ title: "Only the kept line", filter: "novelty", reason: "its removed line is kept (harness refusal)" }]);
  });

  it("asks again with the problems, then keeps the second answer", async () => {
    // Arrange
    const f = badThenGoodAnswer();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 2);
    assertMentions(f.llm.extracts[1].prompt, ["answer again", `- ${MOTIF_1}: row 'abc' is not one of the rows given`]);
    strictEqual(writtenTestAxis(f.files).outcome, "proposed");
  });

  it("tells the second try the whole parse error, on one line", async () => {
    // Arrange
    const f = twoFailedAnswers();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    assertMentions(f.llm.extracts[1].prompt, ["the answer did not parse: bad json at 3"]);
  });

  it("records no proposal when both tries fail, and still writes the file", async () => {
    // Arrange
    const f = twoFailedAnswers();

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 2);
    const axis = writtenTestAxis(f.files);
    strictEqual(axis.outcome, "no-proposal");
    strictEqual(axis.reason, "the answer did not parse: still bad");
    ok(text.includes("axis Test — 4 batches: no proposal (the answer did not parse: still bad)\n"), text);
    strictEqual(f.files.writes.length, 2);
  });

  it("says an owner is absent, and names a removed line it cannot find", async () => {
    // Arrange
    const f = motifsWithAbsentOwners();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    deepStrictEqual(writtenTestAxis(f.files).motifs.map((m) => m.reconcile), [
      "owner absent: docs/missing.md",
      "owner absent: .claude/skills/dev-verify/references/audit-axes.md",
      "'refusal' on 1 lines of CONTRIBUTING.md, first CONTRIBUTING.md:3; removed line not found: A line nobody wrote.",
    ]);
    assertNoClaudeWrite(f.files);
  });

  it("skips an axis whose rows are those an earlier run kept no motif for", async () => {
    // Arrange
    const f = earlierRunKeptNoMotif();

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 0);
    ok(text.includes("axis Test — unchanged since learn-2026-10-20: no call\n"), text);
    strictEqual(writtenTestAxis(f.files).outcome, "unchanged");
  });

  it("writes nothing when no axis spans three batches", async () => {
    // Arrange
    const f = noAxisOverThree();

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    ok(text.endsWith("dev-learn: no axis has untreated gaps in 3 batches or more (Reuse 2, Test 2, Scope 1, Conventions 1, Placement 1): nothing written"), text);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });

  it("proposes nothing for an axis asked for under three batches, and writes nothing", async () => {
    // Arrange
    const f = noAxisOverThree();

    // Act
    const text = await runDevLearn({ axis: "Reuse" }, f.deps);

    // Assert
    strictEqual(text, `${HEAD_TWO_TREATED}\naxis Reuse — 2 batches, under the 3 a motif needs: nothing to propose`);
    strictEqual(f.llm.extracts.length, 0);
    deepStrictEqual(f.files.writes, []);
  });

  it("returns BLOCKED when a file cannot be written", async () => {
    // Arrange
    const f = diskFull();

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    ok(text.endsWith(`dev-learn: BLOCKED — workbench/learn-2026-10-22/proposals.json cannot be written (disk full: ${WORKSPACE}/workbench/learn-2026-10-22/proposals.json)`), text);
  });
});

describe("runDevLearn — the owner lines", () => {
  it("asks again with the owner lines when the owner holds a new motif's key term", async () => {
    // Arrange
    const f = newMotifFoundInOwner();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 2);
    assertMentions(f.llm.extracts[1].prompt, OWNER_LINES_REASK);
  });

  it("keeps the answer given with the owner lines, reconciled again", async () => {
    // Arrange
    const f = newMotifFoundInOwner();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    const [m] = writtenTestAxis(f.files).motifs;
    deepStrictEqual([m.status, m.reconcile], ["refines", "'refusal' on 1 lines of CONTRIBUTING.md, first CONTRIBUTING.md:3"]);
  });

  it("asks again naming a removed line the owner lacks, with the nearest line its key term finds", async () => {
    // Arrange
    const f = removedLineNotInOwner();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    assertMentions(f.llm.extracts[1].prompt, [REMOVED_LINE_PROBLEM]);
  });

  it("keeps the first answer when the one given with the owner lines does not parse", async () => {
    // Arrange
    const f = ownerLinesThenBadAnswer();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 2);
    const axis = writtenTestAxis(f.files);
    deepStrictEqual([axis.outcome, axis.motifs[0].status], ["proposed", "new"]);
  });

  it("keeps the first answer when the one given with the owner lines fails its check", async () => {
    // Arrange
    const f = ownerLinesThenRefusedAnswer();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 2);
    const axis = writtenTestAxis(f.files);
    deepStrictEqual([axis.outcome, axis.motifs[0].status], ["proposed", "new"]);
  });

  it("asks no more once a refused shape spent the re-ask: the owner lines only annotate the motif", async () => {
    // Arrange
    const f = badThenGoodAnswer();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 2);
    ok(writtenTestAxis(f.files).motifs[0].reconcile.endsWith("; the owner may already say it"));
  });

  it("shows a harness owner's lines under its orkeon-workshop path", async () => {
    // Arrange
    const f = harnessOwnerHoldsKeyTerm();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    assertMentions(f.llm.extracts[1].prompt, [HARNESS_OWNER_LINES]);
  });

  it("refuses a first answer that refines a line it was not shown, and asks again with the owner lines", async () => {
    // Arrange
    const f = refinesBeforeOwnerLines();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    assertMentions(f.llm.extracts[1].prompt, UNSEEN_REFINES_REASK);
  });

  it("keeps a refining answer given again once the owner lines are shown", async () => {
    // Arrange
    const f = refinesBeforeOwnerLines();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    const [m] = writtenTestAxis(f.files).motifs;
    deepStrictEqual([m.status, m.linesRemoved], ["refines", ["A refusal is part of a command's contract."]]);
  });

  it("asks once when the code drops every motif the owner lines concern", async () => {
    // Arrange
    const f = motifsDroppedByCode();

    // Act
    await runDevLearn({}, f.deps);

    // Assert
    strictEqual(f.llm.extracts.length, 1);
  });
});

describe("runDevLearn — refusals", () => {
  for (const axis of BAD_AXES) {
    it(`refuses a bad input axis ${JSON.stringify(axis.slice(0, 12))} (${axis.length} characters)`, async () => {
      // Arrange
      const f = setup();

      // Act
      const text = await runDevLearn({ axis }, f.deps);

      // Assert
      strictEqual(text, "dev-learn: bad input axis");
      strictEqual(f.shell.commands.length, 0);
    });
  }

  it("refuses outside the top of the repository", async () => {
    // Arrange
    const f = setup();
    f.shell.results[GIT_TOPLEVEL] = { stdout: `${WORKSPACE}/sub\n` };

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    strictEqual(text,
      `dev-learn: the git work tree is ${WORKSPACE}/sub, not ${WORKSPACE}: run Orkeon Code at the top of the repository`);
  });

  it("refuses a work folder in the main worktree", async () => {
    // Arrange
    const f = setup();
    f.files.files.set(`${WORKSPACE}/.orkeon/repo.yaml`, "layout:\n  work: tasks\n");
    f.shell.results[GIT_WORKTREE_LIST] = { stdout: "worktree /main\nHEAD abc\n" };

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    ok(text.endsWith("dev-learn: the work folder /main/tasks is in the main worktree, outside the mounts: run /dev-learn from the main checkout"), text);
    deepStrictEqual(f.files.writes, []);
  });

  it("refuses an absent work folder", async () => {
    // Arrange
    const f = setup();
    f.files.listings.set(WORKSPACE, ["CONTRIBUTING.md"]);

    // Act
    const text = await runDevLearn({}, f.deps);

    // Assert
    strictEqual(text, "dev-learn: no work folder workbench/: nothing to learn from");
  });
});
