// Checks on the lines a /dev-batches run answers and the brief its reviewer is handed.
import { ok } from "node:assert";

/** `lines` holds `line` exactly. */
export function assertHasLine(lines: readonly string[], line: string): void {
  ok(lines.includes(line), `no line ${line}:\n${lines.join("\n")}`);
}

/** A line of `lines` starts with `prefix`. */
export function assertLineStarting(lines: readonly string[], prefix: string): void {
  ok(lines.some((l) => l.startsWith(prefix)), `no line starting with ${prefix}:\n${lines.join("\n")}`);
}

/** The last line of `lines` starts with `prefix`. */
export function assertLastLineStarting(lines: readonly string[], prefix: string): void {
  ok(lines.at(-1)?.startsWith(prefix), `the last line does not start with ${prefix}:\n${lines.join("\n")}`);
}

/** The last line of `lines` holds `part`. */
export function assertLastLineWith(lines: readonly string[], part: string): void {
  ok(lines.at(-1)?.includes(part), `the last line does not hold ${part}:\n${lines.join("\n")}`);
}

/** A line of `lines` holds every one of `parts`. */
export function assertLineWith(lines: readonly string[], ...parts: string[]): void {
  ok(lines.some((l) => parts.every((p) => l.includes(p))), `no line holding ${parts.join(" and ")}:\n${lines.join("\n")}`);
}

/** No line of `lines` holds `part`. */
export function assertNoLineWith(lines: readonly string[], part: string): void {
  ok(!lines.some((l) => l.includes(part)), `a line holds ${part}:\n${lines.join("\n")}`);
}

/** `text` holds every one of `parts`. */
export function assertMentions(text: string, parts: readonly string[]): void {
  for (const p of parts) ok(text.includes(p), `missing ${JSON.stringify(p)} in:\n${text}`);
}
