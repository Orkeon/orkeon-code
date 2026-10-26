// Checks on what writeCapture wrote and ran.
import { ok } from "node:assert";
import type { FakeFiles } from "../../../support/doubles/fake-files.ts";
import type { FakeShell } from "../../../support/doubles/fake-shell.ts";

/** The shell ran each of `commands`. */
export function assertRan(shell: FakeShell, commands: readonly string[]): void {
  for (const command of commands) ok(shell.commands.includes(command), `the shell did not run ${command}`);
}

/** Every write went under `dir`. */
export function assertWritesUnder(files: FakeFiles, dir: string): void {
  for (const w of files.writes) ok(w.path.startsWith(`${dir}/`), `${w.path} is written outside ${dir}`);
}

/** No write is longer than `max` characters. */
export function assertWritesWithin(files: FakeFiles, max: number): void {
  for (const w of files.writes) ok(w.content.length <= max, `${w.path} is ${w.content.length}`);
}
