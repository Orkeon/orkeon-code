// The model's change brief as JSON: the schema it is extracted into, and the check that turns the extraction into
// a ChangeAnswer or the list of what is wrong with it - the harness's change-template self-check as code: a bug has
// a criterion, a perf change a criterion with a number, a refactor at least one behaviour that must not change;
// every criterion is one testable line with its proof; the brief names no design; every cell fits its table.
// `route: "feature"` says the request is a new promise, for /dev-spec. CH ids are code's, by position. Pure.
import type { Checked } from "../../../shared/domain/agents/charter.ts";
import type { ChangeKind } from "../../../shared/domain/dev/spec-format.ts";
import { MAX_QUESTIONS, QUESTION_SCHEMA, breaksCell, draftQuestionProblems } from "../../../shared/domain/dev/questions.ts";
import type { DraftQuestion } from "../../../shared/domain/dev/questions.ts";

export type CriterionSeverity = "blocking" | "warning";
export interface ChangeCriterion { name: string; statement: string; proof: string; severity: CriterionSeverity }
export type ProtectedRow = { behaviour: string; pinnedBy: string };
export interface ChangeAnswer {
  route: "change" | "feature";
  name: string; summary: string;
  /** Facts the model read (a path:line, a number), one per line; the reproduction itself is code's. */
  evidence: string[];
  /** The suspected cause, a path:line and a sentence; "" when none. */
  suspected: string;
  criteria: ChangeCriterion[];
  mustNotChange: ProtectedRow[];
  scope: Array<{ in: string; out: string }>;
  constraints: string[];
  assumptions: Array<{ assumption: string; validatedBy: string }>;
  questions: DraftQuestion[];
}

const CRITERION_SEVERITIES: readonly CriterionSeverity[] = ["blocking", "warning"];
export const MAX_CRITERIA = 12;
const MAX_NAME_CHARS = 80;
const MAX_STATEMENT_CHARS = 200;
const MAX_LIST = 20;
const DESIGN = /\b(new|create[sd]?|add(s|ed)?|introduce[sd]?)\b[^.;]{0,40}\b(class|type|interface|file|module|library|pattern)\b/i;

const str = { type: "string" };
const strings = { type: "array", items: str };
const table = (keys: readonly string[]): object => ({
  type: "array",
  items: { type: "object", properties: Object.fromEntries(keys.map((k) => [k, str])), required: [...keys] },
});

export const CHANGE_ANSWER_SCHEMA: object = {
  type: "object",
  properties: {
    route: { type: "string", enum: ["change", "feature"] },
    name: str, summary: str, evidence: strings, suspected: str,
    criteria: {
      type: "array",
      items: {
        type: "object",
        properties: { name: str, statement: str, proof: str, severity: { type: "string", enum: [...CRITERION_SEVERITIES] } },
        required: ["name", "statement", "proof", "severity"],
      },
    },
    mustNotChange: table(["behaviour", "pinnedBy"]),
    scope: table(["in", "out"]),
    constraints: strings,
    assumptions: table(["assumption", "validatedBy"]),
    questions: { type: "array", items: QUESTION_SCHEMA },
  },
  required: ["route", "name", "summary", "evidence", "suspected", "criteria", "mustNotChange", "scope", "constraints", "assumptions", "questions"],
};

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

export const criterionId = (k: number): string => `CH-${String(k + 1).padStart(2, "0")}`;

function readChangeAnswer(value: unknown): ChangeAnswer {
  const o = isObject(value) ? value : {};
  return {
    route: text(o.route) === "feature" ? "feature" : "change",
    name: text(o.name), summary: text(o.summary), evidence: textList(o.evidence), suspected: text(o.suspected),
    criteria: list(o.criteria).map((c) => {
      const x = isObject(c) ? c : {};
      return { name: text(x.name), statement: text(x.statement), proof: text(x.proof), severity: text(x.severity).toLowerCase() as CriterionSeverity };
    }),
    mustNotChange: rows(o.mustNotChange, ["behaviour", "pinnedBy"]),
    scope: rows(o.scope, ["in", "out"]),
    constraints: textList(o.constraints),
    assumptions: rows(o.assumptions, ["assumption", "validatedBy"]),
    questions: list(o.questions).map((q) => {
      const x = isObject(q) ? q : {};
      return { severity: text(x.severity), question: text(x.question), impact: text(x.impact), options: textList(x.options) };
    }),
  };
}

export function checkChangeAnswer(value: unknown, kind: ChangeKind): Checked<ChangeAnswer> {
  if (!isObject(value)) return { ok: false, problems: ["the answer is not an object"] };
  const a = readChangeAnswer(value);
  if (a.route === "feature") return { ok: true, value: a };
  const problems: string[] = [];
  const oneLine = (t: string): boolean => !/[\r\n]/.test(t);
  if (a.name === "" || !oneLine(a.name) || a.name.length > MAX_NAME_CHARS || a.name.includes("—")) {
    problems.push(`name: one line of at most ${MAX_NAME_CHARS} characters, no '—'`);
  }
  if (a.summary === "") problems.push("summary: what is wrong or costly, where it shows, why now");
  if (a.criteria.length === 0) problems.push("criteria: at least one acceptance criterion");
  if (a.criteria.length > MAX_CRITERIA) problems.push(`criteria: at most ${MAX_CRITERIA}`);
  a.criteria.forEach((c, i) => {
    const id = criterionId(i);
    if (c.name === "" || !oneLine(c.name) || c.name.length > MAX_NAME_CHARS) problems.push(`${id}: the name is one line of at most ${MAX_NAME_CHARS} characters`);
    if (c.statement === "" || !oneLine(c.statement) || c.statement.length > MAX_STATEMENT_CHARS || c.statement.includes(" · ")) {
      problems.push(`${id}: the statement is one testable line of at most ${MAX_STATEMENT_CHARS} characters`);
    }
    if (c.proof === "" || !oneLine(c.proof)) problems.push(`${id}: no proof (the test that reproduces, the measurement and its target, or "no observable behaviour changes")`);
    if (!CRITERION_SEVERITIES.includes(c.severity)) problems.push(`${id}: severity is blocking or warning`);
  });
  if (kind === "perf" && !a.criteria.some((c) => /\d/.test(`${c.statement} ${c.proof}`))) {
    problems.push("a performance change has a criterion with a number as its target");
  }
  if (kind === "refactor" && a.mustNotChange.length === 0) {
    problems.push("a refactor names at least one behaviour that must not change, and the test pinning it or unpinned");
  }
  const tables: Array<[string, ReadonlyArray<Record<string, string>>]> = [
    ["mustNotChange", a.mustNotChange], ["scope", a.scope], ["assumptions", a.assumptions],
  ];
  for (const [name, items] of tables) {
    items.forEach((row, i) => {
      if (Object.values(row).some(breaksCell)) problems.push(`${name} ${i + 1}: every cell is one line, no '|'`);
      if (Object.values(row).every((v) => v === "")) problems.push(`${name} ${i + 1} is empty`);
    });
  }
  a.mustNotChange.forEach((r, i) => { if (r.behaviour === "") problems.push(`mustNotChange ${i + 1}: no behaviour`); });
  if (a.constraints.length > MAX_LIST || a.evidence.length > MAX_LIST) problems.push(`evidence and constraints: at most ${MAX_LIST} lines each`);
  const all = [
    a.name, a.summary, ...a.evidence, a.suspected, ...a.criteria.flatMap((c) => [c.name, c.statement, c.proof]),
    ...a.scope.flatMap((s) => [s.in, s.out]), ...a.constraints,
  ];
  const design = all.find((t) => DESIGN.test(t));
  if (design !== undefined) problems.push(`no design: "${design.slice(0, 60)}" names a new type, file, pattern or library; say what is observed and expected`);
  if (/\bTBD\b/.test(all.join("\n")) && a.questions.length === 0) problems.push("a TBD in the body has no open question");
  if (a.questions.length > MAX_QUESTIONS) problems.push(`questions: at most ${MAX_QUESTIONS}`);
  a.questions.forEach((q, i) => problems.push(...draftQuestionProblems(q, i + 1)));
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: a };
}

/** The answer with each pinned test the inventory does not show turned into "unpinned", and those names. */
export function pinOnlyKnown(a: ChangeAnswer, known: (name: string) => boolean): { answer: ChangeAnswer; unknown: string[] } {
  const unknown: string[] = [];
  const mustNotChange = a.mustNotChange.map((r) => {
    const by = r.pinnedBy.replace(/`/g, "").trim();
    if (by === "" || by.toLowerCase() === "unpinned") return { behaviour: r.behaviour, pinnedBy: "unpinned" };
    if (known(by)) return { behaviour: r.behaviour, pinnedBy: by };
    unknown.push(by);
    return { behaviour: r.behaviour, pinnedBy: "unpinned" };
  });
  return { answer: { ...a, mustNotChange }, unknown };
}
