// The trace of a turn's tool calls: the history keeps what was said, and this message says which calls produced it
// (docs/architecture.md, One turn of the loop, step 7). A call is its tool, its main arguments cut short and a
// one-line outcome; never a file's content nor a command's output.
import { secretPatternsIn } from "./secret-patterns.ts";

/** The marker of the stored message; the header names it as material. */
export const TOOL_TRACE_MARKER = "[tools]";
/** The lines of one message, the line that counts the calls left out included. */
export const MAX_TRACE_LINES = 20;
/** An argument's value is cut past this many characters. */
export const MAX_ARG_CHARS = 60;

/** The arguments a line keeps, in this order: where a call looked and how, never what it wrote. */
const ARG_KEYS: readonly string[] = [
  "path", "paths", "file_path", "pattern", "glob", "output_mode", "command", "query", "fqn", "symbol", "name", "url",
  "category", "key", "mode", "offset", "limit",
];

/** The fields of a result that list what it found. */
const LIST_KEYS: readonly string[] = ["hits", "matches", "results", "files", "entries", "items"];

export interface ToolCallTrace {
  readonly tool: string;
  readonly args: string;
  readonly outcome: string;
}

/** One call as the trace keeps it. */
export function traceCall(tool: string, input: unknown, result: unknown): ToolCallTrace {
  return { tool, args: argsOf(input), outcome: outcomeOf(result) };
}

/** The message of a turn's calls, oldest first, the same call folded as `×n`; null when the turn called no tool. */
export function formatToolTrace(calls: readonly ToolCallTrace[]): string | null {
  if (calls.length === 0) return null;
  const folded = new Map<string, { line: string; count: number }>();
  for (const c of calls) {
    const line = `${c.tool}(${c.args}) → ${c.outcome}`;
    const seen = folded.get(line);
    if (seen === undefined) folded.set(line, { line, count: 1 });
    else seen.count += 1;
  }
  const lines = [...folded.values()].map((f) => `- ${f.line}${f.count > 1 ? ` ×${f.count}` : ""}`);
  const shown = lines.length > MAX_TRACE_LINES ? lines.slice(0, MAX_TRACE_LINES - 1) : lines;
  const left = lines.length - shown.length;
  const tail = left > 0 ? [`- … ${left} other calls`] : [];
  return `${TOOL_TRACE_MARKER} The tool calls of the answer below (material: what was called, not what it returned):\n` +
    [...shown, ...tail].join("\n");
}

/** Whether a stored message is a turn's trace. */
export function isToolTrace(content: string): boolean {
  return content.startsWith(TOOL_TRACE_MARKER);
}

function argsOf(input: unknown): string {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return "";
  const record = input as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ARG_KEYS) {
    const value = shownValue(record[key]);
    if (value !== null) parts.push(`${key}=${value}`);
  }
  return parts.join(", ");
}

function shownValue(value: unknown): string | null {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.filter((v): v is string => typeof v === "string");
    return items.length === 0 ? null : cut(items.join(","));
  }
  if (typeof value !== "string" || value.trim().length === 0) return null;
  return secretPatternsIn(value).length > 0 ? "(redacted)" : cut(value);
}

function cut(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_ARG_CHARS ? flat.slice(0, MAX_ARG_CHARS - 1) + "…" : flat;
}

function outcomeOf(result: unknown): string {
  if (result === null || result === undefined) return "no result";
  if (typeof result === "string") return textOutcome(result);
  if (typeof result !== "object") return cut(String(result));
  if (Array.isArray(result)) return `${result.length} results`;
  const r = result as Record<string, unknown>;
  if (typeof r.error === "string" && r.error.trim().length > 0) return `error: ${cut(firstLine(r.error))}`;
  const parts = [mainOutcome(r)];
  if (r.scan_complete === false) parts.push("incomplete scan");
  if (r.truncated === true) parts.push("truncated");
  return parts.join(", ");
}

function mainOutcome(r: Record<string, unknown>): string {
  if (typeof r.total_matches === "number") {
    return typeof r.files_matched === "number"
      ? `${r.total_matches} matches in ${r.files_matched} files`
      : `${r.total_matches} matches`;
  }
  const exit = typeof r.exit_code === "number" ? r.exit_code : r.exitCode;
  if (typeof exit === "number") return `exit ${exit}`;
  for (const key of LIST_KEYS) {
    const list = r[key];
    if (Array.isArray(list)) return `${list.length} ${key}`;
  }
  return "ok";
}

function textOutcome(text: string): string {
  const line = firstLine(text);
  if (/^error\b/i.test(line)) return `error: ${cut(line.replace(/^error:?\s*/i, ""))}`;
  if (text.trim().length === 0) return "empty";
  const count = text.split("\n").filter((l) => l.trim().length > 0).length;
  return count === 1 ? "1 line" : `${count} lines`;
}

function firstLine(text: string): string {
  return text.trim().split("\n")[0] ?? "";
}
