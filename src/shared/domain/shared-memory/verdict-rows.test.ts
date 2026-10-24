// Learning rows of the verdict files: folding, axes, ids, filters, backlog, listing.
// Run:
//   node --test src/shared/domain/shared-memory/verdict-rows.test.ts
import { describe, it } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { readFileSync } from "node:fs";

import { AUDIT_UNFINISHED_GAP, parseVerdictFile } from "../dev/verdict-format.ts";
import {
  LEARN_FILE, MIN_MOTIF_BATCHES, axisListing, backlogByAxis, canonicalAxis, collectLearnRows, foldText,
  learnRowsOf, rowId, rowIdSource, shortCell, untreated,
} from "./verdict-rows.ts";
import type { LearnRow } from "./verdict-rows.ts";

const demo = readFileSync(new URL("../../../../tests/fixtures/dev/workbench/demo/DEMO-VERIFY-F2.md", import.meta.url), "utf8");

function row(id: string, batch: string, axis: string, severity: "Blocking" | "Major" = "Major"): LearnRow {
  return { id, batch, severity, axis, gap: `gap ${id}`, evidence: "e", fix: "f", source: `${batch}.md`, line: 1 };
}

describe("foldText and canonicalAxis", () => {
  it("folds case and diacritics", () => {
    strictEqual(foldText("É"), "e");
    strictEqual(foldText("ç"), "c");
    strictEqual(foldText("Règle"), "regle");
  });

  it("matches an axis by folded prefix, the plan alias, else the trimmed label", () => {
    strictEqual(canonicalAxis("Tests"), "Test");
    strictEqual(canonicalAxis("stale plan: x"), "Plan");
    strictEqual(canonicalAxis("correctness (null)"), "Correctness");
    strictEqual(canonicalAxis("Naming"), "Naming");
    strictEqual(canonicalAxis("  naming  "), "naming");
  });
});

describe("ids", () => {
  it("joins batch, axis and gap with one pipe", () => {
    strictEqual(rowIdSource("demo/F2", "Test", "g"), "demo/F2|Test|g");
  });

  it("gives the demo ids the script gives", () => {
    const rows = learnRowsOf(parseVerdictFile(demo), "demo", "DEMO-VERIFY-F2.md");
    deepStrictEqual(rows.map((r) => [r.id, r.batch, r.axis, r.gap, r.source]), [
      ["68abc1ec48", "demo/F2", "Test", "The refusal of `a/b` is never exercised", "demo/DEMO-VERIFY-F2.md"],
      ["698abf2554", "demo/F2", "Scope", "The table shows `open | done` for one batch", "demo/DEMO-VERIFY-F2.md"],
      ["3a0ec314c3", "demo/F2", "Scope", "The state column still merges two states", "demo/DEMO-VERIFY-F2.md"],
    ]);
    strictEqual(rowId("demo/F2", "Test", "The refusal of `a/b` is never exercised"), "68abc1ec48");
    strictEqual(rows[0].line, 7);
  });

  it("leaves out the row of an audit the budget stopped", () => {
    const text = "# DEMO-VERIFY-F3 — 2026-10-22 14:05 — fast\n\n## Verdict — GAPS\n\n" +
      "| Severity | Axis | Gap | Evidence | Expected fix |\n|---|---|---|---|---|\n" +
      `| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | tokens: x — capture-F3/auditor-replies.txt | audit again |\n`;
    deepStrictEqual(learnRowsOf(parseVerdictFile(text), "demo", "DEMO-VERIFY-F3.md"), []);
  });

  it("uses the folder name for the batch, not the file prefix", () => {
    strictEqual(learnRowsOf(parseVerdictFile(demo), "other", "DEMO-VERIFY-F2.md")[0].batch, "other/F2");
  });
});

describe("learnRowsOf", () => {
  const text = "## Verdict — VALID\n| Major | Test | v | e | f |\n## Verdict — GAPS\n| Minor | Test | m | e | f |\n| Blocking | Scope | b | e | f |\n";

  it("keeps GAPS sections and Blocking/Major rows only", () => {
    deepStrictEqual(learnRowsOf(parseVerdictFile(text), "c", "C-VERIFY-F1.md").map((r) => r.gap), ["b"]);
  });

  it("gives no row for a name LEARN_FILE refuses", () => {
    deepStrictEqual(learnRowsOf(parseVerdictFile(text), "c", "C-VERIFY-F1b.md"), []);
    strictEqual(LEARN_FILE.test("é-VERIFY-F1.md"), false);
    strictEqual(LEARN_FILE.test("Aé_.-x-VERIFY-F12.md"), true);
  });
});

describe("collectLearnRows", () => {
  const one = "## Verdict — GAPS\n| Major | Reuse | same | e | f |\n| Major | Reuse | same | e2 | f2 |\n";

  it("sorts whole paths and keeps the first row of an id", () => {
    const rows = collectLearnRows([
      { code: "a", name: "A-VERIFY-F1.md", text: one },
      { code: "a-b", name: "AB-VERIFY-F1.md", text: one },
    ]);
    deepStrictEqual(rows.map((r) => [r.batch, r.evidence]), [["a-b/F1", "e"], ["a/F1", "e"]]);
  });
});

describe("untreated and backlogByAxis", () => {
  const rows = [
    row("1", "x/F1", "Plan"), row("2", "x/F1", "Test", "Blocking"), row("3", "x/F2", "Test"),
    row("4", "y/F1", "Scope"), row("5", "y/F2", "Scope"), row("6", "x/F2", "Plan"), row("7", "z/F1", "Test"),
  ];

  it("drops treated ids", () => {
    deepStrictEqual(untreated(rows, new Set(["2", "5"])).map((r) => r.id), ["1", "3", "4", "6", "7"]);
  });

  it("orders axes by distinct batches, ties in first-seen order", () => {
    const b = backlogByAxis(rows);
    deepStrictEqual(b.map((a) => [a.axis, a.batches, a.rows.map((r) => r.id), a.blocking]), [
      ["Test", ["x/F1", "x/F2", "z/F1"], ["2", "3", "7"], 1],
      ["Plan", ["x/F1", "x/F2"], ["1", "6"], 0],
      ["Scope", ["y/F1", "y/F2"], ["4", "5"], 0],
    ]);
    strictEqual(b[0].batches.length >= MIN_MOTIF_BATCHES, true);
  });
});

describe("shortCell and axisListing", () => {
  it("collapses whitespace runs and cuts at n with three dots", () => {
    strictEqual(shortCell("  a \t b\n c  "), "a b c");
    strictEqual(shortCell("x".repeat(200)), "x".repeat(200));
    strictEqual(shortCell("x".repeat(201)), "x".repeat(197) + "...");
    strictEqual(shortCell("abcdef", 5), "ab...");
  });

  it("prints two lines per row", () => {
    deepStrictEqual(axisListing([row("1", "x/F1", "Test", "Blocking")]), ["- [Blocking] gap 1", "  fix: f · x/F1 · e"]);
  });
});
