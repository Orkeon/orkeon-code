// The spec and the change brief the plan source is tested on, and the rows of the Blocking stop.
import type { OpenQuestion } from "./spec-format.ts";

/** A spec: a use case, two business rules out of order, four open questions (three Blocking), a row past the section. */
export const SPEC = [
  "# trim — Trim stale entries",
  "",
  "## 4. Use cases",
  "### UC-01 — Trim the store",
  "- **Statement**: the user trims the store in one command · **Actor**: the user",
  "",
  "## 5. Business rules",
  "### BR-02: Fresh entries stay",
  "- **Statement** an entry newer than the cut-off is kept **Origin**: the request",
  "#### BR-01 - A stale entry goes",
  "Some prose with no bullet.",
  "",
  "## 12. Open questions",
  "| # | Severity | Question | Impact | Options |",
  "|---|----------|----------|--------|---------|",
  "| 1 | Blocking | Which date counts? | the rule | saved / edited |",
  "| 2 | Major | Is it Blocking? | wording | — |",
  "| 3 | **Blocking** | Is a cut-off required? | the command | yes / no |",
  "| 4 | blocking | Are feedback entries kept? | the rule | yes |",
  "",
  "## 13. Notes",
  "| 5 | Blocking | past the section |",
].join("\n");

/** The line numbers of the rows. */
export const lines = (rows: readonly OpenQuestion[]): number[] => rows.map((r) => r.line);

/** An unnumbered open-questions heading, in a CRLF text. */
export const CRLF_TEXT = ["# x — y", "## Open questions", "| # | Severity | Question |", "|---|---|---|", "| 1 | Blocking | q |"].join("\r\n");

/** A table without a leading pipe whose first column is the severity. */
export const NO_LEADING_PIPE = ["## 8. Open questions", "Severity | Question", "---|---", "Blocking | Which cut-off?", "Major | Which name?"].join("\n");

/** A backticked Blocking cell outside a severity column, then one inside it. */
export const BACKTICKED = ["## Open questions", "| `Blocking` | q |", "", "| # | Severity | Q |", "|---|---|---|", "| 1 | `Blocking` | q |"].join("\n");

/** A spec whose two ids repeat, the first statement past 200 characters. */
export const DUPLICATED_IDS = `### UC-01 — First\n- **Statement**: ${"a".repeat(250)}\n### UC-01 — Again\n`;

/** A perf brief: two CH ids out of order, a BR id it may not hold, three must-not-change rows. */
export const BRIEF = [
  "# slow-list — The list is slow — perf",
  "## 3. Acceptance",
  "### CH-02 — Listing stays under a second",
  "### CH-01 — One read per listing",
  "- **Statement**: a listing reads the store once · **Proof**: a counting double",
  "### BR-01 — Not here",
  "## 4. What must not change",
  "| Behaviour | Pinned by |",
  "|-----------|-----------|",
  "| the order of the list | `lists in saved order` |",
  "the empty list prints a note | Unpinned",
  "| a deleted entry is hidden | `unpinned` |",
  "## 5. Scope",
].join("\n");

/** Blocking row `n`, padded with spaces. */
export const row = (n: number): OpenQuestion => ({ line: n, raw: `  | ${n} | Blocking | q${n} |  `, severity: "Blocking", cells: [] });

/** Nine rows, the first one 300 characters past its cells. */
export function nineRowsFirstLong(): OpenQuestion[] {
  const rows = [...Array(9).keys()].map((i) => row(i + 1));
  rows[0] = { ...rows[0], raw: `| 1 | Blocking | ${"x".repeat(300)} |` };
  return rows;
}

/** The stop of /dev-plan on a spec with one Blocking row. */
export const SPEC_STOP = [
  "dev-plan: workbench/trim/SPEC-trim.md has 1 open Blocking question(s); no plan is written.",
  "  | 1 | Blocking | q1 |",
  "→ Settle them first: /dev-spec trim, or edit the file; then /dev-plan trim.",
].join("\n");
