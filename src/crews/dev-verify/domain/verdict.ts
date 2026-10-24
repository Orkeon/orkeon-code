// The verdict of an audit: code decides it from the rows (any Blocking or Major row makes
// it GAPS), carries every mechanical gap the auditor left out, caps the table, and writes
// the dated section that both verdict parsers read back. Pure.
import type { AuditRow, Axis, Undecided } from "./audit-answer.ts";
import { AXES, SEVERITY_ORDER } from "./audit-answer.ts";
import type { TableRow } from "./mechanical-table.ts";
import { CHECK_TEST_RUN } from "./mechanical-table.ts";
import type { Severity, Verdict } from "../../../shared/domain/dev/verdict-format.ts";
import { cut } from "./text.ts";

export const MAX_VERDICT_ROWS = 8;
const MAX_CELL_CHARS = 300;
const NO_VALIDATION = "none — the capture's build and last test run stand";

function two(n: number): string {
  return String(n).padStart(2, "0");
}

/** Local "YYYY-MM-DD HH:MM". */
export function formatWhen(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** The row a mechanical gap is carried as: the build is a correctness failure, a red suite blocks, the rest is Major. */
function carried(row: TableRow): AuditRow {
  const fix = `see table.md: ${row.check}`;
  if (row.axis === "Build") {
    return { severity: "Blocking", axis: "Correctness", gap: `the build is red: ${row.check}`, evidence: row.evidence, fix };
  }
  const axis: Axis = (AXES as readonly string[]).includes(row.axis) ? (row.axis as Axis) : "Correctness";
  const severity: Severity = row.axis === "Test" && row.check === CHECK_TEST_RUN ? "Blocking" : "Major";
  return { severity, axis, gap: row.check, evidence: row.evidence, fix };
}

/**
 * One row per mechanical `gap` row, severity per § 2.7. A carried Blocking row is dropped only
 * when an answer row on the same axis is Blocking too (it then stands for it); a carried Major
 * row only when an answer row on its axis is Blocking or Major.
 */
export function carriedRows(answer: readonly AuditRow[], table: readonly TableRow[]): AuditRow[] {
  const covered = (row: AuditRow): boolean => answer.some((a) => a.axis === row.axis && rank(a.severity) <= rank(row.severity));
  return table.filter((r) => r.result === "gap").map(carried).filter((r) => !covered(r));
}

/** GAPS iff a Blocking or Major row (AX:94). */
export function decideVerdict(rows: readonly AuditRow[]): Verdict {
  return rows.some((r) => r.severity === "Blocking" || r.severity === "Major") ? "GAPS" : "VALID";
}

function rank(severity: Severity): number {
  return SEVERITY_ORDER.indexOf(severity);
}

export function capRows(rows: readonly AuditRow[]): { rows: AuditRow[]; overflow: string[] } {
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r.severity) - rank(b.r.severity) || a.i - b.i).map((x) => x.r);
  const kept = sorted.slice(0, MAX_VERDICT_ROWS);
  const rest = sorted.slice(MAX_VERDICT_ROWS);
  const overflow: string[] = [];
  for (const severity of SEVERITY_ORDER) {
    const of = rest.filter((r) => r.severity === severity);
    if (of.length === 0) continue;
    overflow.push(`+${of.length} more ${severity} on ${[...new Set(of.map((r) => r.axis))].join(", ")}`);
  }
  return { rows: kept, overflow };
}

function cellCut(text: string): string {
  return cut(text, MAX_CELL_CHARS);
}

function oneLine(text: string): string {
  return text.replace(/\r?\n/g, " · ");
}

/** Severity, Axis, Evidence, Expected fix: a "|" would shift the columns, so it becomes "/". */
function plainCell(text: string): string {
  return cellCut(oneLine(text).replace(/\|/g, "/").trim());
}

/** Gap: both parsers re-join the middle cells with " | ", so a spaced "|" survives. */
function gapCell(text: string): string {
  return cellCut(oneLine(text).replace(/\s*\|\s*/g, " | ").trim());
}

function rowLine(r: AuditRow): string {
  return `| ${plainCell(r.severity)} | ${plainCell(r.axis)} | ${gapCell(r.gap)} | ${plainCell(r.evidence)} | ${plainCell(r.fix)} |`;
}

export interface VerdictSectionInput {
  prefix: string; batch: string; when: string; mode: "fast" | "full" | "resume";
  rows: readonly AuditRow[];          // answer rows + carried rows, uncapped
  validations: readonly string[];     // validationLine(...) texts, without "Validations: "
  notRun: readonly string[];          // "<suite or check> — <reason>"
}

export function renderVerdictSection(input: VerdictSectionInput): { text: string; verdict: Verdict; shown: AuditRow[] } {
  const verdict = decideVerdict(input.rows);
  const { rows, overflow } = capRows(input.rows);
  const out = [`# ${input.prefix}-VERIFY-${input.batch} — ${input.when} — ${input.mode}`, "", `## Verdict — ${verdict}`, ""];
  if (rows.length === 0) {
    out.push("None.");
  } else {
    out.push("| Severity | Axis | Gap | Evidence | Expected fix |", "|----------|------|-----|----------|--------------|");
    out.push(...rows.map(rowLine));
  }
  out.push(...overflow, "");
  const validations = input.validations.map(oneLine);
  out.push(`Validations: ${validations.length === 0 ? NO_VALIDATION : validations.join(" · ")}`);
  for (const n of input.notRun) out.push(`Not run: ${oneLine(n)}`);
  return { text: `${out.join("\n")}\n`, verdict, shown: rows };
}

/** fast and full replace the file; resume appends a dated section after the earlier ones. */
export function writeVerdictFile(previous: string | null, section: string, mode: "fast" | "full" | "resume"): string {
  const body = mode === "resume" && previous !== null && previous.trim() !== "" ? `${previous.trimEnd()}\n\n${section}` : section;
  return body.endsWith("\n") ? body : `${body}\n`;
}

/** "<prefix>-VERIFY-<batch>.md". */
export function verdictFileName(prefix: string, batch: string): string {
  return `${prefix}-VERIFY-${batch}.md`;
}

/** "<check> — <reason>". */
export function undecidedNotRun(undecided: readonly Undecided[]): string[] {
  return undecided.map((u) => `${u.check} — ${u.reason}`);
}
