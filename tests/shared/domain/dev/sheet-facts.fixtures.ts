// The batch sheets sheetFacts is tested on.

/** A sheet with ids, test methods and applied rules inside and outside `## TDD sequence`, two ticked lines. */
export const SHEET = [
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

/** A Test column holding an identifier and a sentence. */
export const IDENTIFIER_AND_SENTENCE = "## TDD sequence\n| Test |\n|---|\n| `Should_Add` |\n| `adds two` |\n";

/** The sheet with a third TDD line whose COST is open. */
export const OPEN_COST_SHEET = `${SHEET}\nTDD: RED [x] GREEN [x] COST [ ]\n`;

export interface UntickedCase {
  name: string;
  sheet: string;
}

/** Sheets with no ticked line: none at all, or ticks in upper case. */
export const NO_TICKED_LINE: readonly UntickedCase[] = [
  { name: "a sheet without a TDD line", sheet: "# x\n" },
  { name: "a TDD line ticked with an upper-case X", sheet: "TDD: RED [X] GREEN [X] COST [X]\n" },
];
