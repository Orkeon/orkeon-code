// /dev-learn's decisions: the proposals of the newest learn-<date>/ folders read, --accept and --refuse, and the
// decisions taken in the run that wrote the proposals. Over FakeFiles, FakeShell, a config store on the files and
// FakeClock. Run:
//   node --test tests/shared/application/dev/learn-decision.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { decideMotifs, readProposals, runDevLearnDecision } from "../../../../src/shared/application/dev/learn-decision.ts";
import {
  ELEVEN_DATES, HARNESS_ID, LOOKUP, REFUSED, REFUSED_BY_WORDS_LINE, REPO_ID, STATE, UNKNOWN_ID, UNKNOWN_LINE, WORK, WORK_DIR,
  brokenNewest, decisionsOf, learnDeps, learnFolders, noWorkFolder, unreadableNewest,
} from "./learn-decision.fixtures.ts";
import { assertOneStateLineLast, assertRefusedTopics } from "./learn-decision.assertions.ts";
import { assertLineStarting } from "../../../support/assertions/text.ts";

describe("readProposals", () => {
  it("reads the proposals.json of each learn folder, newest first, leaving out the other folders", async () => {
    // Arrange
    const files = learnFolders(["2026-10-21", "2026-10-22"]);

    // Act
    const lookup = await readProposals(files, WORK, WORK_DIR);

    // Assert
    deepStrictEqual(lookup.files.map((f) => f.folder), ["learn-2026-10-22", "learn-2026-10-21"]);
  });

  it("looks no further than the 10 newest learn folders", async () => {
    // Arrange
    const files = learnFolders(ELEVEN_DATES);

    // Act
    const lookup = await readProposals(files, WORK, WORK_DIR);

    // Assert
    strictEqual(lookup.files.at(-1)?.folder, "learn-2026-10-02");
  });

  it("warns on a proposals.json that cannot be read and keeps the others", async () => {
    // Arrange
    const files = unreadableNewest();

    // Act
    const lookup = await readProposals(files, WORK, WORK_DIR);

    // Assert
    deepStrictEqual(lookup, {
      files: [{ folder: "learn-2026-10-21", file: LOOKUP.files[0].file }],
      warnings: ["workbench/learn-2026-10-22/proposals.json cannot be read (permission denied)"],
    });
  });

  it("warns on a proposals.json that does not parse", async () => {
    // Arrange
    const files = brokenNewest();

    // Act
    const lookup = await readProposals(files, WORK, WORK_DIR);

    // Assert
    assertLineStarting(lookup.warnings, "workbench/learn-2026-10-22/proposals.json cannot be read (");
  });
});

describe("runDevLearnDecision — --accept", () => {
  it("records a known id as accepted on the clock's day", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    await runDevLearnDecision({ kind: "accept", ids: [HARNESS_ID] }, deps);

    // Assert
    deepStrictEqual(decisionsOf(deps), [[HARNESS_ID, "accepted", "2026-10-24"]]);
  });

  it("says an unknown id is in none of the proposals", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: [UNKNOWN_ID] }, deps);

    // Assert
    assertLineStarting(text.split("\n"), UNKNOWN_LINE);
  });

  it("writes nothing when the only id is unknown", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    await runDevLearnDecision({ kind: "accept", ids: [UNKNOWN_ID] }, deps);

    // Assert
    deepStrictEqual(deps.files.writes, []);
  });

  it("refuses when the checkout has no work folder", async () => {
    // Arrange
    const deps = noWorkFolder();

    // Act
    const text = await runDevLearnDecision({ kind: "accept", ids: [HARNESS_ID] }, deps);

    // Assert
    strictEqual(text, "dev-learn: no work folder workbench/: nothing to learn from");
  });
});

describe("runDevLearnDecision — --refuse", () => {
  it("records a known id as refused, its topic in refused.md", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    await runDevLearnDecision({ kind: "refuse", target: REPO_ID }, deps);

    // Assert
    assertRefusedTopics(deps.files, REFUSED, ["fixtures-drift"]);
  });

  it("records the refused id in the state", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    await runDevLearnDecision({ kind: "refuse", target: REPO_ID }, deps);

    // Assert
    deepStrictEqual(decisionsOf(deps), [[REPO_ID, "refused", "2026-10-24"]]);
  });

  it("refuses an id absent from the proposals, saying a motif's words are refused instead", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "refuse", target: UNKNOWN_ID }, deps);

    // Assert
    strictEqual(text.split("\n").at(-1), `${UNKNOWN_LINE} (to refuse a motif by its words, write more than an id)`);
  });

  it("refuses a target given in words by the topic it folds to", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const text = await runDevLearnDecision({ kind: "refuse", target: "Flaky snapshots" }, deps);

    // Assert
    strictEqual(text.split("\n").at(-1), REFUSED_BY_WORDS_LINE);
  });
});

describe("decideMotifs", () => {
  it("records only the motifs chosen", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    await decideMotifs([HARNESS_ID], [], LOOKUP, WORK, deps);

    // Assert
    deepStrictEqual(decisionsOf(deps), [[HARNESS_ID, "accepted", "2026-10-24"]]);
  });

  it("writes no refused.md when no motif is refused", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    await decideMotifs([HARNESS_ID], [], LOOKUP, WORK, deps);

    // Assert
    deepStrictEqual(deps.files.writes.map((w) => w.path), [STATE]);
  });

  it("accepts then refuses, with one state line, the last", async () => {
    // Arrange
    const deps = learnDeps();

    // Act
    const lines = await decideMotifs([HARNESS_ID], [REPO_ID], LOOKUP, WORK, deps);

    // Assert
    assertOneStateLineLast(lines);
  });
});
