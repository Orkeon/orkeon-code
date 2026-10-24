// What /dev-implement reads off one batch sheet: per step its tests table, its TDD line and its
// `## Anchors` row, and for the whole batch the `## Code elements`, the `Applied rules` and
// `Access cost` rows of `## Design` and the `## Test policy and scopes` text. Line-based over
// plan-format's unfenced lines, as the sheet is written by /dev-plan. Pure, never throws.
import { parseBatchSheet, unfencedLines } from "../../../shared/domain/dev/plan-format.ts";
import type { TddTicks } from "../../../shared/domain/dev/plan-format.ts";

export interface StepTest { name: string; level: string; project: string; ids: string[] }
/** One path of an Anchors cell: `to create`, `existing`, or the member it names; its line when given. */
export interface AnchorRef { path: string; line?: number; state: "to create" | "existing" | "member"; member?: string }
export interface StepAnchor { testFiles: AnchorRef[]; doubles: string; production: AnchorRef[] }
export interface ImplementStep {
  number: number; title: string; tests: StepTest[]; tdd: TddTicks | null; anchor: StepAnchor | null; note: string[];
}
export interface ImplementSheet {
  prefix?: string; batch?: string; name?: string;
  steps: ImplementStep[]; codeElements: string[]; appliedRules: string; accessCost: string; testPolicy: string;
  problems: string[];
}

const STEP_HEADING = /^### Step (\d+) — (.+)$/;
const SEPARATOR_ROW = /^\|[-: |]+$/;
const IDS = /\b[A-Z][A-Z0-9]*-[0-9]+\b/g;
const REF = /`([^`]+)`(?:\s*—\s*(to create|existing|`([^`]+)`))?/;

function cellsOf(row: string): string[] {
  return row.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function unquote(cell: string): string {
  const m = /^`([^`]*)`$/.exec(cell.trim());
  return m ? m[1] : cell.trim();
}

/** `path:line` split; a path without a trailing `:<n>` keeps no line. */
function pathAndLine(text: string): { path: string; line?: number } {
  const m = /^(.*):(\d+)$/.exec(text);
  return m ? { path: m[1], line: Number(m[2]) } : { path: text };
}

/** The references of one Anchors cell: `—` alone is none; parts are split on `;`. */
export function anchorRefs(cell: string): AnchorRef[] {
  const out: AnchorRef[] = [];
  for (const part of cell.split(";")) {
    const m = REF.exec(part.trim());
    if (!m) continue;
    const at = pathAndLine(m[1].trim());
    if (m[3] !== undefined) out.push({ ...at, state: "member", member: m[3] });
    else out.push({ ...at, state: m[2] === "to create" ? "to create" : "existing" });
  }
  return out;
}

/** The lines of the `## <name>` section, heading excluded, up to the next `## `. */
function section(lines: readonly string[], name: string): string[] {
  const out: string[] = [];
  let inside = false;
  for (const l of lines) {
    if (l.startsWith("## ")) { inside = l.trim() === `## ${name}`; continue; }
    if (inside) out.push(l);
  }
  return out;
}

function designRow(design: readonly string[], point: string): string {
  const row = design.find((l) => new RegExp(`^\\| *${point} *\\|`).test(l));
  return row === undefined ? "" : cellsOf(row).slice(1).join(" | ");
}

export function parseImplementSheet(text: string): ImplementSheet {
  const base = parseBatchSheet(text);
  const lines = unfencedLines(text).map((l) => l.text);
  const sheet: ImplementSheet = {
    prefix: base.prefix, batch: base.batch, name: base.name, steps: [],
    codeElements: section(lines, "Code elements").filter((l) => l.trim() !== ""),
    appliedRules: designRow(section(lines, "Design"), "Applied rules"),
    accessCost: designRow(section(lines, "Design"), "Access cost"),
    testPolicy: section(lines, "Test policy and scopes").filter((l) => l.trim() !== "").join("\n"),
    problems: base.problems.map((p) => `line ${p.line}: ${p.message}`),
  };
  const ticks = new Map(base.steps.map((s) => [s.number, s.tdd]));

  let current: ImplementStep | null = null;
  for (const l of section(lines, "TDD sequence")) {
    const heading = STEP_HEADING.exec(l);
    if (heading) {
      current = {
        number: Number(heading[1]), title: heading[2], tests: [], tdd: ticks.get(Number(heading[1])) ?? null,
        anchor: null, note: [],
      };
      sheet.steps.push(current);
      continue;
    }
    if (current === null || l.startsWith("TDD:") || l.trim() === "") continue;
    if (l.startsWith("|")) {
      const cells = cellsOf(l);
      if (SEPARATOR_ROW.test(l) || cells[0] === "#" || cells.length < 5) continue;
      current.tests.push({
        name: unquote(cells[1]), level: cells[2], project: unquote(cells[3]), ids: cells[4].match(IDS) ?? [],
      });
      continue;
    }
    current.note.push(l.trim());
  }

  for (const row of section(lines, "Anchors")) {
    if (!row.startsWith("|") || SEPARATOR_ROW.test(row)) continue;
    const cells = cellsOf(row);
    const number = /^(\d+)\b/.exec(cells[0] ?? "");
    if (number === null || cells.length < 4) continue;
    const step = sheet.steps.find((s) => s.number === Number(number[1]));
    if (step === undefined) { sheet.problems.push(`an Anchors row names step ${number[1]}, which the sheet lacks`); continue; }
    step.anchor = { testFiles: anchorRefs(cells[1]), doubles: cells[2] === "—" ? "" : cells[2], production: anchorRefs(cells[3]) };
  }
  for (const s of sheet.steps) {
    if (s.tdd !== null && s.tests.length === 0) sheet.problems.push(`step ${s.number} has a TDD line and no test`);
    if (s.tdd !== null && (s.anchor === null || s.anchor.testFiles.length === 0)) {
      sheet.problems.push(`step ${s.number} names no test file in ## Anchors`);
    }
  }
  return sheet;
}

/** The steps still to run: a TDD line with a box left open, in order. */
export function openSteps(sheet: ImplementSheet): ImplementStep[] {
  return sheet.steps.filter((s) => s.tdd !== null && !(s.tdd.red && s.tdd.green && s.tdd.cost));
}
