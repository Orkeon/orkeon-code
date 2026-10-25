// The sheet's assumptions and the done marks of the close. Run:
//   node --test src/crews/dev-implement/domain/sheet-edits.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { addAssumptions, assumptionsOf, markPlanBatchDone, markSheetDone } from "./sheet-edits.ts";

describe("assumptionsOf", () => {
  it("reads the Assumption lines of an answer once each", () => {
    deepStrictEqual(assumptionsOf("done\nAssumption: dates are UTC\n- **Assumption**: a | b\nAssumption: dates are UTC"),
      ["dates are UTC", "a / b"]);
  });
});

describe("addAssumptions", () => {
  it("creates the section before ## Decisions, then numbers on", () => {
    const first = addAssumptions("# X\n\n## Decisions\n- D1\n", ["dates are UTC"]);
    strictEqual(first.text, "# X\n\n## Assumptions\n| # | Assumption | To be validated by |\n|---|------------|--------------------|\n| H1 | dates are UTC | the user |\n\n## Decisions\n- D1\n");
    const second = addAssumptions(first.text, ["dates are UTC", "ids are stable"]);
    deepStrictEqual(second.added, ["ids are stable"]);
    strictEqual(second.text.includes("| H1 | dates are UTC | the user |\n| H2 | ids are stable | the user |\n\n## Decisions"), true);
  });
  it("appends the section at the end without ## Decisions, and changes nothing without an assumption", () => {
    strictEqual(addAssumptions("# X\n", ["a"]).text, "# X\n\n## Assumptions\n| # | Assumption | To be validated by |\n|---|------------|--------------------|\n| H1 | a | the user |\n");
    strictEqual(addAssumptions("# X\n", []).text, "# X\n");
  });
  it("fills the table /dev-plan rendered, numbered after its rows", () => {
    const sheet = "## Assumptions\n| # | Assumption | To be validated by |\n|---|------------|--------------------|\n| H1 | mean is exported | its red test |\n\n## Decisions\n";
    strictEqual(addAssumptions(sheet, ["a named export"]).text,
      "## Assumptions\n| # | Assumption | To be validated by |\n|---|------------|--------------------|\n| H1 | mean is exported | its red test |\n| H2 | a named export | the user |\n\n## Decisions\n");
    strictEqual(addAssumptions("## Assumptions\n| # | Assumption | To be validated by |\n|---|------------|--------------------|\n", ["a"]).text, "## Assumptions\n| # | Assumption | To be validated by |\n|---|------------|--------------------|\n| H1 | a | the user |\n");
  });
  it("counts the list lines of an older sheet and puts the table after them", () => {
    const sheet = "## Assumptions\n- H1 — a — to be validated by the user\n";
    strictEqual(addAssumptions(sheet, ["a", "b"]).text, "## Assumptions\n- H1 — a — to be validated by the user\n\n| # | Assumption | To be validated by |\n|---|------------|--------------------|\n| H2 | b | the user |\n");
  });
});

describe("done marks", () => {
  it("marks the sheet's title once", () => {
    const done = markSheetDone("# DEMO-PLAN-F1 — Demo\n", "2026-10-24");
    strictEqual(done, "# DEMO-PLAN-F1 — Demo — done (2026-10-24)\n");
    strictEqual(markSheetDone(done, "2026-10-25"), done);
  });
  it("marks the plan's batch and ticks its boxes, the next batch untouched", () => {
    const plan = "### Batch F1 — Demo — open\n- [ ] 1. One\n- [x] 2. Two\n### Batch F2 — Next — open\n- [ ] 1. Three\n";
    strictEqual(markPlanBatchDone(plan, "F1", "2026-10-24"),
      "### Batch F1 — Demo — done (2026-10-24)\n- [x] 1. One\n- [x] 2. Two\n### Batch F2 — Next — open\n- [ ] 1. Three\n");
    strictEqual(markPlanBatchDone(plan, "F9", "2026-10-24"), plan);
    strictEqual(markPlanBatchDone("### Batch F1 — Demo — open\n- [ ] Done line holds\n  - [ ] sub\n", "F1", "2026-10-24"),
      "### Batch F1 — Demo — done (2026-10-24)\n- [x] Done line holds\n  - [x] sub\n");
  });
});
