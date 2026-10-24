// Ticking one box of one step. Run:
//   node --test src/crews/dev-implement/domain/sheet-ticks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { tickBox } from "./sheet-ticks.ts";

const SHEET = [
  "# P-PLAN-F1 — x", "", "## TDD sequence", "", "### Step 1 — one", "TDD: RED [ ] GREEN [ ] COST [ ]", "",
  "### Step 2 — two", "TDD: RED [ ] GREEN [ ] COST [ ]", "", "### Step 3 — Build and tests", "none",
].join("\n");

describe("tickBox", () => {
  it("ticks the one box of the one step, nothing else", () => {
    const r = tickBox(SHEET, 2, "GREEN");
    strictEqual(r.ok, true);
    if (!r.ok) return;
    const lines = r.text.split("\n");
    strictEqual(lines[8], "TDD: RED [ ] GREEN [x] COST [ ]");
    strictEqual(lines[5], "TDD: RED [ ] GREEN [ ] COST [ ]");
    strictEqual(r.text.length, SHEET.length);
  });

  it("is idempotent", () => {
    const once = tickBox(SHEET, 1, "RED");
    if (!once.ok) throw new Error("not ticked");
    deepStrictEqual(tickBox(once.text, 1, "RED"), once);
  });

  it("refuses a step it lacks or one without a TDD line", () => {
    deepStrictEqual(tickBox(SHEET, 9, "RED"), { ok: false, problem: "the sheet has no step 9" });
    deepStrictEqual(tickBox(SHEET, 3, "RED"), { ok: false, problem: "step 3 has no TDD line" });
  });
});
