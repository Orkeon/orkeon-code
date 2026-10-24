// The change brief as code writes it: the harness's template (sections 1 to 8) with a section 9 of decisions, an
// empty section left out. § 1 (the origin, quoted) and the facts of § 2 (the reproduction or the measurement that
// ran) are code's and carried over from the file on a revision or a fold; the model adds its own facts after them.
// A criterion carries a `- **Statement**:` line first, which spec-format.ts reads for /dev-plan. Pure, no IO.
import { decisionTable, questionTable } from "../../../shared/domain/dev/questions.ts";
import type { Decision, Question } from "../../../shared/domain/dev/questions.ts";
import type { ChangeKind } from "../../../shared/domain/dev/spec-format.ts";
import { criterionId } from "./change-answer.ts";
import type { ChangeAnswer } from "./change-answer.ts";

export const changeFileName = (code: string): string => `CHANGE-${code}.md`;
export const reproFileName = (code: string): string => `repro-${code}.txt`;
export const CHANGE_QUESTIONS_SECTION = "## 8. Open questions";
export const CHANGE_DECISIONS_SECTION = "## 9. Decisions";
export const ORIGIN_HEADING = /^## 1\. Origin\s*$/;
export const EVIDENCE_HEADING = /^## 2\. Evidence\s*$/;
const MAX_ORIGIN_LINES = 12;

export interface ChangeRenderInput {
  code: string; kind: ChangeKind; answer: ChangeAnswer;
  /** The body of § 1 and the code's lines of § 2, as written (from the file, or built for a new brief). */
  origin: readonly string[];
  facts: readonly string[];
  open: readonly Question[]; decisions: readonly Decision[];
}

const section = (heading: string, body: readonly string[]): string[] => (body.length === 0 ? [] : [heading, "", ...body, ""]);
const table = (header: readonly string[], rows: ReadonlyArray<readonly string[]>): string[] =>
  rows.length === 0 ? [] : [
    `| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map((c) => c || "—").join(" | ")} |`),
  ];

/** The origin as § 1 quotes it: its first lines, each as a quote. */
export function originLines(text: string, from: string): string[] {
  const lines = text.trim().split(/\r?\n/);
  const shown = lines.slice(0, MAX_ORIGIN_LINES).map((l) => `> ${l}`.trimEnd());
  if (lines.length > MAX_ORIGIN_LINES) shown.push(`> … (${lines.length - MAX_ORIGIN_LINES} more lines${from === "" ? "" : ` in ${from}`})`);
  return from === "" ? shown : [`From ${from}:`, "", ...shown];
}

/** The body of the `## ` section whose heading matches, without its surrounding blank lines; [] when absent. */
export function sectionBody(text: string, heading: RegExp): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) { if (inside) break; inside = heading.test(line); continue; }
    if (inside) out.push(line);
  }
  while (out.length > 0 && out[0].trim() === "") out.shift();
  while (out.length > 0 && out[out.length - 1].trim() === "") out.pop();
  return out;
}

export function renderChange(input: ChangeRenderInput): string {
  const a = input.answer;
  const lines: string[] = [`# ${input.code} — ${a.name} — ${input.kind}`, ""];
  if (a.summary !== "") lines.push(...a.summary.split(/\r?\n/).map((l) => `> ${l}`.trimEnd()), "");
  lines.push(...section("## 1. Origin", input.origin));
  const known = input.facts.join("\n");
  const own = a.evidence.filter((e) => !known.includes(e)).map((e) => `- ${e}`);
  const suspected = a.suspected === "" || known.includes(a.suspected) ? [] : [`- **Suspected cause** (suspected): ${a.suspected}`];
  lines.push(...section("## 2. Evidence", [...input.facts, ...(input.facts.length > 0 && own.length + suspected.length > 0 ? [""] : []), ...own, ...suspected]));
  lines.push("## 3. Acceptance", "");
  a.criteria.forEach((c, i) => {
    lines.push(`### ${criterionId(i)} — ${c.name}`, `- **Statement**: ${c.statement} · **Proof**: ${c.proof} · **Severity**: ${c.severity}`, "");
  });
  lines.push(...section("## 4. What must not change", table(
    ["Behaviour", "Pinned by"], a.mustNotChange.map((r) => [r.behaviour, r.pinnedBy === "unpinned" ? "unpinned" : `\`${r.pinnedBy}\``]),
  )));
  lines.push(...section("## 5. Scope", table(["In", "Out"], a.scope.map((s) => [s.in, s.out]))));
  lines.push(...section("## 6. Constraints", a.constraints.map((c) => `- ${c}`)));
  lines.push(...section("## 7. Assumptions", table(
    ["#", "Assumption", "To be validated by"], a.assumptions.map((r, i) => [`A${i + 1}`, r.assumption, r.validatedBy]),
  )));
  lines.push(...section(CHANGE_QUESTIONS_SECTION, questionTable(input.open)));
  lines.push(...section(CHANGE_DECISIONS_SECTION, decisionTable(input.decisions)));
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}
