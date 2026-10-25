// The verdict files and learning rows the verdict rows are tested on.
import { readFileSync } from "node:fs";

import { AUDIT_UNFINISHED_GAP } from "../dev/verdict-format.ts";
import type { LearnRow, VerdictSource } from "./verdict-rows.ts";

/** The demo verdict file of batch F2: three learning rows. */
export const demo = (): string =>
  readFileSync(new URL("../../../../tests/fixtures/dev/workbench/demo/DEMO-VERIFY-F2.md", import.meta.url), "utf8");

/** A learning row of `batch` on `axis`, its gap named after its id. */
export function row(id: string, batch: string, axis: string, severity: "Blocking" | "Major" = "Major"): LearnRow {
  return { id, batch, severity, axis, gap: `gap ${id}`, evidence: "e", fix: "f", source: `${batch}.md`, line: 1 };
}

export interface TextCase {
  name: string;
  text: string;
  expected: string;
}

export const FOLDS: readonly TextCase[] = [
  { name: "an upper-case accented letter", text: "É", expected: "e" },
  { name: "a cedilla", text: "ç", expected: "c" },
  { name: "a word with a grave accent", text: "Règle", expected: "regle" },
];

export const AXES: readonly TextCase[] = [
  { name: "a folded prefix", text: "Tests", expected: "Test" },
  { name: "the plan alias", text: "stale plan: x", expected: "Plan" },
  { name: "a prefix before a note", text: "correctness (null)", expected: "Correctness" },
  { name: "an unknown label", text: "Naming", expected: "Naming" },
  { name: "an unknown label, trimmed", text: "  naming  ", expected: "naming" },
];

/** The ids, batches, axes, gaps and sources the script gives for the demo file. */
export const DEMO_ROWS = [
  ["68abc1ec48", "demo/F2", "Test", "The refusal of `a/b` is never exercised", "demo/DEMO-VERIFY-F2.md"],
  ["698abf2554", "demo/F2", "Scope", "The table shows `open | done` for one batch", "demo/DEMO-VERIFY-F2.md"],
  ["3a0ec314c3", "demo/F2", "Scope", "The state column still merges two states", "demo/DEMO-VERIFY-F2.md"],
];

/** An audit the budget stopped: its one row is the unfinished-audit gap. */
export const STOPPED_AUDIT = "# DEMO-VERIFY-F3 — 2026-10-22 14:05 — fast\n\n## Verdict — GAPS\n\n" +
  "| Severity | Axis | Gap | Evidence | Expected fix |\n|---|---|---|---|---|\n" +
  `| Blocking | Correctness | ${AUDIT_UNFINISHED_GAP} | tokens: x — capture-F3/auditor-replies.txt | audit again |\n`;

/** A VALID section with a Major row, then a GAPS section with a Minor and a Blocking row. */
export const VALID_THEN_GAPS =
  "## Verdict — VALID\n| Major | Test | v | e | f |\n## Verdict — GAPS\n| Minor | Test | m | e | f |\n| Blocking | Scope | b | e | f |\n";

export interface NameCase {
  name: string;
  file: string;
  matches: boolean;
}

export const LEARN_FILE_NAMES: readonly NameCase[] = [
  { name: "refuses a code with a non-ASCII letter", file: "é-VERIFY-F1.md", matches: false },
  { name: "accepts a code of ASCII letters, an underscore, a dot and dashes", file: "Aé_.-x-VERIFY-F12.md", matches: true },
];

const SAME_ROW_TWICE = "## Verdict — GAPS\n| Major | Reuse | same | e | f |\n| Major | Reuse | same | e2 | f2 |\n";

/** Two folders, a and a-b, each with the same row twice. */
export const TWO_FOLDERS: readonly VerdictSource[] = [
  { code: "a", name: "A-VERIFY-F1.md", text: SAME_ROW_TWICE },
  { code: "a-b", name: "AB-VERIFY-F1.md", text: SAME_ROW_TWICE },
];

/** Seven rows on three axes: Test over three batches (one Blocking), Plan and Scope over two each. */
export const BACKLOG_ROWS: readonly LearnRow[] = [
  row("1", "x/F1", "Plan"), row("2", "x/F1", "Test", "Blocking"), row("3", "x/F2", "Test"),
  row("4", "y/F1", "Scope"), row("5", "y/F2", "Scope"), row("6", "x/F2", "Plan"), row("7", "z/F1", "Test"),
];

export interface ShortCellCase {
  name: string;
  text: string;
  n?: number;
  expected: string;
}

export const SHORT_CELLS: readonly ShortCellCase[] = [
  { name: "collapses whitespace runs", text: "  a \t b\n c  ", expected: "a b c" },
  { name: "keeps 200 characters whole", text: "x".repeat(200), expected: "x".repeat(200) },
  { name: "cuts 201 characters with three dots", text: "x".repeat(201), expected: "x".repeat(197) + "..." },
  { name: "cuts at the n it is given", text: "abcdef", n: 5, expected: "ab..." },
];
