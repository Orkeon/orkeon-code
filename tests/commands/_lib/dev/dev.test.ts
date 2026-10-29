// /dev-status, the /dev-verify arguments, the /dev-learn arguments and decisions, and the
// /dev-plan arguments and Blocking gate (commands/_lib/dev/dev.ts) over FakeFiles, FakeShell and a config store on
// FakeFiles. The fixture work folder tests/fixtures/dev/workbench/demo/ is loaded into
// FakeFiles, so the batches and ticks the command prints are pinned to the files. Run:
//   node --test tests/commands/_lib/dev/dev.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import {
  DEV_LEARN_USAGE, DEV_PLAN_USAGE, DEV_STATUS_USAGE, MAX_LINE_CHARS,
  devPlanGate, parseDevLearnArgs, parseDevPlanArgs, runDevLearnDecision, runDevStatus,
} from "../../../../src/commands/_lib/dev/dev.ts";
import { serializeLearnState } from "../../../../src/shared/domain/dev/learn-state.ts";
import {
  BLOCKED_GATE,
  BLOCKED_SPEC,
  CODES_LINES,
  DECIDED_OR_UNKNOWN_LINES,
  DECIDED_STATE,
  DEMO_STATUS_LINES,
  DISAGREEMENT_WARNINGS,
  HARNESS_ACCEPTED_LINES,
  HARNESS_ACCEPTED_STATE,
  LEARN_ACCEPTED_CASES,
  LEARN_REFUSED_CASES,
  LEARN_USAGE_TEXT,
  LINKED_WORKTREE_LINES,
  LINKED_WORKTREE_REFUSAL,
  PLAN_ACCEPTED_CASES,
  PLAN_REFUSED_CASES,
  PLAN_USAGE_TEXT,
  PROBE_WARNING,
  REFUSED,
  REFUSED_BY_ID_LINES,
  RELAUNCHED_F2_END,
  REMOTE,
  REMOTE_FAILURES,
  REPO_ACCEPTED_LINE,
  SPEC,
  STATE,
  addBareFolder,
  addUnreadableProposals,
  devDeps,
  failWorkFolderListing,
  failWrites,
  fortyBatchPlan,
  learnDeps,
  linkedWorktree,
  makeFilesDisagree,
  readSpecAsNothing,
  relaunchF2,
  stateOf,
  thirtyCodes,
  writtenPaths,
} from "./dev.fixtures.ts";
import { assertCappedCodesLine, assertLinesWithin, assertNoHarnessWrite, assertRefusedWith } from "./dev.assertions.ts";
import { WORKSPACE } from "../../../../src/shared/domain/vfs.ts";

describe("/dev-status <code> over the fixture folder", () => {
  it("prints the batches and the ticks the files hold, one line each", async () => {
    // Arrange
    const deps = devDeps();

    // Act
    const view = await runDevStatus(["demo"], deps);

    // Assert
    strictEqual(view.text, undefined);
    strictEqual(view.table, undefined);
    deepStrictEqual(view.lines, DEMO_STATUS_LINES);
  });

  it("says a batch the log relaunched is running, with its last event", async () => {
    // Arrange
    const deps = devDeps();
    relaunchF2(deps);

    // Act
    const lines = (await runDevStatus(["demo"], deps)).lines ?? [];

    // Assert
    ok(lines.some((l) => l.startsWith("F2 ") && l.endsWith(RELAUNCHED_F2_END)), lines.join("\n"));
  });

  it("warns when the plan and the other files disagree", async () => {
    // Arrange
    const deps = devDeps();
    makeFilesDisagree(deps);

    // Act
    const lines = (await runDevStatus(["demo"], deps)).lines ?? [];

    // Assert
    deepStrictEqual(lines.filter((l) => l.startsWith("warning: ")), DISAGREEMENT_WARNINGS);
    ok(lines.includes("F7 Stray — not in the plan — sheet RED 0/0 GREEN 0/0 COST 0/0 — no verdict"));
  });
});

describe("/dev-status without a code", () => {
  it("lists the codes of the work folder", async () => {
    // Arrange
    const deps = devDeps();

    // Act
    const view = await runDevStatus([], deps);

    // Assert
    deepStrictEqual(view.lines, CODES_LINES);
  });

  it("says there is no code when the default folder is absent, and creates nothing", async () => {
    // Arrange
    const deps = devDeps();
    deps.files.listings.set(WORKSPACE, []);

    // Act
    const view = await runDevStatus([], deps);

    // Assert
    deepStrictEqual(view.lines?.slice(2), [
      "no code under workbench/ (a code is a folder holding SPEC-, CHANGE- or *-PLAN.md files)",
      PROBE_WARNING,
    ]);
    deepStrictEqual(deps.files.writes, []);
  });

  it("keeps the codes line of 30 codes within the line cap and says how many it left out", async () => {
    // Arrange
    const deps = devDeps();
    const codes = thirtyCodes(deps);

    // Act
    const lines = (await runDevStatus([], deps)).lines ?? [];

    // Assert
    assertCappedCodesLine(lines.find((l) => l.startsWith("codes (30): ")) ?? "", codes, MAX_LINE_CHARS);
  });

  it("refuses when the work folder cannot be listed", async () => {
    // Arrange
    const deps = devDeps();
    failWorkFolderListing(deps);

    // Act
    const view = await runDevStatus([], deps);

    // Assert
    strictEqual(view.text, "dev-status: workbench/ cannot be listed (permission denied)");
  });
});

describe("/dev-status refusals", () => {
  it("prints the usage for two codes, with nothing run", async () => {
    // Arrange
    const deps = devDeps();

    // Act
    const view = await runDevStatus(["a", "b"], deps);

    // Assert
    deepStrictEqual(view, { text: DEV_STATUS_USAGE });
    deepStrictEqual(deps.shell.commands, []);
  });

  it("refuses what is not a code, after the context lines", async () => {
    // Arrange
    const deps = devDeps();

    // Act
    const view = await runDevStatus(["../x"], deps);

    // Assert
    strictEqual(view.text,
      "dev-status: '../x' is not a code: letters, digits, '.', '_' and '-', starting with a letter or a digit");
    deepStrictEqual(view.lines, ["work folder: workbench/ (default)", "pack: none", PROBE_WARNING]);
  });

  it("refuses an absent code naming the codes there are", async () => {
    // Arrange
    const deps = devDeps();

    // Act
    const view = await runDevStatus(["other"], deps);

    // Assert
    strictEqual(view.text, "dev-status: no folder workbench/other/ (codes here: demo)");
  });

  it("refuses a folder with no artefact", async () => {
    // Arrange
    const deps = devDeps();
    addBareFolder(deps);

    // Act
    const view = await runDevStatus(["bare"], deps);

    // Assert
    strictEqual(view.text, "dev-status: workbench/bare/ holds no SPEC-, CHANGE- or *-PLAN.md file");
  });

  it("refuses from a linked worktree whose work folder is the main worktree's", async () => {
    // Arrange
    const deps = devDeps();
    linkedWorktree(deps);

    // Act
    const view = await runDevStatus(["demo"], deps);

    // Assert
    strictEqual(view.text, LINKED_WORKTREE_REFUSAL);
    deepStrictEqual(view.lines, LINKED_WORKTREE_LINES);
  });
});

describe("/dev-status output size", () => {
  it("shrinks a 40-batch plan of long lines with many warnings to 15 batch lines under the budget", async () => {
    // Arrange
    const deps = devDeps();
    fortyBatchPlan(deps);

    // Act
    const lines = (await runDevStatus(["demo"], deps)).lines ?? [];

    // Assert
    const batchLines = lines.filter((l) => /^F\d+ /.test(l));
    ok(batchLines.every((l) => l.length === MAX_LINE_CHARS), batchLines.join("\n"));
    strictEqual(batchLines.length, 15);
    // The full rendering holds at least the five batch lines dropped here: it would pass the budget.
    ok(lines.join("\n").length + 5 * (MAX_LINE_CHARS + 1) > 3900, `${lines.join("\n").length} characters`);
    strictEqual(lines.filter((l) => l.startsWith("warning: ")).length, 3);
    ok(lines.join("\n").length <= 3900, `${lines.join("\n").length} characters`);
    assertLinesWithin(lines, 200);
    ok(lines.includes("… 37 more batches (F16 to F111)"), lines.join("\n"));
    ok(lines.some((l) => /^… \d+ more warnings$/.test(l)));
  });
});

describe("parseDevLearnArgs", () => {
  it("states its usage line", () => {
    // Arrange
    const expected = LEARN_USAGE_TEXT;

    // Act
    const usage = DEV_LEARN_USAGE;

    // Assert
    strictEqual(usage, expected);
  });

  for (const c of LEARN_REFUSED_CASES) {
    it(`${c.name}, with its own text`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevLearnArgs(tokens);

      // Assert
      assertRefusedWith(parsed, c.text);
    });
  }

  for (const c of LEARN_ACCEPTED_CASES) {
    it(c.name, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevLearnArgs(tokens);

      // Assert
      deepStrictEqual(parsed.ok ? parsed.args : null, c.args);
    });
  }

  it("refuses --list after the refused words", () => {
    // Arrange
    const tokens = ["--refuse", "x", "--list"];

    // Act
    const parsed = parseDevLearnArgs(tokens);

    // Assert
    strictEqual(parsed.ok, false);
  });
});

describe("/dev-learn --accept", () => {
  it("prints the patch of a harness motif and writes the state only", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: ["3f2a9c1e"] }, deps);

    // Assert
    deepStrictEqual(text.split("\n"), HARNESS_ACCEPTED_LINES);
    deepStrictEqual(writtenPaths(deps), [STATE]);
    deepStrictEqual(stateOf(deps), HARNESS_ACCEPTED_STATE);
    assertNoHarnessWrite(writtenPaths(deps));
  });

  it("prints the change of a repository motif and writes no owner file", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: ["77b0d2aa"] }, deps);

    // Assert
    ok(text.includes(REPO_ACCEPTED_LINE), text);
    deepStrictEqual(writtenPaths(deps), [STATE]);
  });

  it("marks the axis's shown rows treated once every motif of it is decided", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: ["3f2a9c1e", "77b0d2aa"] }, deps);

    // Assert
    const lines = text.split("\n");
    ok(lines.includes("axis Test done: 4 gaps marked treated"), text);
    strictEqual(lines.at(-1), "state: .orkeon/dev-learn-state.json — 4 gaps treated in all");
    deepStrictEqual(stateOf(deps).treated, ["1111111111", "2222222222", "3333333333", "68abc1ec48"]);
    deepStrictEqual(writtenPaths(deps), [STATE]);
  });

  it("says an id is already decided, or unknown, and writes nothing then", async () => {
    // Arrange
    const deps = learnDeps();
    deps.files.files.set(STATE, serializeLearnState(DECIDED_STATE));

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: ["3f2a9c1e", "deadbeef"] }, deps);

    // Assert
    deepStrictEqual(text.split("\n"), DECIDED_OR_UNKNOWN_LINES);
    deepStrictEqual(deps.files.writes, []);
  });

  it("refuses an invalid state and never overwrites it", async () => {
    // Arrange
    const deps = learnDeps();
    deps.files.files.set(STATE, "{ not json");

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: ["3f2a9c1e"] }, deps);

    // Assert
    const last = text.split("\n").at(-1) ?? "";
    ok(last.startsWith("dev-learn: .orkeon/dev-learn-state.json is not JSON ("), last);
    ok(last.endsWith("): fix or delete it; nothing was written"), last);
    deepStrictEqual(deps.files.writes, []);
  });

  it("warns on an unreadable proposals.json and looks further", async () => {
    // Arrange
    const deps = learnDeps();
    addUnreadableProposals(deps);

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: ["3f2a9c1e"] }, deps);

    // Assert
    ok(text.includes("warning: workbench/learn-2026-10-22/proposals.json cannot be read (the top level has the wrong shape)"), text);
    ok(text.includes("accepted 3f2a9c1e — "), text);
  });

  it("says BLOCKED when the state cannot be written", async () => {
    // Arrange
    const deps = learnDeps();
    failWrites(deps);

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: ["3f2a9c1e"] }, deps);

    // Assert
    strictEqual(text.split("\n").at(-1), "dev-learn: BLOCKED — .orkeon/dev-learn-state.json cannot be written (read-only mount)");
  });
});

describe("/dev-learn --refuse", () => {
  it("refuses a motif by its id: the refused.md line, the project from the remote, the rows treated", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "refuse", target: "3f2a9c1e" }, deps);

    // Assert
    deepStrictEqual(text.split("\n"), REFUSED_BY_ID_LINES);
    deepStrictEqual(writtenPaths(deps), [REFUSED, STATE]);
    ok((deps.files.files.get(REFUSED) ?? "").endsWith(
      "\nrefusal-paths-untested | orkeon-code | 2026-10-22 | Refusal paths go untested\n"));
    ok((deps.files.files.get(REFUSED) ?? "").startsWith("# Refused motifs\n"));
    strictEqual(stateOf(deps).decisions[0].decision, "refused");
    ok(deps.shell.commands.includes(REMOTE));
    assertNoHarnessWrite(writtenPaths(deps));
  });

  it("refuses free text: a topic from the words, no row treated, no state written", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "refuse", target: "Règle d'or: pas de I/O" }, deps);

    // Assert
    strictEqual(text.split("\n").at(-1), "refused: regle-d-or-pas-de-i-o — left out of future proposals (.orkeon/memory/refused.md)");
    deepStrictEqual(writtenPaths(deps), [REFUSED]);
    ok((deps.files.files.get(REFUSED) ?? "").includes("\nregle-d-or-pas-de-i-o | orkeon-code | 2026-10-22 | Règle d'or: pas de I/O\n"));
  });

  it("does not append a topic refused already", async () => {
    // Arrange
    const deps = learnDeps();
    await runDevLearnDecision({ kind: "refuse", target: "rounding inside handlers" }, deps);
    const before = deps.files.files.get(REFUSED);

    // Act
    const text = await runDevLearnDecision({ kind: "refuse", target: "Rounding inside handlers" }, deps);

    // Assert
    strictEqual(text.split("\n").at(-1), "rounding-inside-handlers was already refused on 2026-10-22");
    strictEqual(deps.files.files.get(REFUSED), before);
    strictEqual(deps.files.writes.length, 1);
  });

  for (const c of REMOTE_FAILURES) {
    it(`names the project local when the remote ${c.name}`, async () => {
      // Arrange
      const deps = learnDeps();
      c.fail(deps);

      // Act
      await runDevLearnDecision({ kind: "refuse", target: "rounding inside handlers" }, deps);

      // Assert
      ok((deps.files.files.get(REFUSED) ?? "").includes("\nrounding-inside-handlers | local | 2026-10-22 | rounding inside handlers\n"), c.name);
    });
  }

  it("refuses an id-shaped target that no proposal holds", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "refuse", target: "deadbeef" }, deps);

    // Assert
    strictEqual(text.split("\n").at(-1),
      "dev-learn: no proposal deadbeef in the 10 newest workbench/learn-*/ folders (to refuse a motif by its words, write more than an id)");
    deepStrictEqual(deps.files.writes, []);
  });

  it("says when there is no work folder", async () => {
    // Arrange
    const deps = learnDeps();
    deps.files.listings.set(WORKSPACE, []);

    // Act
    const text = await runDevLearnDecision({ kind: "refuse", target: "anything" }, deps);

    // Assert
    strictEqual(text, "dev-learn: no work folder workbench/: nothing to learn from");
    deepStrictEqual(deps.files.writes, []);
  });
});

describe("parseDevPlanArgs", () => {
  it("states its usage line", () => {
    // Arrange
    const expected = PLAN_USAGE_TEXT;

    // Act
    const usage = DEV_PLAN_USAGE;

    // Assert
    strictEqual(usage, expected);
  });

  for (const c of PLAN_ACCEPTED_CASES) {
    it(`takes at most one source and --replace anywhere: ${c.name}`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevPlanArgs(tokens);

      // Assert
      deepStrictEqual(parsed, { ok: true, args: c.args });
    });
  }

  for (const c of PLAN_REFUSED_CASES) {
    it(`${c.name}, with its own text`, () => {
      // Arrange
      const { tokens } = c;

      // Act
      const parsed = parseDevPlanArgs(tokens);

      // Assert
      assertRefusedWith(parsed, c.text);
    });
  }
});

describe("devPlanGate", () => {
  it("lets a source with no Blocking question through to the crew", async () => {
    // Arrange
    const deps = devDeps();

    // Act
    const gate = await devPlanGate({ source: "demo", replace: false }, deps);

    // Assert
    strictEqual(gate, null);
  });

  it("stops on a Blocking row with the rows and the next command, and writes nothing", async () => {
    // Arrange
    const deps = devDeps();
    deps.files.files.set(SPEC, BLOCKED_SPEC);

    // Act
    const gate = await devPlanGate({ source: "demo", replace: true }, deps);

    // Assert
    strictEqual(gate, BLOCKED_GATE);
    deepStrictEqual(deps.files.writes, []);
  });

  it("returns the refusal of a code with no spec nor brief", async () => {
    // Arrange
    const deps = devDeps();
    deps.files.listings.set(`${WORKSPACE}/workbench/nope`, ["notes.txt"]);

    // Act
    const gate = await devPlanGate({ source: "nope", replace: false }, deps);

    // Assert
    strictEqual(gate, "dev-plan: workbench/nope/ holds no SPEC-nope.md nor CHANGE-nope.md");
  });

  it("refuses with no argument when no code is left to plan", async () => {
    // Arrange
    // The demo code already has its plan.
    const deps = devDeps();

    // Act
    const gate = await devPlanGate({ source: null, replace: false }, deps);

    // Assert
    strictEqual(gate, "dev-plan: no SPEC- or CHANGE- file without a plan in workbench/: name one, e.g. /dev-plan <code>");
  });

  it("leaves a thrown error to the crew", async () => {
    // Arrange
    // A read answering no text makes the parser throw past every refusal the gate knows.
    const deps = devDeps();
    readSpecAsNothing(deps);

    // Act
    const gate = await devPlanGate({ source: "demo", replace: false }, deps);

    // Assert
    strictEqual(gate, null);
  });
});
