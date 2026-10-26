// The reviewer's answer: the JSON schema its review is extracted into, and the
// check that turns the extraction into a ReviewAnswer or the list of what is wrong
// with it. Pure, no IO. Only two severities exist: wording is never reported, so a
// review has no Minor row. Each row targets what the caller says it may (in plan
// mode the global plan or one of its batches) and cites where it comes from.

import type { Checked } from "../agents/charter.ts";

export type ReviewSeverity = "Blocking" | "Major";
export interface ReviewRow { severity: ReviewSeverity; question: string; evidence: string; target: string }
export interface ReviewAnswer { verdict: "CLEAR" | "GAPS"; rows: ReviewRow[] }
/** What a row may target. Plan mode: ["plan", "F1", …, "Fn"]. A target is one of them, alone or followed by a
 *  qualifier (`F2 (step 1)` is F2); one that names two of them is refused. */
export interface ReviewCheckContext { targets: readonly string[] }

export const MAX_REVIEW_ROWS = 12;
const MAX_QUESTION_CHARS = 300;
const SEVERITIES: readonly ReviewSeverity[] = ["Blocking", "Major"];

export const REVIEW_ANSWER_SCHEMA: object = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["CLEAR", "GAPS"] },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: [...SEVERITIES] },
          question: { type: "string" },
          evidence: { type: "string" },
          target: { type: "string" },
        },
        required: ["severity", "question", "evidence", "target"],
      },
    },
  },
  required: ["verdict", "rows"],
};

/** A path:line, a section (§ 3, §3, § Anchors) or a heading of the plan (## …). */
const PATH_LINE = /[A-Za-z0-9_./-]+:\d+/;
const SECTION = /§ ?\S/;
const HEADING = /##\s*\S/;

/** `value` as one table cell: a line break becomes a space, a `\` then a `|` are escaped (the backslash first, so
 *  that a `\` before a `|` cannot undo the pipe's escape). A quoted design row or a path with a `|` is no reason
 *  to refuse the row and run the extraction again. */
function cell(value: string): string {
  return value.replace(/\s*[\r\n]+\s*/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|").trim();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fold(question: string): string {
  return question.toLowerCase().replace(/\s+/g, " ");
}

/** "plan, F1…F3" for a plan's targets; the plain list when there are fewer than three. */
function targetList(targets: readonly string[]): string {
  if (targets.length < 3) return targets.join(", ");
  return `${targets[0]}, ${targets[1]}…${targets[targets.length - 1]}`;
}

const WORD = "[A-Za-z0-9_]";
const escaped = (id: string): string => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Whether `id` stands in `text` as a whole word (`F1` in `F1-F3`, not in `F12`). */
const wholeWord = (text: string, id: string): boolean => new RegExp(`(?:^|(?!${WORD}).)${escaped(id)}(?!${WORD})`, "i").test(text);

/** The allowed id a target names: equal to one, or one followed by a qualifier (`F2 (step 1)`, `F3: step 2`), case
 *  folded, the longest id first; `{ two: true }` when the qualifier names a second allowed id as a whole word
 *  (`plan (F2)`, `F1-F3`); null when none (`F4`, `F12` when F1 alone is allowed). */
export function targetId(target: string, targets: readonly string[]): { id: string } | { two: true } | null {
  const named = target.trim();
  const byLength = [...targets].sort((a, b) => b.length - a.length);
  const id = byLength.find((t) => new RegExp(`^${escaped(t)}(?!${WORD})`, "i").test(named));
  if (id === undefined) return null;
  const rest = named.slice(id.length);
  return byLength.some((t) => wholeWord(rest, t)) ? { two: true } : { id };
}

/** Why a question is not one closed question fitting a table cell, or undefined when it is. */
function questionFault(question: string): string | undefined {
  if (question === "") return "it is empty";
  if (question.length > MAX_QUESTION_CHARS) return `it is longer than ${MAX_QUESTION_CHARS} characters`;
  if (!question.endsWith("?")) return "it does not end with ?";
  return undefined;
}

function citesSource(evidence: string): boolean {
  return PATH_LINE.test(evidence) || SECTION.test(evidence) || HEADING.test(evidence);
}

function checkRow(value: unknown, k: number, ctx: ReviewCheckContext, problems: string[]): ReviewRow | undefined {
  const item = isPlainObject(value) ? value : {};
  const before = problems.length;
  const severity = text(item.severity);
  if (!SEVERITIES.includes(severity as ReviewSeverity)) problems.push(`row ${k}: severity must be Blocking or Major`);
  const question = cell(text(item.question));
  const fault = questionFault(question);
  if (fault !== undefined) problems.push(`row ${k}: the question must be one closed question ending with ? (${fault})`);
  const evidence = cell(text(item.evidence));
  if (evidence === "") problems.push(`row ${k}: evidence is empty`);
  else if (!citesSource(evidence)) problems.push(`row ${k}: evidence cites no path:line, § section or heading`);
  const named = text(item.target);
  const target = targetId(named, ctx.targets);
  if (target === null) problems.push(`row ${k}: target '${named}' is not one of ${targetList(ctx.targets)}`);
  else if ("two" in target) problems.push(`row ${k}: target '${named}' names two targets`);
  if (problems.length > before || target === null || "two" in target) return undefined;
  return { severity: severity as ReviewSeverity, question, evidence, target: target.id };
}

export function checkReviewAnswer(value: unknown, ctx: ReviewCheckContext): Checked<ReviewAnswer> {
  if (!isPlainObject(value)) return { ok: false, problems: ["the answer is not an object"] };
  const problems: string[] = [];
  const said = text(value.verdict);
  if (said !== "CLEAR" && said !== "GAPS") problems.push("verdict must be CLEAR or GAPS");

  const rows: ReviewRow[] = [];
  // The rows are the substance: the verdict follows them. A review that opens with "CLEAR" and then asks two
  // questions is GAPS, whatever word the extraction copied.
  let verdict: ReviewAnswer["verdict"] = said === "GAPS" ? "GAPS" : "CLEAR";
  if (!Array.isArray(value.rows)) {
    problems.push("rows must be a list");
  } else {
    verdict = value.rows.length > 0 ? "GAPS" : "CLEAR";
    if (value.rows.length > MAX_REVIEW_ROWS) problems.push(`at most ${MAX_REVIEW_ROWS} rows, not ${value.rows.length}`);
    const seen = new Map<string, number>();
    value.rows.forEach((item, i) => {
      const k = i + 1;
      const checked = checkRow(item, k, ctx, problems);
      const question = isPlainObject(item) ? text(item.question) : "";
      if (question !== "") {
        const first = seen.get(fold(question));
        if (first !== undefined) problems.push(`row ${k}: repeats row ${first}`);
        else seen.set(fold(question), k);
      }
      if (checked) rows.push(checked);
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: { verdict, rows } };
}
