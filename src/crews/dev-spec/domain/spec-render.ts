// The spec file as code writes it from a checked SpecAnswer, its open questions and its decisions: the harness's
// template (sections 1 to 12) with a section 13 of decisions, a section left out when it has nothing to say (the
// numbers stay the template's, so a reader and /dev-plan find each section where they expect it). A use case and a
// rule carry a `- **Statement**:` line first, which spec-format.ts reads for /dev-plan. Pure, no IO.
import { decisionTable, questionTable } from "../../../shared/domain/dev/questions.ts";
import type { Decision, Question } from "../../../shared/domain/dev/questions.ts";
import { ruleId, useCaseId } from "./spec-answer.ts";
import type { SpecAnswer } from "./spec-answer.ts";

export const specFileName = (code: string): string => `SPEC-${code}.md`;
export const SPEC_DECISIONS_SECTION = "## 13. Decisions";
export const SPEC_QUESTIONS_SECTION = "## 12. Open questions";

export interface SpecRenderInput { code: string; answer: SpecAnswer; open: readonly Question[]; decisions: readonly Decision[] }

const section = (heading: string, body: readonly string[]): string[] => (body.length === 0 ? [] : [heading, "", ...body, ""]);
const table = (header: readonly string[], rows: ReadonlyArray<readonly string[]>): string[] =>
  rows.length === 0 ? [] : [
    `| ${header.join(" | ")} |`, `|${header.map(() => "---").join("|")}|`,
    ...rows.map((r) => `| ${r.map((c) => c || "—").join(" | ")} |`),
  ];
const sentence = (t: string): string => (t === "" || /[.!?]$/.test(t) ? t : `${t}.`);

function useCaseBlock(a: SpecAnswer): string[] {
  return a.useCases.flatMap((u, i) => {
    const head = [`**Statement**: ${u.intent}`, `**Actor**: ${u.actor}`];
    if (u.frequency !== "") head.push(`**Frequency**: ${u.frequency}`);
    const lines = [`### ${useCaseId(i)} — ${u.name}`, `- ${head.join(" · ")}`, `- **Where**: ${u.where}`, "- **Nominal scenario**:"];
    u.scenario.forEach((s, k) => lines.push(`  ${k + 1}. ${s}`));
    if (u.variants !== "") lines.push(`- **Variants**: ${u.variants}`);
    if (u.errors !== "") lines.push(`- **Errors**: ${u.errors}`);
    if (u.outcome !== "") lines.push(`- **Expected outcome**: ${u.outcome}`);
    lines.push("");
    return lines;
  });
}

function ruleBlock(a: SpecAnswer): string[] {
  return a.rules.flatMap((r, i) => {
    const applies = r.appliesTo.join(", ");
    const lines = [
      `### ${ruleId(i)} — ${r.name}`,
      `- **Statement**: ${r.statement} · **Origin**: ${r.origin} · **Severity**: ${r.severity}`,
      `- **Applies to**: ${applies}`,
    ];
    if (r.example !== "") lines.push(`- **Example**: ${r.example}`);
    lines.push("");
    return lines;
  });
}

export function renderSpec(input: SpecRenderInput): string {
  const a = input.answer;
  const lines: string[] = [`# ${input.code} — ${a.name}`, ""];
  if (a.summary !== "") lines.push(...a.summary.split(/\r?\n/).map((l) => `> ${l}`.trimEnd()), "");
  lines.push(...section("## 1. Context", [a.context]));
  lines.push(...section("## 2. Vocabulary", table(["Term", "Definition"], a.vocabulary.map((v) => [v.term, v.definition]))));
  lines.push(...section("## 3. Overview", a.overview === "" ? [] : ["```mermaid", a.overview, "```"]));
  lines.push("## 4. Use cases", "", ...useCaseBlock(a));
  if (a.rules.length > 0) lines.push("## 5. Business rules", "", ...ruleBlock(a));
  lines.push(...section("## 6. Data", table(
    ["Datum", "Description", "Source", "Importance"], a.data.map((d) => [d.datum, d.description, d.source, d.importance]),
  )));
  lines.push(...section("## 7. States and transitions", table(
    ["State", "Event", "Next state", "Condition"], a.states.map((s) => [s.state, s.event, s.next, s.condition]),
  )));
  lines.push(...section("## 8. Cross-cutting behaviours", a.crossCutting.map((c) => `- ${sentence(c)}`)));
  lines.push(...section("## 9. Relations", table(["Upstream", "Downstream"], a.relations.map((r) => [r.upstream, r.downstream]))));
  lines.push(...section("## 10. Out of scope", table(["Exclusion", "Reason"], a.outOfScope.map((r) => [r.exclusion, r.reason]))));
  lines.push(...section("## 11. Assumptions", table(
    ["#", "Assumption", "To be validated by"], a.assumptions.map((r, i) => [`A${i + 1}`, r.assumption, r.validatedBy]),
  )));
  lines.push(...section(SPEC_QUESTIONS_SECTION, questionTable(input.open)));
  lines.push(...section(SPEC_DECISIONS_SECTION, decisionTable(input.decisions)));
  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}
