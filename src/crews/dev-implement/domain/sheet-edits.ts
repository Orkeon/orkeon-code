// The other lines code writes into a batch sheet and its global plan, besides the TDD boxes: the assumptions a
// role settled mid-batch (rows `| H<n> | <text> | the user |` of `## Assumptions`), and at the close
// the done marks - the sheet's title ` — done (<date>)`, the plan's `### Batch F<n> — <Name> — done (<date>)` and
// its step boxes ticked. Each edit is idempotent. Pure, never throws.
import { parseBatchSheet, unfencedLines } from "../../../shared/domain/dev/plan-format.ts";

/** An answer's way of saying it assumed nothing: `none`, `none needed — …`, `n/a`, `nothing`. */
const NO_ASSUMPTION = /^(?:none|n\/a|nothing)\b/i;

/** The `Assumption: <text>` lines of a role's answer, in order, once each; a line that assumes nothing is no row. */
export function assumptionsOf(answer: string): string[] {
  const out: string[] = [];
  for (const raw of answer.split("\n")) {
    const m = /^\s*(?:[-*]\s*)?\**Assumption\**\s*:\s*(.+)$/i.exec(raw);
    const text = m?.[1].replace(/\s+/g, " ").replace(/\|/g, "/").trim();
    if (text && !NO_ASSUMPTION.test(text) && !out.includes(text)) out.push(text);
  }
  return out;
}

const TABLE_HEAD = ["| # | Assumption | To be validated by |", "|---|------------|--------------------|"];

/** The sheet with each new assumption as an `H<n>` row of the `## Assumptions` table (`/dev-plan` renders it empty;
 *  the section created before `## Decisions`, else at the end), numbered after the rows it holds, the list lines of
 *  older sheets counted; an assumption already written is not written again. */
export function addAssumptions(text: string, assumptions: readonly string[]): { text: string; added: string[] } {
  if (assumptions.length === 0) return { text, added: [] };
  const held = parseBatchSheet(text).assumptions ?? [];
  const known = new Set(held.map((a) => a.assumption));
  let n = held.reduce((max, a) => Math.max(max, Number(a.id.slice(1))), 0);
  const added = assumptions.filter((a) => !known.has(a));
  if (added.length === 0) return { text, added: [] };
  const rows = added.map((a) => `| H${++n} | ${a} | the user |`);
  const raw = text.split("\n");
  const lines = unfencedLines(text);
  const at = lines.findIndex((l) => l.text.trim() === "## Assumptions");
  if (at >= 0) {
    const next = lines.slice(at + 1).find((l) => l.text.startsWith("## "));
    let end = next === undefined ? raw.length : next.line - 1;
    while (end > lines[at].line && raw[end - 1].trim() === "") end--;
    const body = raw.slice(lines[at].line, end);
    // A section without the table (or with list lines after it) gets a table of its own after what it holds.
    const table = body.length > 0 && body.at(-1)!.trim().startsWith("|") && body.some((l) => l.trim() === TABLE_HEAD[0]);
    raw.splice(end, 0, ...(table ? rows : [...(body.length > 0 ? [""] : []), ...TABLE_HEAD, ...rows]));
    return { text: raw.join("\n"), added };
  }
  const decisions = lines.find((l) => l.text.trim() === "## Decisions");
  const block = ["## Assumptions", ...TABLE_HEAD, ...rows, ""];
  if (decisions !== undefined) raw.splice(decisions.line - 1, 0, ...block);
  else raw.push(...(raw[raw.length - 1]?.trim() === "" ? [] : [""]), ...block);
  return { text: raw.join("\n"), added };
}

/** The sheet's title with ` — done (<date>)`; unchanged when it already says done. */
export function markSheetDone(text: string, date: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((l) => /^# \S+-PLAN-F\d+ — /.test(l));
  if (at < 0 || / — done \(\d{4}-\d{2}-\d{2}\)$/.test(lines[at].trimEnd())) return text;
  lines[at] = `${lines[at].trimEnd()} — done (${date})`;
  return lines.join("\n");
}

/** The global plan with `### Batch <batch> — <Name> — open` made `— done (<date>)` and that batch's `- [ ]` boxes
 *  ticked; unchanged when the batch is not found or is done already. */
export function markPlanBatchDone(text: string, batch: string, date: string): string {
  const lines = text.split("\n");
  const head = new RegExp(`^### Batch ${batch} — (.+) — open$`);
  const at = lines.findIndex((l) => head.test(l.trimEnd()));
  if (at < 0) return text;
  lines[at] = lines[at].trimEnd().replace(/ — open$/, ` — done (${date})`);
  for (let i = at + 1; i < lines.length && !lines[i].startsWith("#"); i++) {
    lines[i] = lines[i].replace(/^(\s*)- \[ \] /, "$1- [x] ");
  }
  return lines.join("\n");
}
