// Unit tests for the verdict. Run:
//   node --test src/crews/dev-verify/domain/verdict.test.ts
import { describe, it } from "node:test";
import { deepStrictEqual, ok, strictEqual } from "node:assert";

import { parseVerdictFile } from "../../../shared/domain/dev/verdict-format.ts";
import type { AuditRow } from "./audit-answer.ts";
import type { TableRow } from "./mechanical-table.ts";
import {
  MAX_VERDICT_ROWS, capRows, carriedRows, decideVerdict, formatWhen, renderVerdictSection, undecidedNotRun,
  verdictFileName, writeVerdictFile,
} from "./verdict.ts";

const minor: AuditRow = { severity: "Minor", axis: "Simplification", gap: "a helper kept twice", evidence: "src/a.ts:4", fix: "fold them" };
const major: AuditRow = { severity: "Major", axis: "Test", gap: "the refusal has no test", evidence: "src/b.ts:9", fix: "add one" };
const blocking: AuditRow = { severity: "Blocking", axis: "Correctness", gap: "a total off by one", evidence: "src/c.ts:2", fix: "count from 0" };

function gapRow(axis: string, check: string, evidence = "ev"): TableRow {
  return { axis, check, result: "gap", evidence };
}

// The learning pass's reading of a verdict file (LC:117-128), ported line for line.
function gapRowsAsTheLearningPassReadsThem(text: string): string[][] {
  const verdictLine = /^##\s+Verdict\s+—\s+GAPS\s*$/;
  const severities = new Set(["Blocking", "Major"]);
  const out: string[][] = [];
  let inside = false;
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (line.startsWith("#")) { inside = verdictLine.test(line); continue; }
    if (!inside) continue;
    const cells = line.trim().replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
    if (cells.length >= 5 && severities.has(cells[0])) {
      out.push([cells[0], cells[1], cells.slice(2, -2).join(" | "), cells[cells.length - 2], cells[cells.length - 1]]);
    }
  }
  return out;
}

describe("formatWhen and names", () => {
  it("formats the local date", () => {
    strictEqual(formatWhen(new Date(2026, 9, 22, 14, 5)), "2026-10-22 14:05");
  });
  it("names the file and the not-run entries", () => {
    strictEqual(verdictFileName("DEMO", "F2"), "DEMO-VERIFY-F2.md");
    deepStrictEqual(undecidedNotRun([{ check: "Placement", reason: "the folder rule is unclear" }]),
      ["Placement — the folder rule is unclear"]);
  });
});

describe("decideVerdict", () => {
  it("is GAPS on a Blocking or Major row, VALID otherwise", () => {
    strictEqual(decideVerdict([]), "VALID");
    strictEqual(decideVerdict([minor]), "VALID");
    strictEqual(decideVerdict([minor, major]), "GAPS");
    strictEqual(decideVerdict([blocking]), "GAPS");
  });
});

describe("carriedRows", () => {
  it("carries each gap with its severity", () => {
    const table: TableRow[] = [
      gapRow("Build", "capture `build`", "`exit: 1` — error CS1002"),
      gapRow("Test", "last test run"),
      gapRow("Test", "step-table methods in the test roots"),
      gapRow("Plan", "`Applied rules` ids are design-rule ids"),
      gapRow("Cost", "capture `cost`"),
      { axis: "Scope", check: "changed files in the batch", result: "ok", evidence: "gate" },
      { axis: "Conventions", check: "layer rules of the changed layers", result: "not checked", evidence: "x" },
    ];
    deepStrictEqual(carriedRows([], table).map((r) => [r.severity, r.axis, r.gap]), [
      ["Blocking", "Correctness", "the build is red: capture `build`"],
      ["Blocking", "Test", "last test run"],
      ["Major", "Test", "step-table methods in the test roots"],
      ["Major", "Plan", "`Applied rules` ids are design-rule ids"],
      ["Major", "Cost", "capture `cost`"],
    ]);
    const build = carriedRows([], table)[0];
    strictEqual(build.evidence, "`exit: 1` — error CS1002");
    strictEqual(build.fix, "see table.md: capture `build`");
  });
  it("drops a carried gap only for an answer row on its axis at least as severe", () => {
    const table = [gapRow("Test", "last test run"), gapRow("Build", "capture `build`"), gapRow("Test", "test classes")];
    deepStrictEqual(carriedRows([major], table).map((r) => [r.severity, r.axis]), [["Blocking", "Test"], ["Blocking", "Correctness"]]);
    deepStrictEqual(carriedRows([blocking], table).map((r) => [r.severity, r.axis]), [["Blocking", "Test"], ["Major", "Test"]]);
  });
  it("carries a red build and a red suite past Minor rows on their axes (GAPS)", () => {
    const answer: AuditRow[] = [
      { ...minor, axis: "Correctness" },
      { ...minor, axis: "Test" },
    ];
    const table = [gapRow("Build", "capture `build`"), gapRow("Test", "last test run")];
    const carried = carriedRows(answer, table);
    deepStrictEqual(carried.map((r) => [r.severity, r.axis]), [["Blocking", "Correctness"], ["Blocking", "Test"]]);
    strictEqual(decideVerdict([...answer, ...carried]), "GAPS");
  });
});

describe("capRows", () => {
  it("keeps 8 rows, worst first, and says what is left per severity", () => {
    const rows: AuditRow[] = [
      ...Array.from({ length: 4 }, () => minor),
      ...Array.from({ length: 6 }, () => major),
      { ...major, axis: "Plan" },
      blocking,
      { ...minor, axis: "Reuse" },
    ];
    const capped = capRows(rows);
    strictEqual(capped.rows.length, MAX_VERDICT_ROWS);
    deepStrictEqual(capped.rows.map((r) => r.severity), ["Blocking", "Major", "Major", "Major", "Major", "Major", "Major", "Major"]);
    deepStrictEqual(capped.overflow, ["+5 more Minor on Simplification, Reuse"]);
  });
  it("adds nothing under the cap", () => {
    deepStrictEqual(capRows([minor, major]), { rows: [major, minor], overflow: [] });
  });
});

describe("renderVerdictSection", () => {
  const base = { prefix: "DEMO", batch: "F2", when: "2026-10-22 14:05", mode: "fast" as const, notRun: [] };

  it("writes the skeleton of a GAPS section", () => {
    const { text, verdict, shown } = renderVerdictSection({
      ...base, rows: [minor, major], validations: ["`npm run t` — exit 0, scope a, 3 tests"],
      notRun: ["`npm test` — refused: not one of the pack's test_class, test_project or test_integration commands"],
    });
    strictEqual(verdict, "GAPS");
    deepStrictEqual(shown, [major, minor]);
    strictEqual(text, [
      "# DEMO-VERIFY-F2 — 2026-10-22 14:05 — fast",
      "",
      "## Verdict — GAPS",
      "",
      "| Severity | Axis | Gap | Evidence | Expected fix |",
      "|----------|------|-----|----------|--------------|",
      "| Major | Test | the refusal has no test | src/b.ts:9 | add one |",
      "| Minor | Simplification | a helper kept twice | src/a.ts:4 | fold them |",
      "",
      "Validations: `npm run t` — exit 0, scope a, 3 tests",
      "Not run: `npm test` — refused: not one of the pack's test_class, test_project or test_integration commands",
      "",
    ].join("\n"));
  });

  it("writes None. for a VALID section without rows, and the none line without validations", () => {
    const { text, verdict } = renderVerdictSection({ ...base, rows: [], validations: [] });
    strictEqual(verdict, "VALID");
    ok(text.includes("## Verdict — VALID\n\nNone.\n\nValidations: none — the capture's build and last test run stand\n"));
  });

  it("joins several validations on one line with ' · '", () => {
    const { text } = renderVerdictSection({ ...base, rows: [], validations: ["`a` — exit 0, scope x, 1 tests", "`b` — exit 1, scope y, 2 tests"] });
    ok(text.includes("\nValidations: `a` — exit 0, scope x, 1 tests · `b` — exit 1, scope y, 2 tests\n"));
    strictEqual(parseVerdictFile(text).sections[0].validations.length, 1);
  });

  it("applies the cell rules", () => {
    const row: AuditRow = {
      severity: "Major", axis: "Test", gap: "a|b  |c\nnext", evidence: "x | y", fix: "z".repeat(400),
    };
    const { text } = renderVerdictSection({ ...base, rows: [row], validations: [] });
    const line = text.split("\n").find((l) => l.startsWith("| Major"));
    strictEqual(line, `| Major | Test | a | b | c · next | x / y | ${"z".repeat(299)}… |`);
  });

  it("puts the overflow lines after the table", () => {
    const rows = Array.from({ length: 9 }, () => minor);
    const lines = renderVerdictSection({ ...base, rows, validations: [] }).text.split("\n");
    strictEqual(lines[14], "+1 more Minor on Simplification");
  });

  it("parses back with verdict-format and with the learning pass's reading", () => {
    const rows: AuditRow[] = [
      blocking,
      { ...major, gap: "two cases | one test" },
      minor,
      ...carriedRows([blocking, major], [gapRow("Plan", "`Applied rules` ids are design-rule ids", "unknown design-rule ids: `X-01`")]),
    ];
    const { text } = renderVerdictSection({ ...base, mode: "full", rows, validations: ["`v` — exit 0, scope s, 4 tests"], notRun: ["Placement — unclear"] });
    const parsed = parseVerdictFile(writeVerdictFile(null, text, "full"));
    deepStrictEqual(parsed.problems, []);
    strictEqual(parsed.sections.length, 1);
    const s = parsed.sections[0];
    deepStrictEqual([s.prefix, s.batch, s.when, s.mode, s.verdict], ["DEMO", "F2", "2026-10-22 14:05", "full", "GAPS"]);
    deepStrictEqual(s.rows.map((r) => [r.severity, r.axis, r.gap]), [
      ["Blocking", "Correctness", "a total off by one"],
      ["Major", "Test", "two cases | one test"],
      ["Major", "Plan", "`Applied rules` ids are design-rule ids"],
      ["Minor", "Simplification", "a helper kept twice"],
    ]);
    deepStrictEqual(s.validations, ["`v` — exit 0, scope s, 4 tests"]);
    deepStrictEqual(s.notRun, ["Placement — unclear"]);
    deepStrictEqual(gapRowsAsTheLearningPassReadsThem(text), [
      ["Blocking", "Correctness", "a total off by one", "src/c.ts:2", "count from 0"],
      ["Major", "Test", "two cases | one test", "src/b.ts:9", "add one"],
      ["Major", "Plan", "`Applied rules` ids are design-rule ids", "unknown design-rule ids: `X-01`",
        "see table.md: `Applied rules` ids are design-rule ids"],
    ]);
  });
});

describe("writeVerdictFile", () => {
  it("replaces the file in fast and full", () => {
    strictEqual(writeVerdictFile("old\n", "new\n", "fast"), "new\n");
    strictEqual(writeVerdictFile("old\n", "new", "full"), "new\n");
  });
  it("appends on resume and keeps the earlier section byte for byte", () => {
    const first = renderVerdictSection({ prefix: "DEMO", batch: "F2", when: "2026-10-22 14:05", mode: "fast", rows: [major], validations: [], notRun: [] }).text;
    const second = renderVerdictSection({ prefix: "DEMO", batch: "F2", when: "2026-10-22 15:00", mode: "resume", rows: [], validations: [], notRun: [] }).text;
    const file = writeVerdictFile(`${first}\n\n`, second, "resume");
    ok(file.startsWith(first));
    strictEqual(file, `${first}\n${second}`);
    const parsed = parseVerdictFile(file);
    deepStrictEqual(parsed.sections.map((s) => s.verdict), ["GAPS", "VALID"]);
  });
  it("writes the section alone on resume without a previous file", () => {
    strictEqual(writeVerdictFile(null, "s\n", "resume"), "s\n");
  });
});
