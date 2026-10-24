// Unit tests for the plan source: the Blocking gate, the ids, the title and what must not
// change, on inline texts. Run:
//   node --test src/shared/domain/dev/spec-format.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";

import { blockingRows, blockingStop, parsePlanSource } from "./spec-format.ts";
import type { OpenQuestion } from "./spec-format.ts";

const SPEC = [
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

const lines = (rows: readonly OpenQuestion[]): number[] => rows.map((r) => r.line);

describe("blockingRows", () => {
  it("keeps the Blocking rows of a numbered section, whatever their emphasis or case, and ignores Major", () => {
    deepStrictEqual(lines(blockingRows(SPEC)), [16, 18, 19]);
  });
  it("does not count a Major row whose question holds the word Blocking", () => {
    strictEqual(blockingRows(SPEC).some((r) => r.raw.includes("Is it Blocking?")), false);
  });
  it("opens the section on an unnumbered heading and reads a CRLF text", () => {
    const text = ["# x — y", "## Open questions", "| # | Severity | Question |", "|---|---|---|", "| 1 | Blocking | q |"].join("\r\n");
    const rows = blockingRows(text);
    deepStrictEqual(rows.map((r) => r.raw), ["| 1 | Blocking | q |"]);
    deepStrictEqual(rows[0].cells, ["1", "Blocking", "q"]);
  });
  it("catches a table without a leading pipe whose first column is the severity (the column rule alone)", () => {
    const text = ["## 8. Open questions", "Severity | Question", "---|---", "Blocking | Which cut-off?", "Major | Which name?"].join("\n");
    deepStrictEqual(blockingRows(text).map((r) => [r.line, r.severity]), [[4, "Blocking"]]);
  });
  it("counts a Blocking cell alone between pipes and a backticked severity, not a backticked cell outside the column", () => {
    const text = ["## Open questions", "| `Blocking` | q |", "", "| # | Severity | Q |", "|---|---|---|", "| 1 | `Blocking` | q |"].join("\n");
    deepStrictEqual(lines(blockingRows(text)), [6]);
    deepStrictEqual(lines(blockingRows("## Open questions\nfree text | Blocking | here\n")), [2]);
  });
  it("reads no fence away and finds nothing without the section", () => {
    deepStrictEqual(lines(blockingRows("## Open questions\n```\n| Blocking |\n```\n")), [3]);
    deepStrictEqual(blockingRows("# x — y\n## 1. Context\n| 1 | Blocking | q |\n"), []);
  });
});

describe("parsePlanSource on a spec", () => {
  const spec = parsePlanSource(SPEC, "spec");
  it("reads the title", () => {
    deepStrictEqual([spec.kind, spec.code, spec.name, spec.changeKind], ["spec", "trim", "Trim stale entries", undefined]);
  });
  it("reads UC then BR by number, with the em dash, colon and hyphen separators and the statement", () => {
    deepStrictEqual(spec.ids, [
      { id: "UC-01", title: "Trim the store", statement: "the user trims the store in one command", line: 4 },
      { id: "BR-01", title: "A stale entry goes", statement: "", line: 10 },
      { id: "BR-02", title: "Fresh entries stay", statement: "an entry newer than the cut-off is kept", line: 8 },
    ]);
    deepStrictEqual(spec.problems, []);
  });
  it("keeps every open question and the gate's rows", () => {
    deepStrictEqual(spec.openQuestions.map((q) => q.severity), ["Blocking", "Major", "**Blocking**", "blocking"]);
    deepStrictEqual(lines(spec.blocking), [16, 18, 19]);
    deepStrictEqual(spec.mustNotChange, []);
  });
  it("reports a duplicated id and keeps its first occurrence; cuts a statement at 200 characters", () => {
    const text = `### UC-01 — First\n- **Statement**: ${"a".repeat(250)}\n### UC-01 — Again\n`;
    const p = parsePlanSource(text, "spec");
    deepStrictEqual(p.ids.map((i) => [i.title, i.statement.length]), [["First", 200]]);
    deepStrictEqual(p.problems, [{ line: 3, message: "duplicated id UC-01" }]);
  });
  it("gives no blocking row to a spec without an open-questions section", () => {
    deepStrictEqual(parsePlanSource("# trim — Trim\n### UC-01 — Trim\n", "spec").blocking, []);
  });
});

describe("parsePlanSource on a change brief", () => {
  const BRIEF = [
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
  const brief = parsePlanSource(BRIEF, "change");
  it("reads the title with its kind", () => {
    deepStrictEqual([brief.code, brief.name, brief.changeKind], ["slow-list", "The list is slow", "perf"]);
  });
  it("keeps CH ids by number and reports a UC/BR in a brief", () => {
    deepStrictEqual(brief.ids.map((i) => i.id), ["CH-01", "CH-02"]);
    deepStrictEqual(brief.problems, [{ line: 6, message: "BR-01 in a change brief" }]);
  });
  it("reads the pinned and unpinned rows, with or without a leading pipe", () => {
    deepStrictEqual(brief.mustNotChange, [
      { line: 10, behaviour: "the order of the list", pinnedBy: "lists in saved order" },
      { line: 11, behaviour: "the empty list prints a note", pinnedBy: null },
      { line: 12, behaviour: "a deleted entry is hidden", pinnedBy: null },
    ]);
  });
  it("reports a brief title without a kind", () => {
    const p = parsePlanSource("# slow-list — The list is slow\n", "change");
    deepStrictEqual([p.code, p.changeKind, p.problems], [
      "slow-list", undefined, [{ line: 1, message: "the brief's title names no kind (bug, refactor or perf)" }],
    ]);
  });
});

describe("blockingStop", () => {
  const row = (n: number): OpenQuestion => ({ line: n, raw: `  | ${n} | Blocking | q${n} |  `, severity: "Blocking", cells: [] });
  it("lists the rows and points a spec to /dev-spec", () => {
    strictEqual(blockingStop("workbench/trim/SPEC-trim.md", "spec", "trim", [row(1)]), [
      "dev-plan: workbench/trim/SPEC-trim.md has 1 open Blocking question(s); no plan is written.",
      "  | 1 | Blocking | q1 |",
      "→ Settle them first: /dev-spec trim, or edit the file; then /dev-plan trim.",
    ].join("\n"));
  });
  it("shows 8 rows of 9 then the count left, cuts a row at 200 characters, and points a brief to /dev-change", () => {
    const rows = [...Array(9).keys()].map((i) => row(i + 1));
    rows[0] = { ...rows[0], raw: `| 1 | Blocking | ${"x".repeat(300)} |` };
    const out = blockingStop("workbench/s/CHANGE-s.md", "change", "s", rows).split("\n");
    strictEqual(out.length, 11);
    strictEqual(out[1].length, 202);
    strictEqual(out[8], "  | 8 | Blocking | q8 |");
    strictEqual(out[9], "  … 1 more");
    strictEqual(out[10], "→ Settle them first: /dev-change s, or edit the file; then /dev-plan s.");
  });
});
