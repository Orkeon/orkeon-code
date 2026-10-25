// The sheet a box is ticked on.

/** Steps 1 and 2 with their boxes open (lines 5 and 8), then the build step without a TDD line. */
export const SHEET = [
  "# P-PLAN-F1 — x", "", "## TDD sequence", "", "### Step 1 — one", "TDD: RED [ ] GREEN [ ] COST [ ]", "",
  "### Step 2 — two", "TDD: RED [ ] GREEN [ ] COST [ ]", "", "### Step 3 — Build and tests", "none",
].join("\n");

export interface RefusedCase {
  name: string;
  step: number;
  problem: string;
}

export const REFUSED_CASES: readonly RefusedCase[] = [
  { name: "refuses a step it lacks", step: 9, problem: "the sheet has no step 9" },
  { name: "refuses a step without a TDD line", step: 3, problem: "step 3 has no TDD line" },
];
