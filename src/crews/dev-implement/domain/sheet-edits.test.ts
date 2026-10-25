// The sheet's assumptions and the done marks of the close. Run:
//   node --test src/crews/dev-implement/domain/sheet-edits.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { addAssumptions, assumptionsOf, markPlanBatchDone, markSheetDone } from "./sheet-edits.ts";
import { ADD_CASES, H1_H2_ROWS, PLAN_CASES, SHEET_WITH_H1 } from "./sheet-edits.fixtures.ts";

describe("assumptionsOf", () => {
  it("reads the Assumption lines of an answer once each", () => {
    // Arrange
    const answer = "done\nAssumption: dates are UTC\n- **Assumption**: a | b\nAssumption: dates are UTC";

    // Act
    const assumptions = assumptionsOf(answer);

    // Assert
    deepStrictEqual(assumptions, ["dates are UTC", "a / b"]);
  });

  it("drops a line that assumes nothing", () => {
    // Arrange
    const answer = "Assumption: none needed — the plan fixes the value\nAssumption: N/A\nAssumption: nothing\n"
      + "Assumption: nonempty lists only";

    // Act
    const assumptions = assumptionsOf(answer);

    // Assert
    deepStrictEqual(assumptions, ["nonempty lists only"]);
  });
});

describe("addAssumptions", () => {
  for (const c of ADD_CASES) {
    it(c.name, () => {
      // Arrange
      const { sheet, assumptions } = c;

      // Act
      const edit = addAssumptions(sheet, assumptions);

      // Assert
      strictEqual(edit.text, c.expected);
    });
  }

  it("numbers on after the rows it added, an assumption already there not added again", () => {
    // Arrange
    const sheet = SHEET_WITH_H1;

    // Act
    const second = addAssumptions(sheet, ["dates are UTC", "ids are stable"]);

    // Assert
    deepStrictEqual(second.added, ["ids are stable"]);
    strictEqual(second.text.includes(H1_H2_ROWS), true);
  });
});

describe("done marks", () => {
  it("marks the sheet's title", () => {
    // Arrange
    const sheet = "# DEMO-PLAN-F1 — Demo\n";

    // Act
    const done = markSheetDone(sheet, "2026-10-24");

    // Assert
    strictEqual(done, "# DEMO-PLAN-F1 — Demo — done (2026-10-24)\n");
  });

  it("marks the sheet's title once", () => {
    // Arrange
    const done = "# DEMO-PLAN-F1 — Demo — done (2026-10-24)\n";

    // Act
    const again = markSheetDone(done, "2026-10-25");

    // Assert
    strictEqual(again, done);
  });

  for (const c of PLAN_CASES) {
    it(c.name, () => {
      // Arrange
      const { plan, batch } = c;

      // Act
      const marked = markPlanBatchDone(plan, batch, "2026-10-24");

      // Assert
      strictEqual(marked, c.expected);
    });
  }
});
