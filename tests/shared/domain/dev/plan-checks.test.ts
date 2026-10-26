// Unit tests for the plan checks: the design ids classified (as the /dev-verify gate reads
// them) and each row of /dev-plan's self-check failing alone, on inline texts. Run:
//   node --test tests/shared/domain/dev/plan-checks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { missingDesignIds, planSelfCheck } from "../../../../src/shared/domain/dev/plan-checks.ts";
import { APPLIED_SHEET, F1, F2, input, NON_APPLICABLE_PLAN, PLAN, problems } from "./plan-checks.fixtures.ts";

describe("missingDesignIds", () => {
  it("is empty when every id is applied on a sheet or non-applicable on the plan", () => {
    // Arrange
    const sources = { sheets: [APPLIED_SHEET], plans: [NON_APPLICABLE_PLAN], all: [] };

    // Act
    const missing = missingDesignIds(sources);

    // Assert
    deepStrictEqual(missing, []);
  });

  it("names an unclassified id", () => {
    // Arrange
    const sources = { sheets: [APPLIED_SHEET], plans: [NON_APPLICABLE_PLAN.replace(", PERF-01", "")], all: [] };

    // Act
    const missing = missingDesignIds(sources);

    // Assert
    deepStrictEqual(missing, ["PERF-01"]);
  });

  it("does not take DDD-1 or XDDD-010 for DDD-01, nor a Non-applicable line of a sheet", () => {
    // Arrange
    const s = APPLIED_SHEET.replace("DDD-01,", "DDD-1, XDDD-010,") + "\nNon-applicable rules: DDD-01";

    // Act
    const missing = missingDesignIds({ sheets: [s], plans: [NON_APPLICABLE_PLAN], all: [] });

    // Assert
    deepStrictEqual(missing, ["DDD-01"]);
  });
});

describe("planSelfCheck", () => {
  it("passes the plan and its two sheets", () => {
    // Arrange
    const checked = input();

    // Act
    const result = planSelfCheck(checked);

    // Assert
    deepStrictEqual(result, { ok: true, problems: [] });
  });

  it("1: reports a parse problem of the plan with its line", () => {
    // Arrange
    const plan = PLAN.replace("### Batch F2 — Reference — open", "### Batch F2 — Reference — later");

    // Act
    const found = problems({ plan });

    // Assert
    deepStrictEqual(found, ["TRIM-PLAN.md:14: unknown batch line '### Batch F2 — Reference — later'"]);
  });

  it("2: reports a parse problem of a sheet with its line", () => {
    // Arrange
    const f2 = F2.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [ ] GREEN [ ]");

    // Act
    const found = problems({ f2 });

    // Assert
    deepStrictEqual(found, [
      "TRIM-PLAN-F2.md:19: malformed TDD line 'TDD: RED [ ] GREEN [ ]'",
      "F2: step 1 has no TDD: line",
    ]);
  });

  it("2: reports a step of a sheet holding two TDD: lines", () => {
    // Arrange
    const f2 = F2.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [ ] GREEN [ ] COST [ ]\nTDD: RED [x] GREEN [x] COST [x]");

    // Act
    const found = problems({ f2 });

    // Assert
    deepStrictEqual(found, ["TRIM-PLAN-F2.md:20: step 1 has two TDD: lines"]);
  });

  it("3: names the design ids left unclassified", () => {
    // Arrange
    const f2 = F2.replace("| Applied rules | PERF-01 |", "| Applied rules | — |");

    // Act
    const found = problems({ f2 });

    // Assert
    deepStrictEqual(found, ["design ids neither applied nor non-applicable: PERF-01"]);
  });

  it("4: reports batches that differ between the summary, the plan lines and the sheets", () => {
    // Arrange
    const plan = PLAN.replace("| F2 | The reference names the command | UC-01 | F1 | documents F1 |\n", "");

    // Act
    const found = problems({ plan });

    // Assert
    deepStrictEqual(found, ["batches differ: summary F1, plan lines F1, F2, sheets F1, F2"]);
  });

  it("5: reports a Depends on that differs between the summary and the sheet", () => {
    // Arrange
    const f2 = F2.replace("**Depends on**: F1", "**Depends on**: [none]");

    // Act
    const found = problems({ f2 });

    // Assert
    deepStrictEqual(found, ["F2: Depends on differs between the summary (F1) and the sheet (none)"]);
  });

  it("6: reports a source id with no traceability row, UC-010 not counting for UC-01", () => {
    // Arrange
    const plan = PLAN.replace("| UC-01 — Trim the store", "| UC-010 — Trim the store");

    // Act
    const found = problems({ plan });

    // Assert
    deepStrictEqual(found, ["UC-01: no row of ## 2. Traceability"]);
  });

  it("7: reports a source id that no sheet's TDD sequence names", () => {
    // Arrange
    const plan = `${PLAN}\n| BR-02 — Fresh entries stay | \`trimEntries()\` | F1 |`;

    // Act
    const found = problems({ plan, sourceIds: ["BR-01", "BR-02", "UC-01"] });

    // Assert
    deepStrictEqual(found, ["BR-02: no test of any sheet's ## TDD sequence names it"]);
  });

  it("8: reports a sheet id that is not an id of the source", () => {
    // Arrange
    const f1 = F1.replace("**Ids**: BR-01 / UC-01", "**Ids**: BR-01, BR-09 / UC-01").replace("| BR-01, UC-01 |", "| BR-01, BR-09, UC-01 |");

    // Act
    const found = problems({ f1 });

    // Assert
    deepStrictEqual(found, ["F1: BR-09 is not an id of the source"]);
  });

  it("9: reports a last step that is not Build and tests", () => {
    // Arrange
    const f1 = F1.replace("### Step 2 — Build and tests", "### Step 2 — Wrap up");

    // Act
    const found = problems({ f1 });

    // Assert
    deepStrictEqual(found, ["F1: step 2 is the last step and is not Build and tests"]);
  });

  it("9: reports a Build and tests step that carries a TDD: line", () => {
    // Arrange
    const f1 = F1.replace("No test of its own.", "TDD: RED [ ] GREEN [ ] COST [ ]");

    // Act
    const found = problems({ f1 });

    // Assert
    deepStrictEqual(found, ["F1: step 2 is Build and tests and holds a TDD: line"]);
  });

  it("10: reports an Anchors table without one row per step", () => {
    // Arrange
    const f1 = F1.replace("| 2 — Build and tests | — | — | — |\n", "");

    // Act
    const found = problems({ f1 });

    // Assert
    deepStrictEqual(found, ["F1: ## Anchors has 1 rows for 2 steps"]);
  });

  it("11: reports a sheet without an Applied rules row", () => {
    // Arrange
    const f2 = F2.replace("| Applied rules | PERF-01 |", "| Rules | PERF-01 |");
    const plan = PLAN.replace("APP-05: N/A — x", "APP-05: N/A — x; PERF-01: N/A — x");

    // Act
    const found = problems({ f2, plan });

    // Assert
    deepStrictEqual(found, ["F2: no Applied rules row"]);
  });

  it("12: reports an Assumptions table with a row", () => {
    // Arrange
    const f1 = `${F1}| 1 | the store is local | the first test |\n`;

    // Act
    const found = problems({ f1 });

    // Assert
    deepStrictEqual(found, ["F1: ## Assumptions is not empty"]);
  });

  it("13: reports an id named in the TDD sequence outside the batch's ids", () => {
    // Arrange
    const f2 = F2.replace("Tests lead.", "Tests lead; BR-01 is F1's.");

    // Act
    const found = problems({ f2 });

    // Assert
    deepStrictEqual(found, ["F2: BR-01 appears in ## TDD sequence outside the batch's ids"]);
  });

  it("14: tolerates a batch line the review marked blocked", () => {
    // Arrange
    const plan = PLAN.replace("### Batch F1 — Trim by age — open", "### Batch F1 — Trim by age — blocked");

    // Act
    const result = planSelfCheck(input({ plan }));

    // Assert
    deepStrictEqual(result, { ok: true, problems: [] });
  });

  it("14: tolerates no other unknown batch line", () => {
    // Arrange
    const plan = PLAN.replace("### Batch F1 — Trim by age — open", "### Batch F1 — Trim by age — stuck");

    // Act
    const found = problems({ plan });

    // Assert
    strictEqual(found.length, 1);
  });
});
