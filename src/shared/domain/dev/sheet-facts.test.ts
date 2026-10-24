// Unit tests for the facts the gate reads off a batch sheet. Run:
//   node --test src/shared/domain/dev/sheet-facts.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { sheetFacts } from "./sheet-facts.ts";

const SHEET = [
  "# DEMO-PLAN-F2 — Command",
  "",
  "## Intent",
  "Covers BR-90 only by mention. **Ids**: UC-7",
  "",
  "| Applied rules | DDD-01, APP-02 (once), DDD-01, X-1 |",
  "| Applied rules | PERF-01 |",
  "",
  "## TDD sequence",
  "",
  "### Step 1 — Print the batches (BR-02)",
  "| # | Test | Level | Ids |",
  "|---|------|-------|-----|",
  "| 1 | `prints every batch` | unit | BR-02 |",
  "| 2 | `StatusTests.ShowsTheState()` | unit | BR-01, CH-3 |",
  "| 3 | `<the method>` | unit | — |",
  "| 4 | no backtick here | unit | — |",
  "| 5 | `ShowsTheState` | unit | — |",
  "",
  "TDD: RED [x] GREEN [x] COST [x]",
  "",
  "### Step 2 — A table without a Test column",
  "| # | Name | Ids |",
  "|---|------|-----|",
  "| 1 | `NotAMethod` | BR-02 |",
  "",
  "TDD: RED [x] GREEN [x] COST [x]",
  "",
  "## Test policy and scopes",
  "BR-77 and `| x | Test |` are past the section.",
].join("\n");

describe("sheetFacts", () => {
  const facts = sheetFacts(SHEET);
  it("reads the ids of `## TDD sequence` only, sorted and unique; `### Step` does not end it", () => {
    deepStrictEqual(facts.ids, ["BR-01", "BR-02", "CH-3"]);
  });
  it("reads the Test column: backticks off, Class.Method cut, <placeholder> skipped, first-seen and unique", () => {
    deepStrictEqual(facts.methods, ["ShowsTheState"]);
  });
  it("keeps an identifier test method and drops a sentence", () => {
    deepStrictEqual(sheetFacts("## TDD sequence\n| Test |\n|---|\n| `Should_Add` |\n| `adds two` |\n").methods, ["Should_Add"]);
  });
  it("reads the first Applied rules row and its ids in first-seen order", () => {
    strictEqual(facts.appliedRulesRow, "| Applied rules | DDD-01, APP-02 (once), DDD-01, X-1 |");
    deepStrictEqual(facts.appliedIds, ["DDD-01", "APP-02", "X-1"]);
  });
  it("counts the ticked lines and calls the sheet closed", () => {
    strictEqual(facts.tickedLines, 2);
    strictEqual(facts.closed, true);
  });
  it("is not closed with an open COST [ ], nor with no ticked line", () => {
    const open = sheetFacts(`${SHEET}\nTDD: RED [x] GREEN [x] COST [ ]\n`);
    strictEqual(open.closed, false);
    strictEqual(open.tickedLines, 2);
    strictEqual(sheetFacts("# x\n").closed, false);
    strictEqual(sheetFacts("TDD: RED [X] GREEN [X] COST [X]\n").closed, false);
  });
  it("gives empty facts for a sheet without sections", () => {
    deepStrictEqual(sheetFacts(""), {
      ids: [], methods: [], appliedRulesRow: null, appliedIds: [], tickedLines: 0, closed: false,
    });
  });
});
