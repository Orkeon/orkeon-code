// The batch sheet /dev-implement reads, and what it reads off it.
import { readFileSync } from "node:fs";
import type { StepAnchor, StepTest } from "./step-section.ts";

export const SHEET = readFileSync(new URL("../../../../tests/fixtures/dev/plan/expected/PRUNE-PLAN-F1.md", import.meta.url), "utf8");

/** The tests of step 1. */
export const STEP_1_TESTS: readonly StepTest[] = [
  { name: "removes the entries saved before the cut-off", level: "unit", project: "src/shared/domain", ids: ["BR-01", "UC-01"] },
  { name: "refuses a cut-off in the future", level: "unit", project: "src/shared/domain", ids: ["BR-01"] },
];

/** The Anchors row of step 2. */
export const STEP_2_ANCHOR: StepAnchor = {
  testFiles: [{ path: "src/shared/domain/memory-prune.test.ts", state: "to create" }],
  doubles: "",
  production: [
    { path: "src/shared/domain/memory-prune.ts", state: "to create" },
    { path: "src/shared/domain/memory.ts", line: 18, state: "member", member: "MemoryEntry" },
  ],
};

/** The sheet whose step 1 names no test file in ## Anchors. */
export const SHEET_STEP_1_WITHOUT_TEST_FILE = SHEET.replace(
  "| 1 — An entry older than the cut-off is removed | `src/shared/domain/memory-prune.test.ts` — to create |",
  "| 1 — An entry older than the cut-off is removed | — |",
);

/** The sheet with step 1 done. */
export const SHEET_STEP_1_DONE = SHEET.replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [x] GREEN [x] COST [x]");
