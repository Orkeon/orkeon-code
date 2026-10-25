// The batch sheet corrections are appended to.
import { addCorrection } from "./correction.ts";

const TABLE = (name: string, id: string) =>
  ["| # | Test | Level | Project | Ids |", "|---|------|-------|---------|-----|", `| 1 | \`${name}\` | unit | \`tests\` | ${id} |`, ""];

/** Two steps done (BR-01 on `tests/a.test.ts`, BR-02 on `tests/b.test.ts` with `FakeClock`), then the build step. */
export const SHEET = [
  "# DEMO-PLAN-F1 — Demo", "",
  "## TDD sequence",
  "### Step 1 — One", ...TABLE("does one", "BR-01"), "TDD: RED [x] GREEN [x] COST [x]", "",
  "### Step 2 — Two", ...TABLE("does two", "BR-02"), "TDD: RED [x] GREEN [x] COST [x]", "",
  "### Step 3 — Build and tests", "No test of its own.", "",
  "## Anchors",
  "| Step | Test class / fixture | Shared doubles and builders | Production filled or created |",
  "|------|----------------------|-----------------------------|------------------------------|",
  "| 1 — One | `tests/a.test.ts` — to create | — | `src/a.ts` — to create |",
  "| 2 — Two | `tests/b.test.ts` — to create | `FakeClock` | `src/b.ts:12` — to create |",
  "| 3 — Build and tests | — | — | — |", "",
].join("\n");

/** The finding the step-2 corrections name. */
export const STEP_2_FINDING = "step 2: the clock is read twice";

/** The sheet with the open correction C1 of step 2 appended. */
export function sheetWithStep2Correction(): string {
  const first = addCorrection(SHEET, STEP_2_FINDING);
  if (!first.ok) throw new Error(first.reason);
  return first.text;
}

/** The same sheet, its correction C1 ticked done. */
export function sheetWithStep2CorrectionDone(): string {
  return sheetWithStep2Correction().replace("TDD: RED [ ] GREEN [ ] COST [ ]", "TDD: RED [x] GREEN [x] COST [x]");
}

/** The sheet with BR-09 named outside the steps' test tables. */
export const SHEET_NAMING_BR09_OUT_OF_SCOPE = SHEET.replace("## Anchors", "## Out of scope\n- BR-09\n\n## Anchors");
