// The facts the gate and the mechanical table read off one batch sheet: the ids of its
// `## TDD sequence`, the test methods of its step tables, its `Applied rules` row and its
// `TDD:` lines. Line-based, as the harness's greps read the file. Pure.
import { SHEET_ID_SOURCE } from "./trait-pattern.ts";

export interface SheetFacts {
  ids: string[];                  // ids of `## TDD sequence`, sorted, unique (AC:166)
  methods: string[];              // step-table Test methods, first-seen order, unique (AC:380-388)
  appliedRulesRow: string | null; // the first line matching /^\| *Applied rules *\|/ (AC:450)
  appliedIds: string[];           // /\b[A-Z]+-[0-9]+\b/ after "Applied rules", first-seen order (AC:454)
  tickedLines: number;            // lines holding "TDD: RED [x] GREEN [x] COST [x]" (AC:448)
  closed: boolean;                // check 1 (AC:119)
}

const TICKED = "TDD: RED [x] GREEN [x] COST [x]";
const OPEN_BOX = /(RED|GREEN|COST) \[ \]/;
const APPLIED_ROW = /^\| *Applied rules *\|/;
const SEPARATOR_ROW = /^\|[-: |]+$/;
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

/** The lines of the `## TDD sequence` section, heading excluded; it ends at the next `## ` heading. */
function tddSection(lines: readonly string[]): string[] {
  const out: string[] = [];
  let inside = false;
  for (const l of lines) {
    if (l.startsWith("## TDD sequence")) { inside = true; continue; }
    if (l.startsWith("## ")) inside = false;
    if (inside) out.push(l);
  }
  return out;
}

/** The method of one Test cell: the first backticked text, call and class cut; null when none. */
function methodOf(cell: string): string | null {
  const open = cell.indexOf("`");
  if (open < 0) return null;
  let v = cell.slice(open + 1);
  const close = v.indexOf("`");
  if (close >= 0) v = v.slice(0, close);
  const paren = v.indexOf("(");
  if (paren >= 0) v = v.slice(0, paren);
  if (/[<>]/.test(v)) return null;
  const last = v.split(".").at(-1) ?? "";
  return IDENTIFIER.test(last) ? last : null;
}

function stepMethods(section: readonly string[]): string[] {
  const methods: string[] = [];
  let column = 0;
  for (const l of section) {
    if (!l.startsWith("|")) { column = 0; continue; }
    if (SEPARATOR_ROW.test(l)) continue;
    const cells = l.split("|");
    if (column === 0) {
      for (let i = 1; i < cells.length - 1; i++) if (cells[i].trim() === "Test") column = i;
      continue;
    }
    const method = methodOf(cells[column] ?? "");
    if (method !== null) methods.push(method);
  }
  return unique(methods);
}

export function sheetFacts(sheet: string): SheetFacts {
  const lines = sheet.split("\n");
  const section = tddSection(lines);
  const ids = unique(section.flatMap((l) => l.match(new RegExp(SHEET_ID_SOURCE, "g")) ?? [])).sort();
  const appliedRulesRow = lines.find((l) => APPLIED_ROW.test(l)) ?? null;
  const afterLabel = appliedRulesRow === null ? "" : appliedRulesRow.slice(appliedRulesRow.indexOf("Applied rules") + "Applied rules".length);
  const tickedLines = lines.filter((l) => l.includes(TICKED)).length;
  return {
    ids,
    methods: stepMethods(section),
    appliedRulesRow,
    appliedIds: unique(afterLabel.match(/\b[A-Z]+-[0-9]+\b/g) ?? []),
    tickedLines,
    closed: tickedLines > 0 && !lines.some((l) => OPEN_BOX.test(l)),
  };
}
