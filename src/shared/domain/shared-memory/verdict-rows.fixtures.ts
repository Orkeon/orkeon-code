// The verdict files and learning rows the verdict rows are tested on, and the recorded run of the harness's
// learning script they are compared with.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { AUDIT_UNFINISHED_GAP } from "../dev/verdict-format.ts";
import { LEARN_FILE } from "./verdict-rows.ts";
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

// The recorded run of the harness's learning script, read from tests/fixtures/dev/learn. The recorded files were
// produced once, from /workspace, with python3 and the script
// at temp/_sources/orkeon-workshop/.devcontainer/harness/packs/dev/claude/skills/dev-learn/scripts/learn-candidates.py:
//
//   F=/workspace/tests/fixtures/dev/learn
//   LC=<the script above>
//   DEV_LEARN_ROOT=$F DEV_LEARN_STATE=$F/absent.json HARNESS_WORK_DIR=workbench python3 -I -c \
//     'import importlib.util,json,sys; s=importlib.util.spec_from_file_location("lc", sys.argv[1]); m=importlib.util.module_from_spec(s); s.loader.exec_module(m); print(json.dumps(m.rows(), ensure_ascii=False, indent=1))' \
//     "$LC" > $F/rows.py.json
//   DEV_LEARN_ROOT=$F DEV_LEARN_STATE=$F/harness-state.json HARNESS_WORK_DIR=workbench python3 -I "$LC" --axis Test > $F/axis-Test.py.txt
//   DEV_LEARN_ROOT=$F DEV_LEARN_STATE=$F/harness-state.json HARNESS_WORK_DIR=workbench python3 -I "$LC" --axis Placement > $F/axis-Placement.py.txt
//
// ledger/LEDGER-VERIFY-F1.md carries the edge rows: padded cells, axes written
// `test` and `PLACEMENT` (folded), a gap with two spaces in a row (kept in the id),
// a row without its trailing `|` (read), and a row of four cells (skipped by both).
//
// absent.json does not exist, so the first run sees an empty state. No test runs python3.

const root = fileURLToPath(new URL("../../../../tests/fixtures/dev/learn/", import.meta.url));
const work = join(root, "workbench");

/** A file the script's run recorded, as text. */
export const recorded = (name: string): string => readFileSync(join(root, name), "utf8");

/** The verdict files of every work folder of the fixture's workbench. */
export function sources(): VerdictSource[] {
  const out: VerdictSource[] = [];
  for (const code of readdirSync(work)) {
    if (code.startsWith(".") || !statSync(join(work, code)).isDirectory()) continue;
    for (const name of readdirSync(join(work, code))) {
      if (LEARN_FILE.test(name)) out.push({ code, name, text: readFileSync(join(work, code, name), "utf8") });
    }
  }
  return out;
}

/** The ids the recorded harness state marks treated. */
export const treatedIds = (): Set<string> =>
  new Set<string>((JSON.parse(recorded("harness-state.json")) as { treated: string[] }).treated);

/** The fields of a row the script prints. */
export const project = (r: LearnRow) =>
  ({ id: r.id, batch: r.batch, severity: r.severity, axis: r.axis, gap: r.gap, evidence: r.evidence, fix: r.fix });

/** The axes the script's run listed. */
export const RECORDED_AXES: readonly string[] = ["Test", "Placement"];
