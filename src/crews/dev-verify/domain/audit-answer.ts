// The auditor's answer: the JSON schema it is extracted into, and the check that
// turns the extraction into an AuditAnswer or the list of what is wrong with it.
// Pure, no IO. Axes are spelt as the verdict files spell them, so the learning
// pass reads the rows this answer becomes.

import type { Severity } from "../../../shared/domain/dev/verdict-format.ts";
import { AXES } from "../../../shared/domain/dev/verdict-format.ts";
import type { Axis } from "../../../shared/domain/dev/verdict-format.ts";
import type { Checked } from "../../../shared/domain/agents/charter.ts";

/** The axes live with the verdict format; re-exported for this crew's importers. */
export { AXES };
export type { Axis };
export const SEVERITY_ORDER: readonly Severity[] = ["Blocking", "Major", "Minor"];

export interface AuditRow { severity: Severity; axis: Axis; gap: string; evidence: string; fix: string }
export interface Undecided { check: string; reason: string }
export interface AuditAnswer { verdict: "VALID" | "GAPS"; rows: AuditRow[]; validations: string[]; undecided: Undecided[] }

export const MAX_ANSWER_ROWS = 40;
export const MAX_VALIDATIONS = 3;

export const AUDIT_ANSWER_SCHEMA: object = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["VALID", "GAPS"] },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: [...SEVERITY_ORDER] },
          axis: { type: "string", enum: [...AXES] },
          gap: { type: "string" },
          evidence: { type: "string" },
          fix: { type: "string" },
        },
        required: ["severity", "axis", "gap", "evidence", "fix"],
      },
    },
    validations: { type: "array", items: { type: "string" } },
    undecided: {
      type: "array",
      items: {
        type: "object",
        properties: { check: { type: "string" }, reason: { type: "string" } },
        required: ["check", "reason"],
      },
    },
  },
  required: ["verdict", "rows", "validations"],
};

/** A path:line citation, or the capture it comes from. */
const CITATION = /[A-Za-z0-9_./-]+:\d+/;
/** An axis label that names the plan by its staleness (LC:36). */
const PLAN_ALIAS = "stale plan";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function axisOf(label: string): Axis | undefined {
  const folded = label.toLowerCase();
  if (folded.startsWith(PLAN_ALIAS)) return "Plan";
  return AXES.find((a) => a.toLowerCase() === folded);
}

function citesEvidence(evidence: string): boolean {
  return CITATION.test(evidence) || evidence.includes("table.md") || evidence.includes("capture-");
}

function checkRow(value: unknown, k: number, problems: string[]): AuditRow | undefined {
  const item = isPlainObject(value) ? value : {};
  const before = problems.length;
  const severity = text(item.severity);
  if (!SEVERITY_ORDER.includes(severity as Severity)) problems.push(`row ${k}: severity must be Blocking, Major or Minor`);
  const label = text(item.axis);
  const axis = axisOf(label);
  if (axis === undefined) problems.push(`row ${k}: axis '${label}' is not one of ${AXES.join(", ")}`);
  const fields = { gap: text(item.gap), evidence: text(item.evidence), fix: text(item.fix) };
  for (const [field, value] of Object.entries(fields)) {
    if (value === "") problems.push(`row ${k}: ${field} is empty`);
  }
  if (fields.evidence !== "" && !citesEvidence(fields.evidence)) problems.push(`row ${k}: evidence cites no path:line`);
  if (problems.length > before || axis === undefined) return undefined;
  return { severity: severity as Severity, axis, ...fields };
}

export function checkAuditAnswer(value: unknown): Checked<AuditAnswer> {
  if (!isPlainObject(value)) return { ok: false, problems: ["the answer is not an object"] };
  const problems: string[] = [];
  const verdict = text(value.verdict);
  if (verdict !== "VALID" && verdict !== "GAPS") problems.push("verdict must be VALID or GAPS");

  const rows: AuditRow[] = [];
  if (!Array.isArray(value.rows)) {
    problems.push("rows must be a list");
  } else {
    if (value.rows.length > MAX_ANSWER_ROWS) problems.push(`at most ${MAX_ANSWER_ROWS} rows, not ${value.rows.length}`);
    value.rows.forEach((item, i) => {
      const checked = checkRow(item, i + 1, problems);
      if (checked) rows.push(checked);
    });
  }

  let validations: string[] = [];
  if (!Array.isArray(value.validations) || value.validations.some((v) => typeof v !== "string")) {
    problems.push("validations must be a list of commands");
  } else {
    validations = value.validations.map((v: string) => v.trim());
    if (validations.length > MAX_VALIDATIONS) problems.push(`at most ${MAX_VALIDATIONS} validations, not ${validations.length}`);
  }

  const undecided: Undecided[] = [];
  const items = value.undecided ?? [];
  if (!Array.isArray(items)) {
    problems.push("undecided must be a list");
  } else {
    items.forEach((item, i) => {
      const entry = isPlainObject(item) ? { check: text(item.check), reason: text(item.reason) } : { check: "", reason: "" };
      if (entry.check === "" || entry.reason === "") problems.push(`undecided ${i + 1}: check and reason are needed`);
      else undecided.push(entry);
    });
  }

  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value: { verdict: verdict as AuditAnswer["verdict"], rows, validations, undecided } };
}
