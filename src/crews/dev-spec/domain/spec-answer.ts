// The model's spec as JSON: the schema it is extracted into, and the check that turns the extraction into a
// SpecAnswer or the list of what is wrong with it. The self-check of the harness's spec template, as code: a use
// case has an actor, an intent, a `Where` and a short scenario; a rule is one testable line with an origin and a
// severity, applied to use cases that exist; every vocabulary term is used; a TBD has its open question; nothing
// technical is named; every cell fits its table. Ids are code's: UC-nn and BR-nn by position. Pure, no IO.
import type { Checked } from "../../../shared/domain/agents/charter.ts";
import { MAX_QUESTIONS, QUESTION_SCHEMA, breaksCell, draftQuestionProblems } from "../../../shared/domain/dev/questions.ts";
import type { DraftQuestion } from "../../../shared/domain/dev/questions.ts";

export interface SpecUseCase {
  name: string; actor: string; intent: string; frequency: string; where: string;
  scenario: string[]; variants: string; errors: string; outcome: string;
}
export type RuleSeverity = "blocking" | "warning" | "informational";
export interface SpecRule { name: string; statement: string; origin: string; severity: RuleSeverity; appliesTo: string[]; example: string }
export type SpecDatum = { datum: string; description: string; source: string; importance: string };
export type SpecTransition = { state: string; event: string; next: string; condition: string };
export interface SpecAnswer {
  name: string; summary: string; context: string;
  vocabulary: Array<{ term: string; definition: string }>;
  /** The lines of a mermaid flowchart, without the fence; "" when the feature has no branch nor lifecycle. */
  overview: string;
  useCases: SpecUseCase[]; rules: SpecRule[]; data: SpecDatum[]; states: SpecTransition[];
  crossCutting: string[];
  relations: Array<{ upstream: string; downstream: string }>;
  outOfScope: Array<{ exclusion: string; reason: string }>;
  assumptions: Array<{ assumption: string; validatedBy: string }>;
  questions: DraftQuestion[];
}

export const RULE_SEVERITIES: readonly RuleSeverity[] = ["blocking", "warning", "informational"];
export const DATA_SOURCES = ["entered", "computed", "imported", "catalogue"] as const;
export const DATA_IMPORTANCE = ["essential", "secondary", "expert"] as const;
export const MAX_USE_CASES = 12;
export const MAX_RULES = 24;
export const MAX_SCENARIO_STEPS = 7;
const MAX_NAME_CHARS = 80;
const MAX_STATEMENT_CHARS = 200;
const MAX_LIST = 20;

const str = { type: "string" };
const strings = { type: "array", items: str };
const table = (keys: readonly string[]): object => ({
  type: "array",
  items: { type: "object", properties: Object.fromEntries(keys.map((k) => [k, str])), required: [...keys] },
});

export const SPEC_ANSWER_SCHEMA: object = {
  type: "object",
  properties: {
    name: str, summary: str, context: str,
    vocabulary: table(["term", "definition"]),
    overview: str,
    useCases: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: str, actor: str, intent: str, frequency: str, where: str, scenario: strings,
          variants: str, errors: str, outcome: str,
        },
        required: ["name", "actor", "intent", "frequency", "where", "scenario", "variants", "errors", "outcome"],
      },
    },
    rules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: str, statement: str, origin: str, severity: { type: "string", enum: [...RULE_SEVERITIES] },
          appliesTo: strings, example: str,
        },
        required: ["name", "statement", "origin", "severity", "appliesTo", "example"],
      },
    },
    data: table(["datum", "description", "source", "importance"]),
    states: table(["state", "event", "next", "condition"]),
    crossCutting: strings,
    relations: table(["upstream", "downstream"]),
    outOfScope: table(["exclusion", "reason"]),
    assumptions: table(["assumption", "validatedBy"]),
    questions: { type: "array", items: QUESTION_SCHEMA },
  },
  required: [
    "name", "summary", "context", "vocabulary", "overview", "useCases", "rules", "data", "states", "crossCutting",
    "relations", "outOfScope", "assumptions", "questions",
  ],
};

/** Words of a technical document, never of a business spec (the template's business purity). */
const TECHNICAL: ReadonlyArray<[RegExp, string]> = [
  [/`/, "a code mark (`)"],
  [/\b[A-Za-z_][A-Za-z0-9_]*\(\)/, "a call such as name()"],
  [/\b[\w-]+\.(ts|tsx|js|mjs|cs|py|java|go|rs|rb|php|json|ya?ml|sql|xml|csproj)\b/i, "a file name"],
  [/\bHTTP\b|\b[1-5]\d\d (OK|Not Found|Bad Request|Unauthorized|Forbidden)\b/, "an HTTP status"],
  [/\bexit code\b/i, "an exit code"],
  [/\bstack trace\b/i, "a stack trace"],
  [/\bendpoints?\b/i, "an endpoint"],
  [/\b(class|interface|enum|DTO|repository pattern|framework)\b/, "a type or a framework"],
];

export interface SpecCheckContext {
  /** Re-asked answers keep the decisions: a question repeating one is dropped by code, not refused. */
  decisions?: readonly string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const textList = (v: unknown): string[] => list(v).map(text).filter((t) => t !== "");

function rows<K extends string>(v: unknown, keys: readonly K[]): Array<Record<K, string>> {
  return list(v).map((item) => {
    const o = isObject(item) ? item : {};
    return Object.fromEntries(keys.map((k) => [k, text(o[k])])) as Record<K, string>;
  });
}

/** The value read leniently: every field present, strings trimmed, missing lists empty. */
export function readSpecAnswer(value: unknown): SpecAnswer {
  const o = isObject(value) ? value : {};
  return {
    name: text(o.name), summary: text(o.summary), context: text(o.context),
    vocabulary: rows(o.vocabulary, ["term", "definition"]),
    overview: typeof o.overview === "string" ? o.overview.trim() : "",
    useCases: list(o.useCases).map((u) => {
      const x = isObject(u) ? u : {};
      return {
        name: text(x.name), actor: text(x.actor), intent: text(x.intent), frequency: text(x.frequency),
        where: text(x.where), scenario: textList(x.scenario), variants: text(x.variants), errors: text(x.errors),
        outcome: text(x.outcome),
      };
    }),
    rules: list(o.rules).map((r) => {
      const x = isObject(r) ? r : {};
      return {
        name: text(x.name), statement: text(x.statement), origin: text(x.origin),
        severity: text(x.severity).toLowerCase() as RuleSeverity, appliesTo: textList(x.appliesTo), example: text(x.example),
      };
    }),
    data: rows(o.data, ["datum", "description", "source", "importance"]),
    states: rows(o.states, ["state", "event", "next", "condition"]),
    crossCutting: textList(o.crossCutting),
    relations: rows(o.relations, ["upstream", "downstream"]),
    outOfScope: rows(o.outOfScope, ["exclusion", "reason"]),
    assumptions: rows(o.assumptions, ["assumption", "validatedBy"]),
    questions: list(o.questions).map((q) => {
      const x = isObject(q) ? q : {};
      return { severity: text(x.severity), question: text(x.question), impact: text(x.impact), options: textList(x.options) };
    }),
  };
}

const oneLine = (t: string): boolean => !/[\r\n]/.test(t);
export const useCaseId = (k: number): string => `UC-${String(k + 1).padStart(2, "0")}`;
export const ruleId = (k: number): string => `BR-${String(k + 1).padStart(2, "0")}`;

/** Every text of the answer a reader sees, but the overview (a flowchart's syntax) and the vocabulary. */
function bodyTexts(a: SpecAnswer): string[] {
  return [
    a.name, a.summary, a.context,
    ...a.useCases.flatMap((u) => [u.name, u.actor, u.intent, u.frequency, u.where, ...u.scenario, u.variants, u.errors, u.outcome]),
    ...a.rules.flatMap((r) => [r.name, r.statement, r.origin, r.example]),
    ...a.data.flatMap((d) => [d.datum, d.description]),
    ...a.states.flatMap((s) => [s.state, s.event, s.next, s.condition]),
    ...a.crossCutting,
    ...a.relations.flatMap((r) => [r.upstream, r.downstream]),
    ...a.outOfScope.flatMap((r) => [r.exclusion, r.reason]),
    ...a.assumptions.flatMap((r) => [r.assumption, r.validatedBy]),
    ...a.questions.flatMap((q) => [q.question, q.impact, ...q.options]),
  ];
}

function cellProblems(name: string, items: ReadonlyArray<Record<string, string>>, problems: string[]): void {
  items.forEach((row, i) => {
    for (const [key, value] of Object.entries(row)) {
      if (breaksCell(value)) { problems.push(`${name} ${i + 1}: ${key} is one line, no '|'`); return; }
    }
    if (Object.values(row).every((v) => v === "")) problems.push(`${name} ${i + 1} is empty`);
  });
}

export function checkSpecAnswer(value: unknown, _ctx: SpecCheckContext = {}): Checked<SpecAnswer> {
  if (!isObject(value)) return { ok: false, problems: ["the answer is not an object"] };
  const a = readSpecAnswer(value);
  const problems: string[] = [];

  if (a.name === "" || !oneLine(a.name) || a.name.length > MAX_NAME_CHARS || a.name.includes("—")) {
    problems.push(`name: one line of at most ${MAX_NAME_CHARS} characters, no '—'`);
  }
  if (a.summary === "") problems.push("summary: two or three sentences: what, for whom, why");
  if (a.context === "") problems.push("context: the problem, for whom, the cost of doing nothing");

  if (a.useCases.length === 0) problems.push("useCases: at least one use case");
  if (a.useCases.length > MAX_USE_CASES) problems.push(`useCases: at most ${MAX_USE_CASES}`);
  a.useCases.forEach((u, i) => {
    const id = useCaseId(i);
    if (u.name === "" || !oneLine(u.name) || u.name.length > MAX_NAME_CHARS) problems.push(`${id}: the name is one line of at most ${MAX_NAME_CHARS} characters`);
    if (u.actor === "") problems.push(`${id}: no actor`);
    if (u.intent === "") problems.push(`${id}: no intent`);
    if (u.where === "") problems.push(`${id}: no Where: the surface and the moment the actor meets it`);
    if (u.scenario.length === 0 || u.scenario.length > MAX_SCENARIO_STEPS) {
      problems.push(`${id}: the nominal scenario has 1 to ${MAX_SCENARIO_STEPS} steps`);
    }
    if ([u.actor, u.intent, u.frequency, u.where, ...u.scenario].some((t) => !oneLine(t))) problems.push(`${id}: a field or a step spans lines`);
  });

  const ucIds = new Set(a.useCases.map((_, i) => useCaseId(i)));
  if (a.rules.length > MAX_RULES) problems.push(`rules: at most ${MAX_RULES}`);
  a.rules.forEach((r, i) => {
    const id = ruleId(i);
    if (r.name === "" || !oneLine(r.name) || r.name.length > MAX_NAME_CHARS) problems.push(`${id}: the name is one line of at most ${MAX_NAME_CHARS} characters`);
    if (r.statement === "" || !oneLine(r.statement) || r.statement.length > MAX_STATEMENT_CHARS || r.statement.includes(" · ")) {
      problems.push(`${id}: the statement is one testable line of at most ${MAX_STATEMENT_CHARS} characters`);
    }
    if (r.origin === "") problems.push(`${id}: no origin (regulation, standard, practice, product choice, existing behaviour)`);
    if (!RULE_SEVERITIES.includes(r.severity)) problems.push(`${id}: severity is blocking, warning or informational`);
    if (r.appliesTo.length === 0) problems.push(`${id}: appliesTo names UC-nn ids or cross-cutting`);
    for (const t of r.appliesTo) {
      if (t !== "cross-cutting" && !ucIds.has(t)) problems.push(`${id}: appliesTo '${t}' is no use case of the answer`);
    }
  });

  cellProblems("vocabulary", a.vocabulary, problems);
  cellProblems("data", a.data, problems);
  cellProblems("states", a.states, problems);
  cellProblems("relations", a.relations, problems);
  cellProblems("outOfScope", a.outOfScope, problems);
  cellProblems("assumptions", a.assumptions, problems);
  for (const d of a.data) {
    if (d.source !== "" && !(DATA_SOURCES as readonly string[]).includes(d.source)) problems.push(`data '${d.datum}': source is ${DATA_SOURCES.join(", ")}`);
    if (d.importance !== "" && !(DATA_IMPORTANCE as readonly string[]).includes(d.importance)) {
      problems.push(`data '${d.datum}': importance is ${DATA_IMPORTANCE.join(", ")}`);
    }
  }
  for (const [name, n] of [["crossCutting", a.crossCutting.length], ["vocabulary", a.vocabulary.length], ["data", a.data.length]] as const) {
    if (n > MAX_LIST) problems.push(`${name}: at most ${MAX_LIST} rows`);
  }
  if (a.overview !== "" && (a.overview.includes("```") || !/^(flowchart|graph|stateDiagram)/.test(a.overview))) {
    problems.push("overview: the lines of one mermaid flowchart, without the fence, or \"\"");
  }

  const body = bodyTexts(a).join("\n");
  const lower = body.toLowerCase();
  for (const v of a.vocabulary) {
    if (v.term !== "" && !lower.includes(v.term.toLowerCase())) problems.push(`vocabulary: '${v.term}' is used nowhere else`);
  }
  if (/\bTBD\b/.test(body) && a.questions.length === 0) problems.push("a TBD in the body has no open question");
  for (const [pattern, what] of TECHNICAL) {
    const hit = bodyTexts(a).find((t) => pattern.test(t));
    if (hit !== undefined) problems.push(`business purity: ${what} in "${hit.slice(0, 60)}"; say it in business words`);
  }

  if (a.questions.length > MAX_QUESTIONS) problems.push(`questions: at most ${MAX_QUESTIONS}`);
  a.questions.forEach((q, i) => problems.push(...draftQuestionProblems(q, i + 1)));

  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: a };
}
