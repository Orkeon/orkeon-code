// The mechanical table of a capture: the ten checks code decides before the auditor reads
// the batch, each `ok`, `gap` or `not checked` with its evidence, never `ok` by default.
// Built only when the gate is green, so the gate's own checks read `ok` here. Pure.
import type { AccessCost } from "../../../shared/domain/dev/access-cost.ts";
import type { TraitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import { isDesignRuleId } from "../../../shared/domain/dev/design-rules.ts";
import type { TestRunSummary } from "./capture-sections.ts";

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

export const CHECK_BUILD = "capture `build`";
export const CHECK_TRAITS = "ids carried by traits";
export const CHECK_METHODS = "step-table methods in the test roots";
export const CHECK_TEST_RUN = "last test run";
export const CHECK_SCOPE = "changed files in the batch";
export const CHECK_COST = "capture `cost`";
export const CHECK_CONVENTIONS = "layer rules of the changed layers";
export const CHECK_TICKED = "`TDD:` lines ticked";
export const CHECK_DESIGN_IDS = "design ids classified";
export const CHECK_APPLIED = "`Applied rules` ids are design-rule ids";

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
    case "none": return row("Build", CHECK_BUILD, "not checked", "the pack has no commands.build");
    case "reused": return row("Build", CHECK_BUILD, "ok", `\`exit: 0\` (reused ${basename(build.log)})`);
    case "run":
      return build.exit === 0
        ? row("Build", CHECK_BUILD, "ok", "`exit: 0` (run)")
        : row("Build", CHECK_BUILD, "gap", `\`exit: ${build.exit}\`${build.why !== "" ? ` — ${build.why}` : ""}`);
    case "timeout": return row("Build", CHECK_BUILD, "not checked", `timed out after ${build.seconds} s`);
    case "refused": return row("Build", CHECK_BUILD, "not checked", `the shell refused it: ${build.message}`);
  }
}

function traitsRow(input: TableInput): TableRow {
  if (input.trait === null) {
    return row("Test", CHECK_TRAITS, "not checked", "the pack has no tests.rule_trait or tests.trait_pattern");
  }
  if (input.ids.length === 0) {
    return row("Test", CHECK_TRAITS, "not checked", "the sheet's `## TDD sequence` names no BR-/UC-/CH- id");
  }
  const shown = input.trait.shown.split("<id>").join("…");
  return row("Test", CHECK_TRAITS, "ok", `gate: ${input.ids.join(", ")} each carried as ${shown} — capture \`traits\``);
}

function methodsRow(input: TableInput): TableRow {
  if (input.methods.length === 0) return row("Test", CHECK_METHODS, "not checked", "the step tables name no test method");
  if (input.testRoots.length === 0) return row("Test", CHECK_METHODS, "not checked", "no test root in the pack's layout");
  if (input.methodHits === null) return row("Test", CHECK_METHODS, "not checked", "the test roots were not searched");
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
    return row("Test", CHECK_METHODS, "ok", `${found}/${input.methods.length} found (git grep --untracked), first \`${first}\``);
  }
  return row("Test", CHECK_METHODS, "gap", `absent from ${input.testRoots.join(" ")}: ${ticks(absent)}`);
}

function testRunRow(input: TableInput): TableRow {
  if (input.testLog === null) return row("Test", CHECK_TEST_RUN, "not checked", `no test log in ${input.testLogLooked}`);
  const { name, summary } = input.testLog;
  const exit = summary.exit === null ? "no `exit=` line" : `\`exit=${summary.exit}\``;
  const evidence = `passed ${summary.passed ?? "-"}, failed ${summary.failed ?? "-"}, ${exit} — ${name}`;
  if ((summary.exit !== null && summary.exit !== 0) || (summary.failed !== null && summary.failed > 0)) {
    return row("Test", CHECK_TEST_RUN, "gap", evidence);
  }
  if (summary.exit === 0 || summary.passed !== null) return row("Test", CHECK_TEST_RUN, "ok", evidence);
  return row("Test", CHECK_TEST_RUN, "not checked", `no summary line and no \`exit=\` in the tail of ${name}`);
}

function scopeRow(roots: readonly string[]): TableRow {
  if (roots.length === 0) return row("Scope", CHECK_SCOPE, "not checked", "the pack names no layout root");
  return row("Scope", CHECK_SCOPE, "ok",
    `gate: every changed file under ${roots.join(" ")}, the plan folder or named by the sheet — capture \`changed-files\``);
}

function costRow(cost: AccessCost): TableRow {
  if (cost.state === "not-computed") return row("Cost", CHECK_COST, "not checked", `not computed — ${cost.reason}`);
  if (cost.exit === 0) return row("Cost", CHECK_COST, "ok", "`exit: 0`");
  return row("Cost", CHECK_COST, "gap", `\`exit: 2\` ${cost.flagged.join(" · ")}`.trimEnd());
}

function appliedRow(input: TableInput): TableRow {
  if (input.appliedRulesRow === null) return row("Plan", CHECK_APPLIED, "gap", "the sheet has no `Applied rules` row");
  const unknown = input.appliedIds.filter((id) => !isDesignRuleId(id));
  if (unknown.length > 0) return row("Plan", CHECK_APPLIED, "gap", `unknown design-rule ids: ${ticks(unknown)}`);
  if (input.appliedIds.length === 0) return row("Plan", CHECK_APPLIED, "ok", "the row cites no id");
  return row("Plan", CHECK_APPLIED, "ok", `${input.appliedIds.join(", ")}, each a design-rule id`);
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
    row("Conventions", CHECK_CONVENTIONS, "not checked", "judged pass (the auditor)"),
    row("Plan", CHECK_TICKED, "ok", `gate: ${input.tickedLines} ticked, none open`),
    row("Plan", CHECK_DESIGN_IDS, "ok",
      `gate: every DDD-/APP-/PERF- id applied or on \`Non-applicable rules\` of ${input.planDirName}/`),
    appliedRow(input),
  ];
}

/** "|" → "\|", line breaks → " · " (AC:361). */
export function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " · ");
}

/** The content of table.md (§ 3.3). */
export function renderTable(batch: string, rows: readonly TableRow[]): string {
  const out = [
    `# Mechanical audit — ${batch}`,
    "",
    "| Axis | Check | Result | Evidence |",
    "|------|-------|--------|----------|",
    ...rows.map((r) => `| ${r.axis} | ${escapeCell(r.check)} | ${r.result} | ${escapeCell(r.evidence)} |`),
  ];
  return `${out.join("\n")}\n`;
}
