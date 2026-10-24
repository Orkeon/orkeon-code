// The open questions of a spec or a change brief and the decisions a person made on them: the rows of the two
// tables, written and read back, and the checks of a question as a model gives it. An open row keeps the
// template's columns (`| # | Severity | Question | Impact | Options |`), so spec-format.ts and the harness read
// its severity as before; a decision row (`| # | Question | Answer | Date |`) records what was settled, in a section
// of its own. Pure, no IO.

export type QuestionSeverity = "Blocking" | "Major";
export const QUESTION_SEVERITIES: readonly QuestionSeverity[] = ["Blocking", "Major"];

/** One open question; `options[0]` is the recommended answer, `[]` when the question names none. */
export interface Question { id: string; severity: QuestionSeverity; question: string; impact: string; options: string[] }
/** One settled question: the question as it was asked, the answer the person gave, the day. */
export interface Decision { id: string; question: string; answer: string; date: string }

export const OPEN_QUESTIONS_HEADER = ["| # | Severity | Question | Impact | Options |", "|---|---|---|---|---|"];
export const DECISIONS_HEADER = ["| # | Question | Answer | Date |", "|---|---|---|---|"];
/** The option a person picks to keep a question open; never written as an option of the file. */
export const LEAVE_OPEN = "Leave it open";
export const RECOMMENDED_MARK = " (recommended)";
export const MAX_QUESTIONS = 12;
export const MAX_OPTIONS = 4;
const MAX_QUESTION_CHARS = 300;
const MAX_OPTION_CHARS = 120;
const MAX_CELL_CHARS = 300;
const QUESTION_ID = /^Q(\d+)$/;
const SEPARATOR_ROW = /^\|?[-: |]+$/;

/** A cell breaks its table when it holds a `|` or a line break. */
export const breaksCell = (text: string): boolean => /[|\r\n]/.test(text);

/** Two questions ask the same thing when they read the same, case and spaces aside. */
export const foldQuestion = (text: string): string => text.toLowerCase().replace(/[\s?]+/g, " ").trim();

export function optionsCell(options: readonly string[]): string {
  if (options.length === 0) return "—";
  return options.map((o, i) => `${i + 1}. ${o}${i === 0 ? RECOMMENDED_MARK : ""}`).join("; ");
}

/** The options of a cell written by optionsCell, or [] when the cell does not read as such a list. */
export function parseOptionsCell(cell: string): string[] {
  const text = cell.trim();
  if (text === "" || text === "—" || text === "-") return [];
  const parts = text.split(/;\s*/).map((p) => p.trim()).filter((p) => p !== "");
  const out: string[] = [];
  for (const [i, part] of parts.entries()) {
    const m = /^(\d+)\.\s+(.+)$/.exec(part);
    if (m === null || Number(m[1]) !== i + 1) return [];
    out.push(m[2].replace(/\s*\(recommended\)\s*$/i, "").trim());
  }
  return out.length >= 2 ? out : [];
}

export function questionRow(q: Question): string {
  return `| ${q.id} | ${q.severity} | ${q.question} | ${q.impact || "—"} | ${optionsCell(q.options)} |`;
}

export function decisionRow(d: Decision): string {
  return `| ${d.id} | ${d.question} | ${d.answer} | ${d.date} |`;
}

/** The table lines of a section, [] when there is no row: the section is then left out. */
export function questionTable(questions: readonly Question[]): string[] {
  return questions.length === 0 ? [] : [...OPEN_QUESTIONS_HEADER, ...questions.map(questionRow)];
}

export function decisionTable(decisions: readonly Decision[]): string[] {
  return decisions.length === 0 ? [] : [...DECISIONS_HEADER, ...decisions.map(decisionRow)];
}

const cellsOf = (row: string): string[] =>
  row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** The data rows of the tables under each `## ` heading matching `heading`, with their header cells. */
function rowsUnder(text: string, heading: RegExp): Array<{ header: string[]; cells: string[] }> {
  const out: Array<{ header: string[]; cells: string[] }> = [];
  let inside = false;
  let header: string[] | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("## ")) { inside = heading.test(line); header = null; continue; }
    if (!inside) continue;
    if (!line.includes("|")) { header = null; continue; }
    if (SEPARATOR_ROW.test(line.trim())) continue;
    const cells = cellsOf(line);
    if (header === null) { header = cells; continue; }
    out.push({ header, cells });
  }
  return out;
}

const cell = (row: { header: string[]; cells: string[] }, name: string): string => {
  const i = row.header.findIndex((h) => h.replace(/[*_`]/g, "").trim().toLowerCase() === name.toLowerCase());
  return i < 0 ? "" : (row.cells[i] ?? "").trim();
};

/** The highest Q<n> of the ids, 0 when none. */
function highest(ids: Iterable<string>): number {
  let max = 0;
  for (const id of ids) {
    const m = QUESTION_ID.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

export const OPEN_QUESTIONS_HEADING = /^## .*Open questions/;
export const DECISIONS_HEADING = /^## (\d+\. )?Decisions\s*$/;

/** The open questions of a file, as written by questionRow or by hand: a row without a Q<n> id gets the next free
 *  one, a severity other than Blocking reads Major, a row without a question is skipped. */
export function parseOpenQuestions(text: string, taken: Iterable<string> = []): Question[] {
  const rows = rowsUnder(text, OPEN_QUESTIONS_HEADING);
  let next = Math.max(highest(taken), highest(rows.map((r) => cell(r, "#")))) + 1;
  const out: Question[] = [];
  for (const r of rows) {
    const question = cell(r, "Question");
    if (question === "") continue;
    const own = cell(r, "#");
    const id = QUESTION_ID.test(own) ? own : `Q${next++}`;
    const severity: QuestionSeverity = cell(r, "Severity").replace(/[*_`]/g, "").trim().toLowerCase() === "blocking"
      ? "Blocking" : "Major";
    const impact = cell(r, "Impact");
    out.push({ id, severity, question, impact: impact === "—" ? "" : impact, options: parseOptionsCell(cell(r, "Options")) });
  }
  return out;
}

export function parseDecisions(text: string): Decision[] {
  return rowsUnder(text, DECISIONS_HEADING)
    .map((r) => ({ id: cell(r, "#"), question: cell(r, "Question"), answer: cell(r, "Answer"), date: cell(r, "Date") }))
    .filter((d) => d.question !== "" && d.answer !== "");
}

/** A question as a model gives it, before it has an id. */
export interface DraftQuestion { severity: string; question: string; impact: string; options: string[] }

export const QUESTION_SCHEMA: object = {
  type: "object",
  properties: {
    severity: { type: "string", enum: [...QUESTION_SEVERITIES] },
    question: { type: "string" },
    impact: { type: "string" },
    options: { type: "array", items: { type: "string" } },
  },
  required: ["severity", "question", "impact", "options"],
};

/** What is wrong with question `k` of an answer: [] when it is one closed question fitting a row. */
export function draftQuestionProblems(q: DraftQuestion, k: number): string[] {
  const problems: string[] = [];
  if (!QUESTION_SEVERITIES.includes(q.severity as QuestionSeverity)) problems.push(`question ${k}: severity must be Blocking or Major`);
  const text = q.question.trim();
  if (text === "" || breaksCell(text) || text.length > MAX_QUESTION_CHARS || !text.endsWith("?")) {
    problems.push(`question ${k}: one line of at most ${MAX_QUESTION_CHARS} characters ending with ?, no '|'`);
  }
  if (breaksCell(q.impact) || q.impact.length > MAX_CELL_CHARS) problems.push(`question ${k}: the impact is one line, no '|'`);
  if (q.options.length === 1 || q.options.length > MAX_OPTIONS) {
    problems.push(`question ${k}: no option, or 2 to ${MAX_OPTIONS} options with the recommended one first`);
  }
  const seen = new Set<string>();
  for (const o of q.options) {
    const t = o.trim();
    if (t === "" || breaksCell(t) || t.includes(";") || t.length > MAX_OPTION_CHARS) {
      problems.push(`question ${k}: an option is one line of at most ${MAX_OPTION_CHARS} characters, no ';' nor '|'`);
      break;
    }
    if (t.toLowerCase() === LEAVE_OPEN.toLowerCase()) { problems.push(`question ${k}: '${LEAVE_OPEN}' is not an option to list`); break; }
    if (seen.has(t.toLowerCase())) { problems.push(`question ${k}: two options read the same`); break; }
    seen.add(t.toLowerCase());
  }
  return problems;
}

/**
 * The open questions after a draft: the model's, each numbered after every id already used (open or decided), a
 * question that asks what a decision settled dropped, as is one asked twice.
 */
export function numberQuestions(
  drafts: readonly DraftQuestion[], decisions: readonly Decision[], kept: readonly Question[] = [],
): Question[] {
  const settled = new Set(decisions.map((d) => foldQuestion(d.question)));
  const out: Question[] = [...kept];
  const seen = new Set(out.map((q) => foldQuestion(q.question)));
  let next = highest([...decisions.map((d) => d.id), ...kept.map((q) => q.id)]) + 1;
  for (const d of drafts) {
    const key = foldQuestion(d.question);
    if (settled.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: `Q${next++}`, severity: d.severity === "Blocking" ? "Blocking" : "Major", question: d.question.trim(),
      impact: d.impact.trim(), options: d.options.map((o) => o.trim()),
    });
  }
  return out;
}

/** Blocking first, then Major, each in its order. */
export function askingOrder(questions: readonly Question[]): Question[] {
  return [...questions.filter((q) => q.severity === "Blocking"), ...questions.filter((q) => q.severity !== "Blocking")];
}

/** The decision a person made, its answer fitting a cell. */
export function decide(q: Question, answer: string, date: string): Decision {
  const flat = answer.replace(/\s*[\r\n]+\s*/g, " ").replace(/\|/g, "/").trim();
  return { id: q.id, question: q.question, answer: flat.length > MAX_CELL_CHARS ? `${flat.slice(0, MAX_CELL_CHARS)}…` : flat, date };
}

/** The text a person reads before answering. */
export function questionPrompt(label: string, q: Question): string {
  const impact = q.impact === "" ? [] : [`Impact: ${q.impact}`];
  return [`${label} — ${q.id} (${q.severity}): ${q.question}`, ...impact].join("\n");
}

/**
 * The text with its open-questions and decisions sections replaced by these tables: both old sections are taken
 * out and the new ones written where the first of them stood (at the end when there was none). An empty table
 * leaves its section out.
 */
export function withQuestionSections(
  text: string, open: readonly Question[], decisions: readonly Decision[], headings: { questions: string; decisions: string },
): string {
  const lines = text.replace(/\s+$/, "").split(/\r?\n/);
  const kept: string[] = [];
  let at = -1;
  let skipping = false;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      skipping = OPEN_QUESTIONS_HEADING.test(line) || DECISIONS_HEADING.test(line);
      if (skipping && at < 0) at = kept.length;
    }
    if (!skipping) kept.push(line);
  }
  const block = (heading: string, table: string[]): string[] => (table.length === 0 ? [] : [heading, "", ...table, ""]);
  const inserted = [...block(headings.questions, questionTable(open)), ...block(headings.decisions, decisionTable(decisions))];
  const where = at < 0 ? kept.length : at;
  const head = kept.slice(0, where);
  if (inserted.length > 0 && head.length > 0 && head[head.length - 1].trim() !== "") head.push("");
  const out = [...head, ...inserted, ...kept.slice(where)];
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

/** The rows of a review as questions to add: no options (asked as text), the evidence as the impact. */
export function reviewDrafts(rows: ReadonlyArray<{ severity: string; question: string; evidence: string; target: string }>, whole: string): DraftQuestion[] {
  return rows.map((r) => ({
    severity: r.severity,
    question: (r.target === whole ? r.question : `${r.target}: ${r.question}`).replace(/[|\r\n]+/g, " ").trim(),
    impact: `review, ${r.evidence}`.replace(/[|\r\n]+/g, " ").trim(),
    options: [],
  }));
}
