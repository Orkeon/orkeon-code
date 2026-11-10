// The mechanical table of a capture: the ten checks code decides before the auditor reads
// the batch, each `ok`, `gap` or `not checked` with its evidence, never `ok` by default.
// Built only when the gate is green, so the gate's own checks read `ok` here. Pure.
import type { AccessCost } from "../../../shared/domain/dev/access-cost.ts";
import type { TraitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import { isDesignRuleId } from "../../../shared/domain/dev/design-rules.ts";
import type { TestRunSummary } from "./capture-sections.ts";
import {
  CHECK_APPLIED, CHECK_BUILD, CHECK_CONVENTIONS, CHECK_COST, CHECK_DESIGN_IDS, CHECK_METHODS, CHECK_SCOPE, CHECK_TEST_RUN,
  CHECK_TICKED, CHECK_TRAITS,
} from "./markers.ts";
import {
  BUILD_RUN_GREEN, buildReused, buildRunRed, costGreen, designIdsEvidence, eachDesignRuleId, exitLine, idsCarriedAs,
  JUDGED_BY_AUDITOR, methodsAbsent, methodsFound, NO_APPLIED_RULES_ROW, NO_BUILD_COMMAND, NO_EXIT_LINE, NO_LAYOUT_ROOT,
  NO_TEST_METHOD, NO_TEST_ROOT, noSummaryLine, notComputed, noTestLog, ROW_CITES_NO_ID, scopeEvidence, SHEET_NAMES_NO_ID,
  shellRefused, TABLE_HEADER, tableTitle, TEST_ROOTS_NOT_SEARCHED, testRunEvidence, tickedNoneOpen, timedOutAfter,
  TRAITS_NOT_APPLICABLE, unknownDesignRuleIds,
} from "./messages.ts";

export type CheckResult = "ok" | "gap" | "not checked";
export interface TableRow { axis: string; check: string; result: CheckResult; evidence: string }
export type BuildState =
  | { state: "none" }
  | { state: "reused"; log: string }
  | { state: "run"; exit: number; why: string }
  | { state: "timeout"; seconds: number }
  | { state: "refused"; message: string };
export interface TableInput {
  build: BuildState;
  trait: TraitMarker | null; ids: readonly string[];
  methods: readonly string[]; testRoots: readonly string[]; methodHits: readonly string[] | null;
  testLog: { name: string; summary: TestRunSummary } | null; testLogLooked: string;
  roots: readonly string[];
  cost: AccessCost;
  tickedLines: number; planDirName: string;
  appliedRulesRow: string | null; appliedIds: readonly string[];
}

function row(axis: string, check: string, result: CheckResult, evidence: string): TableRow {
  return { axis, check, result, evidence };
}

function ticks(values: readonly string[]): string {
  return values.map((v) => `\`${v}\``).join(", ");
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function buildRow(build: BuildState): TableRow {
  switch (build.state) {
    case "none": return row("Build", CHECK_BUILD, "not checked", NO_BUILD_COMMAND);
    case "reused": return row("Build", CHECK_BUILD, "ok", buildReused(basename(build.log)));
    case "run":
      return build.exit === 0
        ? row("Build", CHECK_BUILD, "ok", BUILD_RUN_GREEN)
        : row("Build", CHECK_BUILD, "gap", buildRunRed(build.exit, build.why));
    case "timeout": return row("Build", CHECK_BUILD, "not checked", timedOutAfter(build.seconds));
    case "refused": return row("Build", CHECK_BUILD, "not checked", shellRefused(build.message));
  }
}

function traitsRow(input: TableInput): TableRow {
  if (input.trait === null) {
    // Nothing to check: the pack carries ids in no trait, so the row is settled rather than left to the auditor's Not run.
    return row("Test", CHECK_TRAITS, "ok", TRAITS_NOT_APPLICABLE);
  }
  if (input.ids.length === 0) {
    return row("Test", CHECK_TRAITS, "not checked", SHEET_NAMES_NO_ID);
  }
  const shown = input.trait.shown.split("<id>").join("…");
  return row("Test", CHECK_TRAITS, "ok", idsCarriedAs(input.ids.join(", "), shown));
}

function methodsRow(input: TableInput): TableRow {
  if (input.methods.length === 0) return row("Test", CHECK_METHODS, "not checked", NO_TEST_METHOD);
  if (input.testRoots.length === 0) return row("Test", CHECK_METHODS, "not checked", NO_TEST_ROOT);
  if (input.methodHits === null) return row("Test", CHECK_METHODS, "not checked", TEST_ROOTS_NOT_SEARCHED);
  const absent: string[] = [];
  let first = "";
  let found = 0;
  for (const m of input.methods) {
    const hit = input.methodHits.find((h) => h.split(":").pop() === m);
    if (hit === undefined) { absent.push(m); continue; }
    found++;
    if (first === "") first = hit.split(":").slice(0, 2).join(":");
  }
  if (absent.length === 0) {
    return row("Test", CHECK_METHODS, "ok", methodsFound(found, input.methods.length, first));
  }
  return row("Test", CHECK_METHODS, "gap", methodsAbsent(input.testRoots.join(" "), ticks(absent)));
}

function testRunRow(input: TableInput): TableRow {
  if (input.testLog === null) return row("Test", CHECK_TEST_RUN, "not checked", noTestLog(input.testLogLooked));
  const { name, summary } = input.testLog;
  const exit = summary.exit === null ? NO_EXIT_LINE : exitLine(summary.exit);
  const evidence = testRunEvidence(String(summary.passed ?? "-"), String(summary.failed ?? "-"), exit, name);
  if ((summary.exit !== null && summary.exit !== 0) || (summary.failed !== null && summary.failed > 0)) {
    return row("Test", CHECK_TEST_RUN, "gap", evidence);
  }
  if (summary.exit === 0 || summary.passed !== null) return row("Test", CHECK_TEST_RUN, "ok", evidence);
  return row("Test", CHECK_TEST_RUN, "not checked", noSummaryLine(name));
}

function scopeRow(roots: readonly string[]): TableRow {
  if (roots.length === 0) return row("Scope", CHECK_SCOPE, "not checked", NO_LAYOUT_ROOT);
  return row("Scope", CHECK_SCOPE, "ok", scopeEvidence(roots.join(" ")));
}

/** The flagged calls the Cost row shows; cost.txt lists them all. */
const FLAGGED_SHOWN = 12;

function costRow(cost: AccessCost): TableRow {
  if (cost.state === "not-computed") return row("Cost", CHECK_COST, "not checked", notComputed(cost.reason));
  if (cost.exit === 0) return row("Cost", CHECK_COST, "ok", costGreen(cost.costLine));
  const more = cost.flagged.length > FLAGGED_SHOWN ? ` · … +${cost.flagged.length - FLAGGED_SHOWN}` : "";
  return row("Cost", CHECK_COST, "gap", `\`exit: 2\` ${cost.flagged.slice(0, FLAGGED_SHOWN).join(" · ")}${more}`.trimEnd());
}

function appliedRow(input: TableInput): TableRow {
  if (input.appliedRulesRow === null) return row("Plan", CHECK_APPLIED, "gap", NO_APPLIED_RULES_ROW);
  const unknown = input.appliedIds.filter((id) => !isDesignRuleId(id));
  if (unknown.length > 0) return row("Plan", CHECK_APPLIED, "gap", unknownDesignRuleIds(ticks(unknown)));
  if (input.appliedIds.length === 0) return row("Plan", CHECK_APPLIED, "ok", ROW_CITES_NO_ID);
  return row("Plan", CHECK_APPLIED, "ok", eachDesignRuleId(input.appliedIds.join(", ")));
}

/** The 10 rows, in the order of § 2.4. */
export function mechanicalRows(input: TableInput): TableRow[] {
  return [
    buildRow(input.build),
    traitsRow(input),
    methodsRow(input),
    testRunRow(input),
    scopeRow(input.roots),
    costRow(input.cost),
    row("Conventions", CHECK_CONVENTIONS, "not checked", JUDGED_BY_AUDITOR),
    row("Plan", CHECK_TICKED, "ok", tickedNoneOpen(input.tickedLines)),
    row("Plan", CHECK_DESIGN_IDS, "ok", designIdsEvidence(input.planDirName)),
    appliedRow(input),
  ];
}

/** "\" → "\\", "|" → "\|", line breaks → " · " (AC:361). */
export function escapeCell(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " · ");
}

/** The content of table.md (§ 3.3). */
export function renderTable(batch: string, rows: readonly TableRow[]): string {
  const out = [
    tableTitle(batch),
    "",
    TABLE_HEADER,
    "|------|-------|--------|----------|",
    ...rows.map((r) => `| ${r.axis} | ${escapeCell(r.check)} | ${r.result} | ${escapeCell(r.evidence)} |`),
  ];
  return `${out.join("\n")}\n`;
}
