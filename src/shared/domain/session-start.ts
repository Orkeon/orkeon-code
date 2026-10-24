// The block the runtime puts before the first free-text turn of a session: what the
// script named by Orkeon:Cli:Session:StartScript printed at the REPL's start, with its
// path and its source. Pure, no IO. The command reads it off its raw input (the
// command's tokens never hold it); the main loop renders its lines as context of that
// turn. The source is dropped: the model needs what the script found, not its code.

/** The start script's output, as the main loop receives it in its inputs. */
export interface StartOutput {
  script: string;
  lines: string[];
}

/** At most this many lines of the script's output reach the model, each cut to MAX_START_LINE_CHARS. */
export const MAX_START_LINES = 40;
export const MAX_START_LINE_CHARS = 240;

const HEADER = /^\[Session start script: ([^\]\n]+)\]\n/;
const SOURCE_MARKER = "\n[Script source]\n";
const END_MARKER = "\n[End of session start script]";

/** Cut a line to the bound, saying so. */
function bounded(line: string): string {
  return line.length <= MAX_START_LINE_CHARS ? line : line.slice(0, MAX_START_LINE_CHARS - 1) + "…";
}

/** The output's non-blank lines, bounded, with a last line saying how many were left out. */
function boundedLines(stdout: string): string[] {
  const lines = stdout.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (lines.length <= MAX_START_LINES) return lines.map(bounded);
  return [...lines.slice(0, MAX_START_LINES).map(bounded), `(${lines.length - MAX_START_LINES} more line(s) left out)`];
}

/**
 * The start block at the head of a command's raw input, and the input without it;
 * `start` is null when the input does not open with a whole block (the runtime's
 * header, its source marker and its end marker, in that order).
 */
export function splitStartOutput(raw: string): { start: StartOutput | null; rest: string } {
  const text = String(raw ?? "");
  const header = HEADER.exec(text);
  if (header === null) return { start: null, rest: text };
  const sourceAt = text.indexOf(SOURCE_MARKER, header[0].length - 1);
  if (sourceAt < 0) return { start: null, rest: text };
  const endAt = text.indexOf(END_MARKER, sourceAt + SOURCE_MARKER.length - 1);
  if (endAt < 0) return { start: null, rest: text };
  const stdout = text.slice(header[0].length, sourceAt);
  const lines = boundedLines(stdout);
  const rest = text.slice(endAt + END_MARKER.length).replace(/^\s+/, "");
  return { start: lines.length === 0 ? null : { script: header[1].trim(), lines }, rest };
}

/** The `sessionStart` input as the main loop reads it: null unless a script path and lines. */
export function readStartOutput(value: unknown): StartOutput | null {
  if (value === null || typeof value !== "object") return null;
  const v = value as { script?: unknown; lines?: unknown };
  if (typeof v.script !== "string" || v.script.trim().length === 0 || !Array.isArray(v.lines)) return null;
  const lines = v.lines.filter((l): l is string => typeof l === "string" && l.trim().length > 0);
  if (lines.length === 0) return null;
  return { script: v.script.trim(), lines: boundedLines(lines.join("\n")) };
}
