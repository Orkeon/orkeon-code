// The learning view of the verdict files: the Blocking and Major rows of every GAPS
// section, each with the id the harness's learning script gives it, so a row the
// harness treated is treated here too (the harness reads no state of this tool). Pure, no IO, never throws.
//
// Known divergences from the script, accepted (the files the dev workflow writes hold
// none of them):
// - the script also splits lines on \v, \f, \x1c-\x1e, \x85, U+2028, U+2029 and a lone
//   \r; parseVerdictFile splits on \r?\n only;
// - Python's strip() and String.prototype.trim() disagree on U+FEFF, U+001C-U+001F and
//   U+0085 at the edge of a cell;
// - toLowerCase() and Python's lower() disagree on a few special casings (e.g. U+0130).
import { AXES, isAuditUnfinishedGap, parseVerdictFile } from "../dev/verdict-format.ts";
import type { Severity, VerdictFile } from "../dev/verdict-format.ts";
import { sha1Hex } from "../sha1.ts";

export type LearnSeverity = Extract<Severity, "Blocking" | "Major">;
export interface LearnRow {
  id: string;            // 10 hex digits
  batch: string;         // "<code folder>/F<n>", e.g. "demo/F2"
  severity: LearnSeverity;
  axis: string;          // canonicalAxis(cell 2): one of AXES, or the trimmed label when none matches
  gap: string; evidence: string; fix: string;
  source: string;        // "<code folder>/<file name>", for messages
  line: number;          // the row's line in its file
}
export interface VerdictSource { code: string; name: string; text: string }
export interface AxisBacklog { axis: string; rows: LearnRow[]; batches: string[]; blocking: number }

/** Three distinct batches make a motif (temp/05 § 3.2 MISTAKE_MIN_BATCHES; SK:29). */
export const MIN_MOTIF_BATCHES = 3;
/** The backlog nudge of LC:38, kept for M-7. Unused by L-3. */
export const NUDGE_BATCHES = 2;
/** The harness's verdict file name (LC:40), Unicode-aware as Python's str regex is. */
export const LEARN_FILE: RegExp = /^([A-Za-z0-9][\p{L}\p{N}_.-]*)-VERIFY-(F\p{Nd}+)\.md$/u;

const PLAN_ALIAS = "stale plan";
const CELL = 200;

/** Lower case, then canonical decomposition, then no combining mark (LC:85-86). */
export function foldText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "");
}

/** The axis a label names: a folded prefix match on AXES, `stale plan` for Plan, else the label trimmed (LC:89-92). */
export function canonicalAxis(label: string): string {
  const trimmed = label.trim();
  const folded = foldText(trimmed);
  if (folded.startsWith(PLAN_ALIAS)) return "Plan";
  return AXES.find((a) => folded.startsWith(foldText(a))) ?? trimmed;
}

export function rowIdSource(batch: string, axis: string, gap: string): string {
  return `${batch}|${axis}|${gap}`;
}

export function rowId(batch: string, axis: string, gap: string): string {
  return sha1Hex(rowIdSource(batch, axis, gap)).slice(0, 10);
}

function isLearnSeverity(severity: Severity): severity is LearnSeverity {
  return severity === "Blocking" || severity === "Major";
}

/** The learning rows of one parsed verdict file: GAPS sections only, Blocking/Major only, an unfinished audit's row left out. */
export function learnRowsOf(file: VerdictFile, code: string, name: string): LearnRow[] {
  const m = LEARN_FILE.exec(name);
  if (!m) return [];
  const batch = `${code}/${m[2]}`;
  const source = `${code}/${name}`;
  const out: LearnRow[] = [];
  for (const section of file.sections) {
    if (section.verdict !== "GAPS") continue;
    for (const r of section.rows) {
      if (!isLearnSeverity(r.severity) || isAuditUnfinishedGap(r.gap)) continue;
      const axis = canonicalAxis(r.axis);
      out.push({
        id: rowId(batch, axis, r.gap), batch, severity: r.severity, axis,
        gap: r.gap, evidence: r.evidence, fix: r.expectedFix, source, line: r.line,
      });
    }
  }
  return out;
}

/** Every row of every source: sorted by `${code}/${name}`, parsed with parseVerdictFile, deduplicated by id (first kept). */
export function collectLearnRows(sources: readonly VerdictSource[]): LearnRow[] {
  const key = (s: VerdictSource): string => `${s.code}/${s.name}`;
  const sorted = [...sources].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  const seen = new Set<string>();
  const out: LearnRow[] = [];
  for (const s of sorted) {
    for (const row of learnRowsOf(parseVerdictFile(s.text), s.code, s.name)) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      out.push(row);
    }
  }
  return out;
}

export function untreated(rows: readonly LearnRow[], treated: ReadonlySet<string>): LearnRow[] {
  return rows.filter((r) => !treated.has(r.id));
}

/** Per axis: rows in order, distinct batches in first-seen order, Blocking count; sorted by batches descending, stable. */
export function backlogByAxis(rows: readonly LearnRow[]): AxisBacklog[] {
  const byAxis = new Map<string, AxisBacklog>();
  for (const r of rows) {
    let entry = byAxis.get(r.axis);
    if (!entry) { entry = { axis: r.axis, rows: [], batches: [], blocking: 0 }; byAxis.set(r.axis, entry); }
    entry.rows.push(r);
    if (!entry.batches.includes(r.batch)) entry.batches.push(r.batch);
    if (r.severity === "Blocking") entry.blocking++;
  }
  return [...byAxis.values()].sort((a, b) => b.batches.length - a.batches.length);
}

/** LC:154-156: split on whitespace runs and re-joined with one space (so also trimmed); when longer than n, the
 *  first n - 3 characters plus "..." (three dots), n characters in all. Characters are code points, as in Python. */
export function shortCell(text: string, n: number = CELL): string {
  const joined = text.split(/\s+/u).filter((w) => w !== "").join(" ");
  const chars = Array.from(joined);
  return chars.length <= n ? joined : chars.slice(0, n - 3).join("") + "...";
}

/** The lines LC:187-188 prints for one axis: "- [<sev>] <short gap>" and "  fix: <short fix 120> · <batch> · <short evidence 80>". */
export function axisListing(rows: readonly LearnRow[]): string[] {
  return rows.flatMap((r) => [
    `- [${r.severity}] ${shortCell(r.gap)}`,
    `  fix: ${shortCell(r.fix, 120)} · ${r.batch} · ${shortCell(r.evidence, 80)}`,
  ]);
}
