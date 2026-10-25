// Dev workflow plans: the global plan `<CODE>-PLAN.md` and its batch sheets
// `<CODE>-PLAN-F<n>.md`, read line by line. Pure, no IO, never throws: a line that
// looks like a format line but does not match becomes a FormatProblem.

export interface FormatProblem { line: number; message: string }
export type BatchState = { kind: "open" } | { kind: "done"; date: string } | { kind: "other"; text: string };
export interface PlanStepBox { number: number; text: string; done: boolean; line: number }
export interface PlanBatch { id: string; name: string; state: BatchState; steps: PlanStepBox[]; line: number }
export interface SummaryRow { id: string; intent: string; ids: string; dependsOn: string[]; reason: string }
export interface GlobalPlan {
  prefix?: string; feature?: string; summary: SummaryRow[]; batches: PlanBatch[]; problems: FormatProblem[];
}
export interface TddTicks { red: boolean; green: boolean; cost: boolean; line: number }
export interface SheetStep { number: number; title: string; tdd: TddTicks | null; doneLine?: string; line: number }
export interface SheetAssumption { id: string; assumption: string; by: string }
export interface BatchSheet {
  prefix?: string; batch?: string; name?: string; doneDate?: string;
  dependsOn: string[]; steps: SheetStep[]; problems: FormatProblem[];
  /** The rows of `## Assumptions`, present when it holds one. */
  assumptions?: SheetAssumption[];
}
export interface SheetProgress { behaviourSteps: number; red: number; green: number; cost: number; complete: number }

const PLAN_TITLE = /^# (\S+)-PLAN — (.+)$/;
const SUMMARY_HEADING = /^## 0\. Summary/;
const BATCH_LINE = /^### Batch (F\d+) — (.+) — (open|done \((\d{4}-\d{2}-\d{2})\))$/;
const BATCH_PREFIX = /^### Batch (F\d+) — (.*)$/;
const STEP_BOX = /^- \[( |x|X)\] (\d+)\. (.*)$/;
const SHEET_TITLE = /^# (\S+)-PLAN-(F\d+) — (.+?)( — done \((\d{4}-\d{2}-\d{2})\))?$/;
const DEPENDS_ON = /\*\*Depends on\*\*: (.+)$/;
const STEP_HEADING = /^### Step (\d+) — (.+)$/;
const TDD_LINE = /^TDD: RED \[( |x|X)\] GREEN \[( |x|X)\] COST \[( |x|X)\]$/;
const DONE_LINE = /^Done \((\d{4}-\d{2}-\d{2})\) — /;
// A row of `## Assumptions`: the table's `| H<n> | <text> | <by> |`, or the list line written before it.
const ASSUMPTION_ROW = /^\|\s*(H\d+)\s*\|(.*)\|(.*)\|\s*$/;
const ASSUMPTION_BULLET = /^- (H\d+) — (.*) — to be validated by (.+)$/;

export interface Line { text: string; line: number }

/**
 * The lines outside backtick fences, trimmed on the right, numbered from 1. A fence
 * opens on a run of three backticks or more and closes only on a line holding nothing
 * but a run at least as long, so a longer fence can quote a shorter one.
 */
export function unfencedLines(text: string): Line[] {
  const out: Line[] = [];
  let fence = 0; // length of the open fence, 0 outside one
  text.split(/\r?\n/).forEach((raw, i) => {
    const t = raw.trimEnd();
    const run = /^`{3,}/.exec(t.trimStart())?.[0].length ?? 0;
    if (fence === 0 && run > 0) { fence = run; return; }
    if (fence > 0) {
      if (run >= fence && t.trim().length === run) fence = 0;
      return;
    }
    out.push({ text: t, line: i + 1 });
  });
  return out;
}

function tableCells(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|")) return null;
  return t.replace(/^\|+/, "").replace(/\|+$/, "").split("|").map((c) => c.trim());
}

function dependsList(value: string): string[] {
  const v = value.trim();
  if (v === "" || v === "—" || v === "-" || /^\[?none\]?\.?$/i.test(v)) return [];
  return v.replace(/\.$/, "").replace(/^\[/, "").replace(/\]$/, "").split(",").map((s) => s.trim()).filter((s) => s !== "");
}

const tick = (c: string): boolean => c === "x" || c === "X";

export function parseGlobalPlan(text: string): GlobalPlan {
  const plan: GlobalPlan = { summary: [], batches: [], problems: [] };
  let inSummary = false;
  let batch: PlanBatch | null = null;
  for (const { text: t, line } of unfencedLines(text)) {
    if (t.startsWith("#")) {
      batch = null;
      if (t.startsWith("## ")) inSummary = SUMMARY_HEADING.test(t);
      const title = PLAN_TITLE.exec(t);
      if (title && plan.prefix === undefined) { plan.prefix = title[1]; plan.feature = title[2]; continue; }
      if (t.startsWith("### Batch")) {
        const m = BATCH_LINE.exec(t);
        if (m) {
          const state: BatchState = m[4] ? { kind: "done", date: m[4] } : { kind: "open" };
          batch = { id: m[1], name: m[2], state, steps: [], line };
        } else {
          plan.problems.push({ line, message: `unknown batch line '${t}'` });
          const p = BATCH_PREFIX.exec(t);
          if (p) {
            const cut = p[2].lastIndexOf(" — ");
            const name = cut >= 0 ? p[2].slice(0, cut) : p[2];
            const stateText = cut >= 0 ? p[2].slice(cut + 3) : "";
            batch = { id: p[1], name, state: { kind: "other", text: stateText }, steps: [], line };
          }
        }
        if (batch) plan.batches.push(batch);
      }
      continue;
    }
    if (batch) {
      const box = STEP_BOX.exec(t);
      if (box) { batch.steps.push({ number: Number(box[2]), text: box[3], done: tick(box[1]), line }); continue; }
    }
    if (inSummary) {
      const cells = tableCells(t);
      if (cells && /^F\d+$/.test(cells[0])) {
        if (cells.length < 5) {
          plan.problems.push({ line, message: `malformed summary row '${t}'` });
          continue;
        }
        plan.summary.push({
          id: cells[0], intent: cells[1], ids: cells[2], dependsOn: dependsList(cells[3]),
          reason: cells.slice(4).join(" | "),
        });
      }
    }
  }
  return plan;
}

export function parseBatchSheet(text: string): BatchSheet {
  const sheet: BatchSheet = { dependsOn: [], steps: [], problems: [] };
  let inIntent = false;
  let inAssumptions = false;
  let step: SheetStep | null = null;
  for (const { text: t, line } of unfencedLines(text)) {
    if (t.startsWith("#")) {
      step = null;
      if (t.startsWith("## ")) { inIntent = t === "## Intent"; inAssumptions = t === "## Assumptions"; }
      const title = SHEET_TITLE.exec(t);
      if (title && sheet.prefix === undefined) {
        sheet.prefix = title[1];
        sheet.batch = title[2];
        sheet.name = title[3];
        if (title[5]) sheet.doneDate = title[5];
        continue;
      }
      const s = STEP_HEADING.exec(t);
      if (s) { step = { number: Number(s[1]), title: s[2], tdd: null, line }; sheet.steps.push(step); }
      continue;
    }
    if (inAssumptions) {
      const a = ASSUMPTION_ROW.exec(t) ?? ASSUMPTION_BULLET.exec(t);
      if (a) (sheet.assumptions ??= []).push({ id: a[1], assumption: a[2].trim(), by: a[3].trim() });
      continue;
    }
    if (inIntent) {
      const d = DEPENDS_ON.exec(t);
      if (d) { sheet.dependsOn = dependsList(d[1]); continue; }
    }
    if (t.startsWith("TDD:")) {
      const m = TDD_LINE.exec(t);
      if (!m) { sheet.problems.push({ line, message: `malformed TDD line '${t}'` }); continue; }
      if (!step) { sheet.problems.push({ line, message: `TDD line outside a step '${t}'` }); continue; }
      if (step.tdd !== null) { sheet.problems.push({ line, message: `step ${step.number} has two TDD: lines` }); continue; }
      step.tdd = { red: tick(m[1]), green: tick(m[2]), cost: tick(m[3]), line };
      continue;
    }
    if (step && step.tdd === null && step.doneLine === undefined && DONE_LINE.test(t)) step.doneLine = t;
  }
  return sheet;
}

/** Behaviour steps = steps with a TDD line (none under "Build and tests", plan-template.md:131). */
export function sheetProgress(sheet: BatchSheet): SheetProgress {
  const p: SheetProgress = { behaviourSteps: 0, red: 0, green: 0, cost: 0, complete: 0 };
  for (const s of sheet.steps) {
    if (!s.tdd) continue;
    p.behaviourSteps++;
    if (s.tdd.red) p.red++;
    if (s.tdd.green) p.green++;
    if (s.tdd.cost) p.cost++;
    if (s.tdd.red && s.tdd.green && s.tdd.cost) p.complete++;
  }
  return p;
}
