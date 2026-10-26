// Learning rows of the verdict files: folding, axes, ids, filters, backlog, listing, and parity with the
// harness's learning script over tests/fixtures/dev/learn.
// Run:
//   node --test src/shared/domain/shared-memory/verdict-rows.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";

import { parseVerdictFile } from "../dev/verdict-format.ts";
import {
  LEARN_FILE, MIN_MOTIF_BATCHES, axisListing, backlogByAxis, canonicalAxis, collectLearnRows, foldText,
  learnRowsOf, rowId, rowIdSource, shortCell, untreated,
} from "./verdict-rows.ts";
import {
  AXES, BACKLOG_ROWS, DEMO_ROWS, FOLDS, LEARN_FILE_NAMES, RECORDED_AXES, SHORT_CELLS, STOPPED_AUDIT, TWO_FOLDERS,
  VALID_THEN_GAPS, demo, project, recorded, row, sources, treatedIds,
} from "./verdict-rows.fixtures.ts";

describe("foldText and canonicalAxis", () => {
  for (const c of FOLDS) {
    it(`folds case and diacritics: ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const folded = foldText(text);

      // Assert
      strictEqual(folded, c.expected);
    });
  }

  for (const c of AXES) {
    it(`matches an axis by folded prefix, the plan alias, else the trimmed label: ${c.name}`, () => {
      // Arrange
      const { text } = c;

      // Act
      const axis = canonicalAxis(text);

      // Assert
      strictEqual(axis, c.expected);
    });
  }
});

describe("ids", () => {
  it("joins batch, axis and gap with one pipe", () => {
    // Arrange
    const batch = "demo/F2";

    // Act
    const source = rowIdSource(batch, "Test", "g");

    // Assert
    strictEqual(source, "demo/F2|Test|g");
  });

  it("gives the demo ids the script gives", () => {
    // Arrange
    const verdict = parseVerdictFile(demo());

    // Act
    const rows = learnRowsOf(verdict, "demo", "DEMO-VERIFY-F2.md");

    // Assert
    deepStrictEqual(rows.map((r) => [r.id, r.batch, r.axis, r.gap, r.source]), DEMO_ROWS);
    strictEqual(rows[0].line, 7);
  });

  it("computes the id of a row from its batch, axis and gap", () => {
    // Arrange
    const gap = "The refusal of `a/b` is never exercised";

    // Act
    const id = rowId("demo/F2", "Test", gap);

    // Assert
    strictEqual(id, "68abc1ec48");
  });

  it("leaves out the row of an audit the budget stopped", () => {
    // Arrange
    const verdict = parseVerdictFile(STOPPED_AUDIT);

    // Act
    const rows = learnRowsOf(verdict, "demo", "DEMO-VERIFY-F3.md");

    // Assert
    deepStrictEqual(rows, []);
  });

  it("uses the folder name for the batch, not the file prefix", () => {
    // Arrange
    const verdict = parseVerdictFile(demo());

    // Act
    const rows = learnRowsOf(verdict, "other", "DEMO-VERIFY-F2.md");

    // Assert
    strictEqual(rows[0].batch, "other/F2");
  });
});

describe("learnRowsOf", () => {
  it("keeps GAPS sections and Blocking/Major rows only", () => {
    // Arrange
    const verdict = parseVerdictFile(VALID_THEN_GAPS);

    // Act
    const rows = learnRowsOf(verdict, "c", "C-VERIFY-F1.md");

    // Assert
    deepStrictEqual(rows.map((r) => r.gap), ["b"]);
  });

  it("gives no row for a name LEARN_FILE refuses", () => {
    // Arrange
    const verdict = parseVerdictFile(VALID_THEN_GAPS);

    // Act
    const rows = learnRowsOf(verdict, "c", "C-VERIFY-F1b.md");

    // Assert
    deepStrictEqual(rows, []);
  });

  for (const c of LEARN_FILE_NAMES) {
    it(`LEARN_FILE ${c.name}`, () => {
      // Arrange
      const { file } = c;

      // Act
      const matches = LEARN_FILE.test(file);

      // Assert
      strictEqual(matches, c.matches);
    });
  }
});

describe("collectLearnRows", () => {
  it("sorts whole paths and keeps the first row of an id", () => {
    // Arrange
    const sources = TWO_FOLDERS;

    // Act
    const rows = collectLearnRows(sources);

    // Assert
    deepStrictEqual(rows.map((r) => [r.batch, r.evidence]), [["a-b/F1", "e"], ["a/F1", "e"]]);
  });
});

describe("untreated and backlogByAxis", () => {
  it("drops treated ids", () => {
    // Arrange
    const treated = new Set(["2", "5"]);

    // Act
    const rows = untreated(BACKLOG_ROWS, treated);

    // Assert
    deepStrictEqual(rows.map((r) => r.id), ["1", "3", "4", "6", "7"]);
  });

  it("orders axes by distinct batches, ties in first-seen order", () => {
    // Arrange
    const rows = BACKLOG_ROWS;

    // Act
    const b = backlogByAxis(rows);

    // Assert
    deepStrictEqual(b.map((a) => [a.axis, a.batches, a.rows.map((r) => r.id), a.blocking]), [
      ["Test", ["x/F1", "x/F2", "z/F1"], ["2", "3", "7"], 1],
      ["Plan", ["x/F1", "x/F2"], ["1", "6"], 0],
      ["Scope", ["y/F1", "y/F2"], ["4", "5"], 0],
    ]);
    strictEqual(b[0].batches.length >= MIN_MOTIF_BATCHES, true);
  });
});

describe("shortCell and axisListing", () => {
  for (const c of SHORT_CELLS) {
    it(`collapses whitespace runs and cuts at n with three dots: ${c.name}`, () => {
      // Arrange
      const { text, n } = c;

      // Act
      const cell = n === undefined ? shortCell(text) : shortCell(text, n);

      // Assert
      strictEqual(cell, c.expected);
    });
  }

  it("prints two lines per row", () => {
    // Arrange
    const rows = [row("1", "x/F1", "Test", "Blocking")];

    // Act
    const listing = axisListing(rows);

    // Assert
    deepStrictEqual(listing, ["- [Blocking] gap 1", "  fix: f · x/F1 · e"]);
  });
});

describe("verdict rows against the harness's script", () => {
  it("gives the recorded rows, ids and order", () => {
    // Arrange
    const files = sources();

    // Act
    const rows = collectLearnRows(files);

    // Assert
    deepStrictEqual(rows.map(project), JSON.parse(recorded("rows.py.json")));
  });

  for (const axis of RECORDED_AXES) {
    it(`lists axis ${axis} as the script does, treated rows left out`, () => {
      // Arrange
      const picked = untreated(collectLearnRows(sources()), treatedIds()).filter((r) => r.axis === canonicalAxis(axis));

      // Act
      const listing = axisListing(picked);

      // Assert
      strictEqual(listing.join("\n") + "\n", recorded(`axis-${axis}.py.txt`));
    });
  }
});
