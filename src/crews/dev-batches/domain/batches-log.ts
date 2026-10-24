// The lines /dev-batches appends to its log, `.orkeon/dev/<code>/batches-state.md`: the harness's
// shape, read back by shared/domain/dev/batches-state.ts, the start scripts and scripts/dev-run.sh.
// `- YYYY-MM-DD HH:MM F<n> <event> <detail>`, and `- YYYY-MM-DD HH:MM closed` last. Pure.
import type { BatchesLogEntry } from "../../../shared/domain/dev/batches-state.ts";
import { batchesStatePath } from "../../../shared/domain/workflow/state-file.ts";

export type BatchEvent = "launched" | "relaunched" | "returned" | "merged" | "stopped";

/** The log's path under the workspace: Code's own state, never the harness's `<CODE>-BATCHES-STATE.md`. */
export function batchesLogPath(code: string): string {
  return `/workspace/${batchesStatePath(code)}`;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** `YYYY-MM-DD HH:MM` of a date, in UTC (the runtime's clock carries no zone the log could name). */
export function stamp(at: Date): string {
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())} ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`;
}

/** One line; the detail is kept on one line and bounded. */
export function eventLine(at: Date, batch: string, event: BatchEvent, detail = ""): string {
  const d = detail.replace(/\s+/g, " ").trim().slice(0, 200);
  return `- ${stamp(at)} ${batch} ${event}${d === "" ? "" : ` ${d}`}`;
}

export function closedLine(at: Date): string {
  return `- ${stamp(at)} closed`;
}

/** The log with `lines` appended; a new log starts with its title and its `## Log` heading. */
export function appendToLog(text: string | null, code: string, lines: readonly string[]): string {
  const base = text === null || text.trim() === ""
    ? `# ${code.toUpperCase()}-BATCHES-STATE\n\n## Log\n\n`
    : text.endsWith("\n") ? text : `${text}\n`;
  return base + lines.map((l) => `${l}\n`).join("");
}

/** The batch's last entry; undefined when it has none. */
export function lastEntryOf(entries: readonly BatchesLogEntry[], batch: string): BatchesLogEntry | undefined {
  for (let i = entries.length - 1; i >= 0; i--) if (entries[i].batch === batch) return entries[i];
  return undefined;
}
