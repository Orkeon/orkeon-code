// The gate of dev-verify: five mechanical checks on a batch before any audit - the sheet
// closed, every design id classified, every changed file in scope, every sheet id carried
// by a test trait, no whitespace error. The ok/FAIL lines keep the harness's wording, so
// that both gates print the same lines on the same batch. Pure: the application gathers
// the inputs (run-gate.ts).
import type { SheetFacts } from "./sheet-facts.ts";
import type { TraitMarker } from "../../../shared/domain/dev/trait-pattern.ts";
import { SHEET_ID_SOURCE, idsInMatch } from "../../../shared/domain/dev/trait-pattern.ts";
import { missingDesignIds } from "../../../shared/domain/dev/plan-checks.ts";
import type { PlanFolderTexts } from "../../../shared/domain/dev/plan-checks.ts";
export type { PlanFolderTexts } from "../../../shared/domain/dev/plan-checks.ts";

export type GateLineKind = "ok" | "FAIL" | "note";
export interface GateLine { kind: GateLineKind; text: string }
export interface GateInput {
  batch: string;
  sheetShown: string;          // relative to the top
  sheet: string;
  facts: SheetFacts;           // sheetFacts(sheet)
  plan: PlanFolderTexts;
  planDirShown: string;        // relative, no trailing "/"
  planDirAbsolute: string;     // "/workspace/" + planDirShown (printed by the stray note, AC:194)
  roots: readonly string[];
  changedFiles: readonly string[];   // sorted, unique
  trait: TraitMarker | null;
  traitHits: readonly string[] | null;   // lines of gitTraitGrep; null when it was not run
  diffCheckExit: number;
}
export interface GateReport {
  green: boolean;
  lines: string[];               // header, check lines, final line: what --gate-only prints
  checks: GateLine[];
  missingDesignIds: string[]; outside: string[]; untested: string[]; stray: string[];
}

const ok = (text: string): GateLine => ({ kind: "ok", text });
const fail = (text: string): GateLine => ({ kind: "FAIL", text });
const note = (text: string): GateLine => ({ kind: "note", text });

function checkClosed(facts: SheetFacts): GateLine {
  return facts.closed
    ? ok("sheet: every step reads `TDD: RED [x] GREEN [x] COST [x]`")
    : fail("sheet not closed: a `TDD:` line is still open, or none is ticked");
}

function outsideFiles(input: GateInput): string[] {
  const prefixes = input.roots.map((r) => `${r.replace(/\/+$/, "")}/`);
  const planPrefix = `${input.planDirShown}/`;
  return input.changedFiles.filter((f) => {
    if (f === "") return false;
    if (prefixes.some((p) => f.startsWith(p))) return false;
    if (f.startsWith(planPrefix)) return false;
    const base = f.slice(f.lastIndexOf("/") + 1);
    return !input.sheet.includes(base);
  });
}

function knownIds(texts: readonly string[]): Set<string> {
  const known = new Set<string>();
  for (const t of texts) for (const id of t.match(new RegExp(SHEET_ID_SOURCE, "g")) ?? []) known.add(id);
  return known;
}

export function runGateChecks(input: GateInput): GateReport {
  const checks: GateLine[] = [checkClosed(input.facts)];

  const missing = missingDesignIds(input.plan);
  checks.push(missing.length === 0
    ? ok("design ids: all applied or non-applicable")
    : fail(`design ids neither on an \`Applied rules\` row nor on \`Non-applicable rules\`:${missing.map((id) => ` ${id}`).join("")}`));

  let outside: string[] = [];
  if (input.roots.length === 0) {
    checks.push(note("scope: the pack names no layout root, not checked"));
  } else {
    const roots = input.roots.join(" ");
    outside = outsideFiles(input);
    if (outside.length === 0) {
      checks.push(ok(`scope: every changed file is under ${roots} or named by the sheet`));
    } else {
      checks.push(fail(`files changed outside ${roots} and absent from the sheet — name them under \`## Decisions\`, or restore them`));
      for (const f of outside) checks.push(note(f));
    }
  }

  let untested: string[] = [];
  let stray: string[] = [];
  if (input.trait === null) {
    checks.push(note("rule traits: the pack has no tests.rule_trait, not checked"));
  } else if (input.facts.ids.length === 0) {
    checks.push(note("rule traits: the sheet's `## TDD sequence` names no BR-/UC-/CH- id, nothing to check"));
  } else {
    const hits = input.traitHits ?? [];
    const carried = new Set(hits.flatMap(idsInMatch));
    untested = input.facts.ids.filter((id) => !carried.has(id));
    const shown = input.trait.shown;
    checks.push(untested.length === 0
      ? ok(`rule traits: every id of the sheet is carried by a test, ${shown}`)
      : fail(`ids of the sheet's TDD sequence that no test carries as ${shown}:${untested.map((id) => ` ${id}`).join("")}`));
    const known = knownIds(input.plan.all);
    const cited = [...new Set(hits.flatMap((h) => h.match(/(BR|UC|CH)-[0-9]+/g) ?? []))].sort();
    stray = cited.filter((id) => !known.has(id));
    if (stray.length > 0) {
      checks.push(note(`traits citing an id absent from ${input.planDirAbsolute}/*.md:${stray.map((id) => ` ${id}`).join("")}`));
    }
  }

  checks.push(input.diffCheckExit === 0
    ? ok("git diff --check: clean")
    : fail("git diff --check reports trailing whitespace or conflict markers"));

  const green = !checks.some((c) => c.kind === "FAIL");
  const lines = [
    `GATE — batch ${input.batch} — sheet ${input.sheetShown}`,
    ...checks.map(gateLineText),
    green ? `GATE — batch ${input.batch}: GREEN` : `GATE — batch ${input.batch}: RED — fix and run again, no audit before`,
  ];
  return { green, lines, checks, missingDesignIds: missing, outside, untested, stray };
}

/** "  ok   <t>", "  FAIL <t>", "       <t>" (AC:96-98). */
export function gateLineText(line: GateLine): string {
  if (line.kind === "ok") return `  ok   ${line.text}`;
  if (line.kind === "FAIL") return `  FAIL ${line.text}`;
  return `       ${line.text}`;
}
