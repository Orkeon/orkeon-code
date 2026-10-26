// Checks on what runDevImplement answers and leaves behind.
import { ok, strictEqual } from "node:assert";
import type { ImplementAnswer } from "../../../../src/crews/dev-implement/application/run-dev-implement.ts";

const blocked = (a: ImplementAnswer): string | undefined => a.lines.find((l) => l.startsWith("BLOCKED"));

/** The run went through: no line of `a` says BLOCKED. */
export function assertNotBlocked(a: ImplementAnswer): void {
  strictEqual(blocked(a), undefined, a.lines.join("\n"));
}

/** The run stopped on a BLOCKED line starting with `start`. */
export function assertBlockedStarting(a: ImplementAnswer, start: string): void {
  ok(blocked(a)?.startsWith(start), `no BLOCKED line starts with ${JSON.stringify(start)}:\n${a.lines.join("\n")}`);
}

/** The run stopped on a BLOCKED line holding every one of `parts`. */
export function assertBlockedSaying(a: ImplementAnswer, ...parts: string[]): void {
  const line = blocked(a);
  for (const part of parts) ok(line?.includes(part), `no BLOCKED line says ${JSON.stringify(part)}:\n${a.lines.join("\n")}`);
}

/** `a` holds the line `line`, whole. */
export function assertLine(a: ImplementAnswer, line: string): void {
  ok(a.lines.includes(line), `no line ${JSON.stringify(line)}:\n${a.lines.join("\n")}`);
}

/** A line of `a` starts with `start`. */
export function assertLineStarting(a: ImplementAnswer, start: string): void {
  ok(a.lines.some((l) => l.startsWith(start)), `no line starts with ${JSON.stringify(start)}:\n${a.lines.join("\n")}`);
}

/** `sheet` holds `count` TDD lines ticked whole. */
export function assertTicked(sheet: string, ticked: string, count: number): void {
  strictEqual(sheet.split(ticked).length - 1, count, `the sheet has ${sheet.split(ticked).length - 1} steps ticked, not ${count}`);
}

/** No prompt of `acts` carries a ## Precedents block. */
export function assertNoPrecedents(acts: ReadonlyArray<{ prompt: string }>): void {
  for (const act of acts) ok(!act.prompt.includes("## Precedents"), `a prompt carries precedents: ${act.prompt.slice(-200)}`);
}

/** Every prompt of `acts` ends with `block`. */
export function assertPromptsEndWith(acts: ReadonlyArray<{ prompt: string }>, block: string): void {
  for (const act of acts) ok(act.prompt.trimEnd().endsWith(block), act.prompt.slice(-200));
}
