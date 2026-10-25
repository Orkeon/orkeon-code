// Ticking one box of one step. Run:
//   node --test src/crews/dev-implement/domain/sheet-ticks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { tickBox } from "./sheet-ticks.ts";
import { REFUSED_CASES, SHEET } from "./sheet-ticks.fixtures.ts";

describe("tickBox", () => {
  it("ticks the one box of the one step, nothing else", () => {
    // Arrange
    const sheet = SHEET;

    // Act
    const r = tickBox(sheet, 2, "GREEN");

    // Assert
    strictEqual(r.ok, true);
    ok(r.ok);
    const lines = r.text.split("\n");
    strictEqual(lines[8], "TDD: RED [ ] GREEN [x] COST [ ]");
    strictEqual(lines[5], "TDD: RED [ ] GREEN [ ] COST [ ]");
    strictEqual(r.text.length, SHEET.length);
  });

  it("is idempotent", () => {
    // Arrange
    const once = tickBox(SHEET, 1, "RED");
    if (!once.ok) throw new Error("not ticked");

    // Act
    const again = tickBox(once.text, 1, "RED");

    // Assert
    deepStrictEqual(again, once);
  });

  it("refuses a TDD line without the box", () => {
    // Arrange
    const sheet = "## TDD sequence\n### Step 1 — One\nTDD: RED [ ] GREEN [ ]\n";

    // Act
    const r = tickBox(sheet, 1, "COST");

    // Assert
    strictEqual(r.ok, false);
  });

  for (const c of REFUSED_CASES) {
    it(c.name, () => {
      // Arrange
      const { step } = c;

      // Act
      const r = tickBox(SHEET, step, "RED");

      // Assert
      deepStrictEqual(r, { ok: false, problem: c.problem });
    });
  }
});
