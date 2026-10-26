// readBacklog over FakeFiles loaded from tests/fixtures/dev/learn: the rows the
// harness's script recorded, the treated rows of both states, and each read that
// fails turned into a warning. Run:
//   node --test src/crews/dev-learn/application/learn-backlog.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { FOLDER_LIST_CAP, WORK_LIST_CAP, readBacklog } from "../../../../src/crews/dev-learn/application/learn-backlog.ts";
import {
  WORK, filesWithBothStates, filesWithInvalidStates, filesWithRefused, filesWithTwoRefused, filesWithUnreadableVerdict,
  fixtureFiles, fullFolder, project, recorded, workListing,
} from "./learn-backlog.fixtures.ts";

describe("readBacklog", () => {
  it("reads the same rows as the harness's script, hidden folders skipped, _archive read", async () => {
    // Arrange
    const files = fixtureFiles();

    // Act
    const b = await readBacklog(files, WORK);

    // Assert
    deepStrictEqual(b.rows.map(project), JSON.parse(recorded("rows.py.json")));
    strictEqual(b.files, 7);
    deepStrictEqual(b.untreated.length, b.rows.length);
    deepStrictEqual(b.warnings, []);
    deepStrictEqual(b.orkeon, { version: 1, treated: [], decisions: [] });
    deepStrictEqual(b.harness, { treated: [], refused: [] });
    deepStrictEqual(b.refused, []);
  });

  it("leaves out the rows either state treats", async () => {
    // Arrange
    const files = filesWithBothStates();

    // Act
    const b = await readBacklog(files, WORK);

    // Assert
    const ids = b.untreated.map((r) => r.id);
    ok(!ids.includes("4e865d8344") && !ids.includes("c936075d95"));
    strictEqual(ids.length, b.rows.length - 2);
    deepStrictEqual(b.harness.refused, ["Rounding inside handlers", "keep: Each command returns a CommandView."]);
  });

  it("warns on a verdict file it cannot read and goes on", async () => {
    // Arrange
    const files = filesWithUnreadableVerdict();

    // Act
    const b = await readBacklog(files, WORK);

    // Assert
    deepStrictEqual(b.warnings, ["workbench/ledger/LEDGER-VERIFY-F1.md cannot be read (permission denied)"]);
    strictEqual(b.files, 6);
    ok(!b.rows.some((r) => r.batch === "ledger/F1"));
  });

  it("reads an invalid Orkeon Code state as empty, with a warning", async () => {
    // Arrange
    const files = filesWithInvalidStates();

    // Act
    const b = await readBacklog(files, WORK);

    // Assert
    deepStrictEqual(b.orkeon, { version: 1, treated: [], decisions: [] });
    deepStrictEqual(b.harness, { treated: [], refused: [] });
    strictEqual(b.warnings.length, 1);
    ok(b.warnings[0].startsWith(".orkeon/dev-learn-state.json is not JSON ("), b.warnings[0]);
  });

  it("keeps the refused motifs and warns on each bad line of refused.md", async () => {
    // Arrange
    const files = filesWithRefused();

    // Act
    const b = await readBacklog(files, WORK);

    // Assert
    deepStrictEqual(b.refused.map((m) => m.topic), ["rounding-in-handlers"]);
    deepStrictEqual(b.warnings, ['.orkeon/memory/refused.md:line 4: not "topic | project | date | motif"']);
  });

  it("reads refused.md where memory.dir puts it, and only there", async () => {
    // Arrange
    const files = filesWithTwoRefused();

    // Act
    const b = await readBacklog(files, WORK, "docs/memory/refused.md");

    // Assert
    deepStrictEqual(b.refused.map((m) => m.topic), ["empty-exports"]);
    strictEqual(b.refusedFile, "docs/memory/refused.md");
    deepStrictEqual(b.warnings, ['docs/memory/refused.md:line 2: not "topic | project | date | motif"']);
  });

  it("warns when the work folder's listing reaches its cap", async () => {
    // Arrange
    const files = workListing(WORK_LIST_CAP + 5);

    // Act
    const b = await readBacklog(files, WORK);

    // Assert
    deepStrictEqual(b.warnings, [`workbench/ lists ${WORK_LIST_CAP} entries or more: later folders are not read`]);
    strictEqual(b.rows.length, 0);
  });

  it("warns when one code folder's listing reaches its cap", async () => {
    // Arrange
    const files = fullFolder(FOLDER_LIST_CAP);

    // Act
    const b = await readBacklog(files, WORK);

    // Assert
    deepStrictEqual(b.warnings, [`workbench/full/ lists ${FOLDER_LIST_CAP} entries or more: later files are not read`]);
    strictEqual(b.rows.length, 0);
  });
});
