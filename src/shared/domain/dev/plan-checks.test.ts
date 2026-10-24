// Unit tests for the plan checks: the design ids classified (as the /dev-verify gate reads
// them) and each row of /dev-plan's self-check failing alone, on inline texts. Run:
//   node --test src/shared/domain/dev/plan-checks.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { missingDesignIds, planSelfCheck } from "./plan-checks.ts";
import type { SelfCheckInput } from "./plan-checks.ts";

const PLAN = [
  "# TRIM-PLAN — Trim stale entries",
  "",
  "## 0. Summary",
  "",
  "| Batch | Intent | Ids | Depends on | Reason |",
  "|-------|--------|-----|------------|--------|",
  "| F1 | Stale entries are trimmed | BR-01 / UC-01 | — | the rule first |",
  "| F2 | The reference names the command | UC-01 | F1 | documents F1 |",
  "",
  "### Batch F1 — Trim by age — open",
  "- [ ] 1. A stale entry is trimmed",
  "- [ ] 2. Build and tests — scope: npm test",
  "",
  "### Batch F2 — Reference — open",
  "- [ ] 1. The reference lists the command",
  "- [ ] 2. Build and tests — scope: npm run check",
  "",
  "## 1. Scope",
  "",
  "- **Non-applicable rules**: DDD-02: N/A — x; DDD-03: N/A — x; DDD-04: N/A — x; DDD-05: N/A — x; DDD-06: N/A — x; " +
    "DDD-07: N/A — x; DDD-08: N/A — x; DDD-09: N/A — x; DDD-10: N/A — x; DDD-11: N/A — x; APP-02: N/A — x; " +
    "APP-03: N/A — x; APP-04: N/A — x; APP-05: N/A — x",
  "",
  "## 2. Traceability",
  "",
  "| Id | Code owner(s) | Batch |",
  "|----|---------------|-------|",
  "| UC-01 — Trim the store | `runTrim()` | F1, F2 |",
  "| BR-01 — A stale entry goes | `trimEntries()` | F1 |",
].join("\n");

function sheet(batch: string, name: string, ids: string, depends: string, applied: string, test: string, testIds: string): string {
  return [
    `# TRIM-PLAN-${batch} — ${name}`,
    "",
    "## Intent",
    `The batch. **Ids**: ${ids}. **Depends on**: ${depends}`,
    "",
    "## Design",
    "| Point | Decision |",
    "|-------|----------|",
    `| Applied rules | ${applied} |`,
    "",
    "## TDD sequence",
    "Tests lead.",
    "",
    "### Step 1 — The behaviour",
    "| # | Test | Level | Project | Ids |",
    "|---|------|-------|---------|-----|",
    `| 1 | \`${test}\` | unit | \`tests\` | ${testIds} |`,
    "",
    "TDD: RED [ ] GREEN [ ] COST [ ]",
    "",
    "### Step 2 — Build and tests",
    "No test of its own.",
    "",
    "## Anchors",
    "",
    "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |",
    "|------|----------------------|-----------------------------|------------------------------|",
    "| 1 — The behaviour | `tests/trim.test.ts` — to create | — | `src/trim.ts` — to create |",
    "| 2 — Build and tests | — | — | — |",
    "",
    "## Assumptions",
    "| # | Assumption | To be validated by |",
    "|---|------------|--------------------|",
    "",
  ].join("\n");
}

const F1 = sheet("F1", "Trim by age", "BR-01 / UC-01", "[none]", "DDD-01, APP-01", "trims a stale entry", "BR-01, UC-01");
const F2 = sheet("F2", "Reference", "UC-01", "F1", "PERF-01", "the reference lists trim", "UC-01");

function input(over: { plan?: string; f1?: string; f2?: string; sourceIds?: string[] } = {}): SelfCheckInput {
  return {
    plan: { name: "TRIM-PLAN.md", text: over.plan ?? PLAN },
    sheets: [{ name: "TRIM-PLAN-F1.md", text: over.f1 ?? F1 }, { name: "TRIM-PLAN-F2.md", text: over.f2 ?? F2 }],
    sourceIds: over.sourceIds ?? ["BR-01", "UC-01"],
  };
}
const problems = (over: Parameters<typeof input>[0]): string[] => planSelfCheck(input(over)).problems;

describe("missingDesignIds", () => {
  const plan = "**Non-applicable rules**: DDD-03, DDD-04, DDD-05, DDD-06, DDD-07, DDD-08, DDD-09, DDD-10, DDD-11, " +
    "APP-02, APP-03, APP-04, APP-05, PERF-01";
  const sheetText = "| Applied rules | DDD-01, DDD-02, APP-01 |";
  it("is empty when every id is applied on a sheet or non-applicable on the plan", () => {
    deepStrictEqual(missingDesignIds({ sheets: [sheetText], plans: [plan], all: [] }), []);
  });
  it("names an unclassified id", () => {
    deepStrictEqual(missingDesignIds({ sheets: [sheetText], plans: [plan.replace(", PERF-01", "")], all: [] }), ["PERF-01"]);
  });
  it("does not take DDD-1 or XDDD-010 for DDD-01, nor a Non-applicable line of a sheet", () => {
    const s = sheetText.replace("DDD-01,", "DDD-1, XDDD-010,") + "\nNon-applicable rules: DDD-01";
    deepStrictEqual(missingDesignIds({ sheets: [s], plans: [plan], all: [] }), ["DDD-01"]);
  });
});

describe("planSelfCheck", () => {
  it("passes the plan and its two sheets", () => {
    deepStrictEqual(planSelfCheck(input()), { ok: true, problems: [] });
  });
  it("1: reports a parse problem of the plan with its line", () => {
    const plan = PLAN.replace("### Batch F2 — Reference — open", "### Batch F2 — Reference — later");
    deepStrictEqual(problems({ plan }), ["TRIM-PLAN.md:14: unknown batch line '### Batch F2 — Reference — later'"]);
  });
  it("2: reports a parse problem of a sheet with its line", () => {
    const f2 = F2.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [ ] GREEN [ ]");
    deepStrictEqual(problems({ f2 }), [
      "TRIM-PLAN-F2.md:19: malformed TDD line 'TDD: RED [ ] GREEN [ ]'",
      "F2: step 1 has no TDD: line",
    ]);
  });
  it("2: reports a step of a sheet holding two TDD: lines", () => {
    const f2 = F2.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [ ] GREEN [ ] COST [ ]\nTDD: RED [x] GREEN [x] COST [x]");
    deepStrictEqual(problems({ f2 }), ["TRIM-PLAN-F2.md:20: step 1 has two TDD: lines"]);
  });
  it("3: names the design ids left unclassified", () => {
    deepStrictEqual(problems({ f2: F2.replace("| Applied rules | PERF-01 |", "| Applied rules | — |") }),
      ["design ids neither applied nor non-applicable: PERF-01"]);
  });
  it("4: reports batches that differ between the summary, the plan lines and the sheets", () => {
    const plan = PLAN.replace("| F2 | The reference names the command | UC-01 | F1 | documents F1 |\n", "");
    deepStrictEqual(problems({ plan }), ["batches differ: summary F1, plan lines F1, F2, sheets F1, F2"]);
  });
  it("5: reports a Depends on that differs between the summary and the sheet", () => {
    deepStrictEqual(problems({ f2: F2.replace("**Depends on**: F1", "**Depends on**: [none]") }),
      ["F2: Depends on differs between the summary (F1) and the sheet (none)"]);
  });
  it("6: reports a source id with no traceability row, UC-010 not counting for UC-01", () => {
    deepStrictEqual(problems({ plan: PLAN.replace("| UC-01 — Trim the store", "| UC-010 — Trim the store") }),
      ["UC-01: no row of ## 2. Traceability"]);
  });
  it("7: reports a source id that no sheet's TDD sequence names", () => {
    const plan = `${PLAN}\n| BR-02 — Fresh entries stay | \`trimEntries()\` | F1 |`;
    deepStrictEqual(problems({ plan, sourceIds: ["BR-01", "BR-02", "UC-01"] }),
      ["BR-02: no test of any sheet's ## TDD sequence names it"]);
  });
  it("8: reports a sheet id that is not an id of the source", () => {
    const f1 = F1.replace("**Ids**: BR-01 / UC-01", "**Ids**: BR-01, BR-09 / UC-01").replace("| BR-01, UC-01 |", "| BR-01, BR-09, UC-01 |");
    deepStrictEqual(problems({ f1 }), ["F1: BR-09 is not an id of the source"]);
  });
  it("9: reports a last step that is not Build and tests, or that carries a TDD: line", () => {
    deepStrictEqual(problems({ f1: F1.replace("### Step 2 — Build and tests", "### Step 2 — Wrap up") }),
      ["F1: step 2 is the last step and is not Build and tests"]);
    deepStrictEqual(problems({ f1: F1.replace("No test of its own.", "TDD: RED [ ] GREEN [ ] COST [ ]") }),
      ["F1: step 2 is Build and tests and holds a TDD: line"]);
  });
  it("10: reports an Anchors table without one row per step", () => {
    deepStrictEqual(problems({ f1: F1.replace("| 2 — Build and tests | — | — | — |\n", "") }),
      ["F1: ## Anchors has 1 rows for 2 steps"]);
  });
  it("11: reports a sheet without an Applied rules row", () => {
    const f2 = F2.replace("| Applied rules | PERF-01 |", "| Rules | PERF-01 |");
    deepStrictEqual(problems({ f2, plan: PLAN.replace("APP-05: N/A — x", "APP-05: N/A — x; PERF-01: N/A — x") }),
      ["F2: no Applied rules row"]);
  });
  it("12: reports an Assumptions table with a row", () => {
    deepStrictEqual(problems({ f1: `${F1}| 1 | the store is local | the first test |\n` }), ["F1: ## Assumptions is not empty"]);
  });
  it("13: reports an id named in the TDD sequence outside the batch's ids", () => {
    const f2 = F2.replace("Tests lead.", "Tests lead; BR-01 is F1's.");
    deepStrictEqual(problems({ f2 }), ["F2: BR-01 appears in ## TDD sequence outside the batch's ids"]);
  });
  it("14: tolerates a batch line the review marked blocked, and no other unknown one", () => {
    const plan = PLAN.replace("### Batch F1 — Trim by age — open", "### Batch F1 — Trim by age — blocked");
    deepStrictEqual(planSelfCheck(input({ plan })), { ok: true, problems: [] });
    strictEqual(problems({ plan: plan.replace("— blocked", "— stuck") }).length, 1);
  });
});
