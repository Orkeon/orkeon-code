// Checks on the commands a wave ran and the lines it answered.
import { ok } from "node:assert";
import type { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";

/** The shell ran every command of `commands`. */
export function assertRan(shell: FakeShell, ...commands: string[]): void {
  for (const c of commands) ok(shell.commands.includes(c), `never ran: ${c}\n${shell.commands.join("\n")}`);
}

/** The shell ran no command of `commands`. */
export function assertNotRan(shell: FakeShell, ...commands: string[]): void {
  for (const c of commands) ok(!shell.commands.includes(c), `ran: ${c}`);
}

/** The shell ran `later` after `earlier`. */
export function assertRanAfter(shell: FakeShell, later: string, earlier: string): void {
  ok(shell.commands.indexOf(later) > shell.commands.indexOf(earlier), `${later} not after ${earlier}:\n${shell.commands.join("\n")}`);
}

/** No line of `lines` starts with `prefix`. */
export function assertNoLineStarting(lines: readonly string[], prefix: string): void {
  ok(!lines.some((l) => l.startsWith(prefix)), `a line starts with ${prefix}:\n${lines.join("\n")}`);
}

/** A line of `lines` holds every one of `parts`. */
export function assertLineWith(lines: readonly string[], ...parts: string[]): void {
  ok(lines.some((l) => parts.every((p) => l.includes(p))), `no line holding ${parts.join(" and ")}:\n${lines.join("\n")}`);
}

/** No line of `lines` holds `part`. */
export function assertNoLineWith(lines: readonly string[], part: string): void {
  ok(!lines.some((l) => l.includes(part)), `a line holds ${part}:\n${lines.join("\n")}`);
}
