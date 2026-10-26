// Unit tests for the plan source: the Blocking gate, the ids, the title and what must not
// change, on inline texts. Run:
//   node --test tests/shared/domain/dev/spec-format.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { blockingRows, blockingStop, parsePlanSource } from "../../../../src/shared/domain/dev/spec-format.ts";
import {
  BACKTICKED, BRIEF, CRLF_TEXT, DUPLICATED_IDS, lines, nineRowsFirstLong, NO_LEADING_PIPE, row, SPEC, SPEC_STOP,
} from "./spec-format.fixtures.ts";

describe("blockingRows", () => {
  it("keeps the Blocking rows of a numbered section, whatever their emphasis or case, and ignores Major", () => {
    // Arrange
    const text = SPEC;

    // Act
    const rows = blockingRows(text);

    // Assert
    deepStrictEqual(lines(rows), [16, 18, 19]);
  });

  it("does not count a Major row whose question holds the word Blocking", () => {
    // Arrange
    const text = SPEC;

    // Act
    const rows = blockingRows(text);

    // Assert
    strictEqual(rows.some((r) => r.raw.includes("Is it Blocking?")), false);
  });

  it("opens the section on an unnumbered heading and reads a CRLF text", () => {
    // Arrange
    const text = CRLF_TEXT;

    // Act
    const rows = blockingRows(text);

    // Assert
    deepStrictEqual(rows.map((r) => r.raw), ["| 1 | Blocking | q |"]);
    deepStrictEqual(rows[0].cells, ["1", "Blocking", "q"]);
  });

  it("catches a table without a leading pipe whose first column is the severity (the column rule alone)", () => {
    // Arrange
    const text = NO_LEADING_PIPE;

    // Act
    const rows = blockingRows(text);

    // Assert
    deepStrictEqual(rows.map((r) => [r.line, r.severity]), [[4, "Blocking"]]);
  });

  it("counts a backticked severity, not a backticked cell outside the column", () => {
    // Arrange
    const text = BACKTICKED;

    // Act
    const rows = blockingRows(text);

    // Assert
    deepStrictEqual(lines(rows), [6]);
  });

  it("counts a Blocking cell alone between pipes", () => {
    // Arrange
    const text = "## Open questions\nfree text | Blocking | here\n";

    // Act
    const rows = blockingRows(text);

    // Assert
    deepStrictEqual(lines(rows), [2]);
  });

  it("reads no fence away", () => {
    // Arrange
    const text = "## Open questions\n```\n| Blocking |\n```\n";

    // Act
    const rows = blockingRows(text);

    // Assert
    deepStrictEqual(lines(rows), [3]);
  });

  it("finds nothing without the section", () => {
    // Arrange
    const text = "# x — y\n## 1. Context\n| 1 | Blocking | q |\n";

    // Act
    const rows = blockingRows(text);

    // Assert
    deepStrictEqual(rows, []);
  });
});

describe("parsePlanSource on a spec", () => {
  it("reads the title", () => {
    // Arrange
    const text = SPEC;

    // Act
    const spec = parsePlanSource(text, "spec");

    // Assert
    deepStrictEqual([spec.kind, spec.code, spec.name, spec.changeKind], ["spec", "trim", "Trim stale entries", undefined]);
  });

  it("reads UC then BR by number, with the em dash, colon and hyphen separators and the statement", () => {
    // Arrange
    const text = SPEC;

    // Act
    const spec = parsePlanSource(text, "spec");

    // Assert
    deepStrictEqual(spec.ids, [
      { id: "UC-01", title: "Trim the store", statement: "the user trims the store in one command", line: 4 },
      { id: "BR-01", title: "A stale entry goes", statement: "", line: 10 },
      { id: "BR-02", title: "Fresh entries stay", statement: "an entry newer than the cut-off is kept", line: 8 },
    ]);
    deepStrictEqual(spec.problems, []);
  });

  it("keeps every open question and the gate's rows", () => {
    // Arrange
    const text = SPEC;

    // Act
    const spec = parsePlanSource(text, "spec");

    // Assert
    deepStrictEqual(spec.openQuestions.map((q) => q.severity), ["Blocking", "Major", "**Blocking**", "blocking"]);
    deepStrictEqual(lines(spec.blocking), [16, 18, 19]);
    deepStrictEqual(spec.mustNotChange, []);
  });

  it("reports a duplicated id and keeps its first occurrence; cuts a statement at 200 characters", () => {
    // Arrange
    const text = DUPLICATED_IDS;

    // Act
    const p = parsePlanSource(text, "spec");

    // Assert
    deepStrictEqual(p.ids.map((i) => [i.title, i.statement.length]), [["First", 200]]);
    deepStrictEqual(p.problems, [{ line: 3, message: "duplicated id UC-01" }]);
  });

  it("gives no blocking row to a spec without an open-questions section", () => {
    // Arrange
    const text = "# trim — Trim\n### UC-01 — Trim\n";

    // Act
    const p = parsePlanSource(text, "spec");

    // Assert
    deepStrictEqual(p.blocking, []);
  });
});

describe("parsePlanSource on a change brief", () => {
  it("reads the title with its kind", () => {
    // Arrange
    const text = BRIEF;

    // Act
    const brief = parsePlanSource(text, "change");

    // Assert
    deepStrictEqual([brief.code, brief.name, brief.changeKind], ["slow-list", "The list is slow", "perf"]);
  });

  it("keeps CH ids by number and reports a UC/BR in a brief", () => {
    // Arrange
    const text = BRIEF;

    // Act
    const brief = parsePlanSource(text, "change");

    // Assert
    deepStrictEqual(brief.ids.map((i) => i.id), ["CH-01", "CH-02"]);
    deepStrictEqual(brief.problems, [{ line: 6, message: "BR-01 in a change brief" }]);
  });

  it("reads the pinned and unpinned rows, with or without a leading pipe", () => {
    // Arrange
    const text = BRIEF;

    // Act
    const brief = parsePlanSource(text, "change");

    // Assert
    deepStrictEqual(brief.mustNotChange, [
      { line: 10, behaviour: "the order of the list", pinnedBy: "lists in saved order" },
      { line: 11, behaviour: "the empty list prints a note", pinnedBy: null },
      { line: 12, behaviour: "a deleted entry is hidden", pinnedBy: null },
    ]);
  });

  it("reports a brief title without a kind", () => {
    // Arrange
    const text = "# slow-list — The list is slow\n";

    // Act
    const p = parsePlanSource(text, "change");

    // Assert
    deepStrictEqual([p.code, p.changeKind, p.problems], [
      "slow-list", undefined, [{ line: 1, message: "the brief's title names no kind (bug, refactor or perf)" }],
    ]);
  });
});

describe("blockingStop", () => {
  it("lists the rows and points a spec to /dev-spec", () => {
    // Arrange
    const rows = [row(1)];

    // Act
    const stop = blockingStop("workbench/trim/SPEC-trim.md", "spec", "trim", rows);

    // Assert
    strictEqual(stop, SPEC_STOP);
  });

  it("shows 8 rows of 9 then the count left, cuts a row at 200 characters, and points a brief to /dev-change", () => {
    // Arrange
    const rows = nineRowsFirstLong();

    // Act
    const out = blockingStop("workbench/s/CHANGE-s.md", "change", "s", rows).split("\n");

    // Assert
    strictEqual(out.length, 11);
    strictEqual(out[1].length, 202);
    strictEqual(out[8], "  | 8 | Blocking | q8 |");
    strictEqual(out[9], "  … 1 more");
    strictEqual(out[10], "→ Settle them first: /dev-change s, or edit the file; then /dev-plan s.");
  });
});
