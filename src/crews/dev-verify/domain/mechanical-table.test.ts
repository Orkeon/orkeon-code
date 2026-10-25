// Unit tests for the mechanical table. Run:
//   node --test src/crews/dev-verify/domain/mechanical-table.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { escapeCell, mechanicalRows, renderTable } from "./mechanical-table.ts";
import { FOURTEEN_FLAGGED, ROW_GROUPS, ROW_TITLES, TABLE_HEAD, tableInput } from "./mechanical-table.fixtures.ts";
import { assertRowOutcome } from "./mechanical-table.assertions.ts";

describe("mechanicalRows", () => {
  it("gives the 10 rows in order", () => {
    // Arrange
    const input = tableInput();

    // Act
    const rows = mechanicalRows(input);

    // Assert
    deepStrictEqual(rows.map((r) => `${r.axis}: ${r.check}`), [...ROW_TITLES]);
  });

  for (const [group, cases] of ROW_GROUPS) {
    for (const c of cases) {
      it(`${group}: ${c.name}`, () => {
        // Arrange
        const input = tableInput(c.over);

        // Act
        const row = mechanicalRows(input)[c.index];

        // Assert
        assertRowOutcome(row, c.expected);
      });
    }
  }

  it("row 6, the cost: shows twelve flagged constructs and counts the others", () => {
    // Arrange
    const input = tableInput({ cost: { state: "measured", exit: 2, flagged: [...FOURTEEN_FLAGGED], costLine: "", detail: "" } });

    // Act
    const row = mechanicalRows(input)[5];

    // Assert
    strictEqual(row.evidence, `\`exit: 2\` ${FOURTEEN_FLAGGED.slice(0, 12).join(" · ")} · … +2`);
  });

  it("is never ok for the build when nothing ran", () => {
    // Arrange
    const input = tableInput({ build: { state: "none" } });

    // Act
    const [build] = mechanicalRows(input);

    // Assert
    strictEqual(build.result, "not checked");
  });
});

describe("escapeCell and renderTable", () => {
  it("escapes pipes and line breaks", () => {
    // Arrange
    const text = "a | b\nc\r\nd";

    // Act
    const cell = escapeCell(text);

    // Assert
    strictEqual(cell, "a \\| b · c · d");
  });

  it("writes the heading and the header lines", () => {
    // Arrange
    const rows = mechanicalRows(tableInput());

    // Act
    const lines = renderTable("F2", rows).split("\n");

    // Assert
    deepStrictEqual(lines.slice(0, 4), [...TABLE_HEAD]);
    strictEqual(lines[4], "| Build | capture `build` | ok | `exit: 0` (run) |");
    strictEqual(lines.length, 15);
    strictEqual(lines[14], "");
  });
});
