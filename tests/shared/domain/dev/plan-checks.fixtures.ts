// The plan, its two batch sheets and the inputs the plan checks are tested on.
import { planSelfCheck } from "../../../../src/shared/domain/dev/plan-checks.ts";
import type { SelfCheckInput } from "../../../../src/shared/domain/dev/plan-checks.ts";

/** A plan of two batches whose scope classifies every design id the sheets do not apply. */
export const PLAN = [
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

/** A batch sheet: its ids, dependencies, applied rules and one test of one step, then Build and tests. */
export function sheet(batch: string, name: string, ids: string, depends: string, applied: string, test: string, testIds: string): string {
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

/** The two sheets of the plan. */
export const F1 = sheet("F1", "Trim by age", "BR-01 / UC-01", "[none]", "DDD-01, APP-01", "trims a stale entry", "BR-01, UC-01");
export const F2 = sheet("F2", "Reference", "UC-01", "F1", "PERF-01", "the reference lists trim", "UC-01");

/** The plan and its sheets, any of them replaced by `over`. */
export function input(over: { plan?: string; f1?: string; f2?: string; sourceIds?: string[] } = {}): SelfCheckInput {
  return {
    plan: { name: "TRIM-PLAN.md", text: over.plan ?? PLAN },
    sheets: [{ name: "TRIM-PLAN-F1.md", text: over.f1 ?? F1 }, { name: "TRIM-PLAN-F2.md", text: over.f2 ?? F2 }],
    sourceIds: over.sourceIds ?? ["BR-01", "UC-01"],
  };
}
/** The problems the self-check names for the input `over` builds. */
export const problems = (over: Parameters<typeof input>[0]): string[] => planSelfCheck(input(over)).problems;

/** A plan line classifying every design id but those the sheet applies. */
export const NON_APPLICABLE_PLAN = "**Non-applicable rules**: DDD-03, DDD-04, DDD-05, DDD-06, DDD-07, DDD-08, DDD-09, DDD-10, DDD-11, " +
  "APP-02, APP-03, APP-04, APP-05, PERF-01";

/** A sheet applying DDD-01, DDD-02 and APP-01. */
export const APPLIED_SHEET = "| Applied rules | DDD-01, DDD-02, APP-01 |";
