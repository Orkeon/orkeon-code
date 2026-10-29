// The source of a plan: a spec (`SPEC-<code>.md`) or a change brief (`CHANGE-<code>.md`),
// read line by line - its title, its UC/BR/CH ids, its open questions and, for a brief,
// what must not change - and the Blocking gate that stops a plan while an open question
// is Blocking. Pure, no IO, never throws: what does not match becomes a FormatProblem.
// The gate keeps the harness's own line test and adds a reading by the Severity column,
// so it is never less strict than the harness.
import type { FormatProblem } from "./plan-format.ts";

export type SourceKind = "spec" | "change";
export type ChangeKind = "bug" | "refactor" | "perf";
export interface SourceId { id: string; title: string; statement: string; line: number }  // statement "" when none
export interface OpenQuestion { line: number; raw: string; severity: string; cells: string[] }
export interface MustNotChangeRow { line: number; behaviour: string; pinnedBy: string | null } // null: unpinned
export interface PlanSource {
  kind: SourceKind;
  code?: string; name?: string; changeKind?: ChangeKind;     // from the title line
  ids: SourceId[];               // UC, then BR, then CH, each by number
  openQuestions: OpenQuestion[];
  blocking: OpenQuestion[];      // the gate's rows
  mustNotChange: MustNotChangeRow[];   // change brief only
  problems: FormatProblem[];
}

const OPEN_QUESTIONS = /^## .*Open questions/;
const MUST_NOT_CHANGE = /^## (\d+\. )?What must not change/;
const BLOCKING_CELL = /\| *Blocking *\|/;
const SEPARATOR_ROW = /^\|?[-: |]+$/;
const ID_HEADING = /^#{3,4} (UC|BR|CH)-(\d+)\s*[—:-]\s*(.+)$/;
const SPEC_TITLE = /^# (\S+) — (.+)$/;
const BRIEF_TITLE = /^# (\S+) — (.+) — (bug|refactor|perf)\s*$/;
const STATEMENT = "**Statement**";
const MAX_STATEMENT = 200;
const MAX_SHOWN_ROW = 200;
const MAX_SHOWN_ROWS = 8;
const FAMILY_ORDER = ["UC", "BR", "CH"];

const linesOf = (text: string): string[] => text.split(/\r?\n/);
const isTableRow = (line: string): boolean => line.includes("|");

function cellsOf(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** A severity or a pinned-by cell with its emphasis and code marks removed. */
const plain = (cell: string): string => cell.replace(/[*_`]/g, "").trim();

/** The lines of each `## ` section whose heading matches, numbered from 1, heading excluded. */
function sectionLines(lines: readonly string[], heading: RegExp): Array<{ text: string; line: number }> {
  const out: Array<{ text: string; line: number }> = [];
  let inside = false;
  lines.forEach((text, i) => {
    if (text.startsWith("## ")) { inside = heading.test(text); return; }
    if (inside) out.push({ text, line: i + 1 });
  });
  return out;
}

interface TableRow { text: string; line: number; cells: string[]; header: string[] }

/** The data rows of the tables of a section, each with its table's header cells. */
function tableRows(section: ReadonlyArray<{ text: string; line: number }>): TableRow[] {
  const out: TableRow[] = [];
  let header: string[] | null = null;
  for (const { text, line } of section) {
    if (!isTableRow(text)) { header = null; continue; }
    if (SEPARATOR_ROW.test(text.trim())) continue;
    const cells = cellsOf(text);
    if (header === null) { header = cells; continue; }
    out.push({ text, line, cells, header });
  }
  return out;
}

function openQuestions(lines: readonly string[]): OpenQuestion[] {
  return tableRows(sectionLines(lines, OPEN_QUESTIONS)).map((r) => {
    const column = r.header.indexOf("Severity");
    return { line: r.line, raw: r.text, severity: column >= 0 ? (r.cells[column] ?? "") : "", cells: r.cells };
  });
}

/** The gate alone, run before any other read: the raw lines that stop a plan. */
export function blockingRows(text: string): OpenQuestion[] {
  const lines = linesOf(text);
  const section = sectionLines(lines, OPEN_QUESTIONS);
  const bySeverity = new Map<number, OpenQuestion>();
  for (const q of openQuestions(lines)) if (plain(q.severity).toLowerCase() === "blocking") bySeverity.set(q.line, q);
  const out: OpenQuestion[] = [];
  for (const { text: raw, line } of section) {
    const counted = bySeverity.get(line);
    if (counted !== undefined) { out.push(counted); continue; }
    if (BLOCKING_CELL.test(raw)) out.push({ line, raw, severity: "Blocking", cells: cellsOf(raw) });
  }
  return out;
}

function statementOf(lines: readonly string[], from: number): string {
  for (const l of lines.slice(from)) {
    if (l.startsWith("#")) return "";
    const t = l.trim();
    if (!/^[-*] /.test(t)) continue;
    const at = t.indexOf(STATEMENT);
    if (at < 0) return "";
    let s = t.slice(at + STATEMENT.length).replace(/^[\s:*]+/, "");
    for (const stop of [" · ", " **"]) {
      const cut = s.indexOf(stop);
      if (cut >= 0) s = s.slice(0, cut);
    }
    return s.trim().slice(0, MAX_STATEMENT);
  }
  return "";
}

function readIds(lines: readonly string[], kind: SourceKind, problems: FormatProblem[]): SourceId[] {
  const seen = new Set<string>();
  const ids: SourceId[] = [];
  lines.forEach((text, i) => {
    const m = ID_HEADING.exec(text);
    if (!m) return;
    const id = `${m[1]}-${m[2]}`;
    const line = i + 1;
    if (seen.has(id)) { problems.push({ line, message: `duplicated id ${id}` }); return; }
    seen.add(id);
    if (kind === "change" && m[1] !== "CH") { problems.push({ line, message: `${id} in a change brief` }); return; }
    if (kind === "spec" && m[1] === "CH") return;
    ids.push({ id, title: m[3].trim(), statement: statementOf(lines, i + 1), line });
  });
  const rank = (s: SourceId): [number, number] => [FAMILY_ORDER.indexOf(s.id.split("-")[0]), Number(s.id.split("-")[1])];
  return ids.sort((a, b) => {
    const [fa, na] = rank(a);
    const [fb, nb] = rank(b);
    return fa !== fb ? fa - fb : na - nb;
  });
}

function mustNotChange(lines: readonly string[]): MustNotChangeRow[] {
  const out: MustNotChangeRow[] = [];
  for (const r of tableRows(sectionLines(lines, MUST_NOT_CHANGE))) {
    const behaviour = r.header.indexOf("Behaviour");
    const pinned = r.header.indexOf("Pinned by");
    if (behaviour < 0 || pinned < 0) continue;
    const by = (r.cells[pinned] ?? "").replace(/`/g, "").trim();
    out.push({ line: r.line, behaviour: (r.cells[behaviour] ?? "").trim(), pinnedBy: by.toLowerCase() === "unpinned" ? null : by });
  }
  return out;
}

export function parsePlanSource(text: string, kind: SourceKind): PlanSource {
  const lines = linesOf(text);
  const problems: FormatProblem[] = [];
  const source: PlanSource = {
    kind, ids: [], openQuestions: openQuestions(lines), blocking: blockingRows(text), mustNotChange: [], problems,
  };
  const titleIndex = lines.findIndex((l) => l.startsWith("# "));
  if (titleIndex >= 0) {
    const t = lines[titleIndex].trimEnd();
    const brief = kind === "change" ? BRIEF_TITLE.exec(t) : null;
    const plainTitle = SPEC_TITLE.exec(t);
    if (brief) {
      source.code = brief[1]; source.name = brief[2]; source.changeKind = brief[3] as ChangeKind;
    } else if (plainTitle) {
      source.code = plainTitle[1]; source.name = plainTitle[2];
    }
    if (kind === "change" && !brief) {
      problems.push({ line: titleIndex + 1, message: "the brief's title names no kind (bug, refactor or perf)" });
    }
  }
  source.ids = readIds(lines, kind, problems);
  if (kind === "change") source.mustNotChange = mustNotChange(lines);
  return source;
}

/** The stop message: the rows, then the next command. Pure text, shared by the command and the crew. */
export function blockingStop(shown: string, kind: SourceKind, code: string, rows: readonly OpenQuestion[]): string {
  const settle = "/dev-spec";
  const shownRows = rows.slice(0, MAX_SHOWN_ROWS).map((r) => `  ${r.raw.trim().slice(0, MAX_SHOWN_ROW)}`);
  const more = rows.length > MAX_SHOWN_ROWS ? [`  … ${rows.length - MAX_SHOWN_ROWS} more`] : [];
  return [
    `dev-plan: ${shown} has ${rows.length} open Blocking question(s); no plan is written.`,
    ...shownRows,
    ...more,
    `→ Settle them first: ${settle} ${code}${kind === "change" ? " <its kind: bug, refactor or perf>" : ""}, or edit the file; then /dev-plan ${code}.`,
  ].join("\n");
}
