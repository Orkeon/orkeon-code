// The checks a plan folder must pass before any batch runs: the design ids each classified
// (shared with the /dev-verify gate), and the self-check /dev-plan runs over the plan and
// sheets it has just rendered - parse-back with no problem, the same batches everywhere,
// every source id traced and tested, the step and anchor shapes. Pure, no IO; it reports
// problems and never repairs a text.
import { DESIGN_RULE_IDS } from "./design-rules.ts";
import { parseBatchSheet, parseGlobalPlan, unfencedLines } from "./plan-format.ts";
import type { Line } from "./plan-format.ts";
import { sheetFacts } from "./sheet-facts.ts";
import { SHEET_ID_SOURCE } from "./trait-pattern.ts";

/** The texts of a plan folder, as the gate reads them. */
export interface PlanFolderTexts {
  sheets: readonly string[];   // every <planDir>/*-PLAN-F*.md
  plans: readonly string[];    // every <planDir>/*-PLAN.md
  all: readonly string[];      // every <planDir>/*.md
}

function linesHolding(texts: readonly string[], label: string): string[] {
  return texts.flatMap((t) => t.split("\n")).filter((l) => l.includes(label));
}

/** Design ids on no `Applied rules` line of a sheet and no `Non-applicable rules` line of a plan. */
export function missingDesignIds(plan: PlanFolderTexts): string[] {
  const classified = [...linesHolding(plan.sheets, "Applied rules"), ...linesHolding(plan.plans, "Non-applicable rules")];
  return DESIGN_RULE_IDS.filter((id) => {
    const re = new RegExp(`(^|[^A-Z])${id}([^0-9]|$)`);
    return !classified.some((l) => re.test(l));
  });
}

export interface SelfCheckInput {
  plan: { name: string; text: string };
  sheets: ReadonlyArray<{ name: string; text: string }>;   // F1..Fn in order
  sourceIds: readonly string[];                            // every UC/BR/CH id of the source, sorted
}
export interface SelfCheckReport { ok: boolean; problems: string[] }

const BUILD_STEP = "Build and tests";
/** The one parse problem a reviewed plan may carry: a batch the review marked blocked. */
const BLOCKED_BATCH = /^unknown batch line '### Batch F\d+ — .+ — blocked'$/;
const SEPARATOR_ROW = /^\|[-: |]+\|?$/;

const idsIn = (text: string): string[] => text.match(new RegExp(SHEET_ID_SOURCE, "g")) ?? [];
const listed = (ids: readonly string[]): string => (ids.length === 0 ? "none" : ids.join(", "));

function cellsOf(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

/** The lines of the `## ` section whose heading starts with `heading`, up to the next `## `; null when absent. */
function section(lines: readonly Line[], heading: string): Line[] | null {
  const start = lines.findIndex((l) => l.text.startsWith(heading));
  if (start < 0) return null;
  const out: Line[] = [];
  for (const l of lines.slice(start + 1)) {
    if (l.text.startsWith("## ")) break;
    out.push(l);
  }
  return out;
}

/** The data rows of the first table of a section: the rows after its header and separator. */
function dataRows(lines: readonly Line[]): string[][] {
  const rows = lines.map((l) => l.text.trim()).filter((t) => t.startsWith("|"));
  return rows.slice(2).filter((r) => !SEPARATOR_ROW.test(r)).map(cellsOf);
}

/** The ids of the step tables' `Ids` cells, within `## TDD sequence`. */
function stepTableIds(tdd: readonly Line[]): string[] {
  const out: string[] = [];
  let column = -1;
  for (const { text } of tdd) {
    const t = text.trim();
    if (!t.startsWith("|")) { column = -1; continue; }
    if (SEPARATOR_ROW.test(t)) continue;
    const cells = cellsOf(t);
    if (column < 0) { column = cells.indexOf("Ids"); if (column < 0) column = cells.length + 1; continue; }
    out.push(...idsIn(cells[column] ?? ""));
  }
  return out;
}

/** The ids after `**Ids**:` up to `**Depends on**` (or the end of that line). */
function intentIds(lines: readonly Line[]): string[] {
  const line = lines.find((l) => l.text.includes("**Ids**:"));
  if (line === undefined) return [];
  const after = line.text.slice(line.text.indexOf("**Ids**:"));
  const cut = after.indexOf("**Depends on**");
  return idsIn(cut < 0 ? after : after.slice(0, cut));
}

interface ReadSheet { id: string; name: string; text: string; lines: Line[] }

function stepProblems(s: ReadSheet): string[] {
  const steps = parseBatchSheet(s.text).steps;
  if (steps.length === 0) return [`${s.id}: step 1 is missing: the sheet has no step`];
  const out: string[] = [];
  steps.forEach((step, i) => {
    const last = i === steps.length - 1;
    if (step.number !== i + 1) out.push(`${s.id}: step ${step.number} is numbered out of order (expected ${i + 1})`);
    if (!last && step.tdd === null) out.push(`${s.id}: step ${step.number} has no TDD: line`);
    if (last && step.title !== BUILD_STEP) out.push(`${s.id}: step ${step.number} is the last step and is not ${BUILD_STEP}`);
    if (last && step.tdd !== null) out.push(`${s.id}: step ${step.number} is ${BUILD_STEP} and holds a TDD: line`);
  });
  return out;
}

function anchorProblem(s: ReadSheet): string | null {
  const steps = parseBatchSheet(s.text).steps.length;
  const rows = dataRows(section(s.lines, "## Anchors") ?? []);
  const shaped = rows.length === steps && rows.every((cells, i) => cells[0].startsWith(`${i + 1} — `));
  return shaped ? null : `${s.id}: ## Anchors has ${rows.length} rows for ${steps} steps`;
}

function assumptionsEmpty(s: ReadSheet): boolean {
  const body = section(s.lines, "## Assumptions");
  if (body === null) return false;
  const filled = body.map((l) => l.text.trim()).filter((t) => t !== "");
  return filled.length === 2 && filled[0].startsWith("|") && SEPARATOR_ROW.test(filled[1]);
}

export function planSelfCheck(input: SelfCheckInput): SelfCheckReport {
  const problems: string[] = [];
  const global = parseGlobalPlan(input.plan.text);
  const sheets: ReadSheet[] = input.sheets.map((s, i) => ({
    id: parseBatchSheet(s.text).batch ?? `F${i + 1}`, name: s.name, text: s.text, lines: unfencedLines(s.text),
  }));
  const parsed = input.sheets.map((s) => parseBatchSheet(s.text));
  const source = new Set(input.sourceIds);

  // 1, 14: the plan parses back; a batch line the review marked blocked is tolerated.
  for (const p of global.problems) {
    if (!BLOCKED_BATCH.test(p.message)) problems.push(`${input.plan.name}:${p.line}: ${p.message}`);
  }
  // 2: every sheet parses back.
  input.sheets.forEach((s, i) => {
    for (const p of parsed[i].problems) problems.push(`${s.name}:${p.line}: ${p.message}`);
  });
  // 3: every design id applied or not applicable.
  const texts = input.sheets.map((s) => s.text);
  const missing = missingDesignIds({ sheets: texts, plans: [input.plan.text], all: [input.plan.text, ...texts] });
  if (missing.length > 0) problems.push(`design ids neither applied nor non-applicable: ${missing.join(", ")}`);
  // 4: the same batches, in order.
  const summaryIds = global.summary.map((r) => r.id);
  const lineIds = global.batches.map((b) => b.id);
  const sheetIds = sheets.map((s) => s.id);
  if (summaryIds.join() !== lineIds.join() || lineIds.join() !== sheetIds.join()) {
    problems.push(`batches differ: summary ${listed(summaryIds)}, plan lines ${listed(lineIds)}, sheets ${listed(sheetIds)}`);
  }
  // 5: Depends on agrees between the summary and the sheet.
  sheets.forEach((s, i) => {
    const row = global.summary.find((r) => r.id === s.id);
    if (row === undefined) return;
    const a = listed(row.dependsOn);
    const b = listed(parsed[i].dependsOn);
    if (a !== b) problems.push(`${s.id}: Depends on differs between the summary (${a}) and the sheet (${b})`);
  });
  // 6: every source id has a traceability row.
  const traceRows = dataRows(section(unfencedLines(input.plan.text), "## 2. Traceability") ?? []);
  for (const id of input.sourceIds) {
    const re = new RegExp(`^${id}(?![0-9])`);
    if (!traceRows.some((cells) => re.test(cells[0]))) problems.push(`${id}: no row of ## 2. Traceability`);
  }
  // 7: every source id is named by some sheet's TDD sequence.
  const facts = sheets.map((s) => sheetFacts(s.text));
  const tested = new Set(facts.flatMap((f) => f.ids));
  for (const id of input.sourceIds) {
    if (!tested.has(id)) problems.push(`${id}: no test of any sheet's ## TDD sequence names it`);
  }
  sheets.forEach((s, i) => {
    // 8: a sheet tests ids of the source only.
    for (const id of facts[i].ids) if (!source.has(id)) problems.push(`${s.id}: ${id} is not an id of the source`);
    // 9: behaviour steps 1..s, then the build step.
    problems.push(...stepProblems(s));
    // 10: one anchor row per step.
    const anchors = anchorProblem(s);
    if (anchors !== null) problems.push(anchors);
    // 11: an Applied rules row.
    if (facts[i].appliedRulesRow === null) problems.push(`${s.id}: no Applied rules row`);
    // 12: assumptions left empty.
    if (!assumptionsEmpty(s)) problems.push(`${s.id}: ## Assumptions is not empty`);
    // 13: the TDD sequence names only the batch's ids.
    const own = new Set([...stepTableIds(section(s.lines, "## TDD sequence") ?? []), ...intentIds(s.lines)]);
    for (const id of facts[i].ids) {
      if (!own.has(id)) problems.push(`${s.id}: ${id} appears in ## TDD sequence outside the batch's ids`);
    }
  });
  return { ok: problems.length === 0, problems };
}
