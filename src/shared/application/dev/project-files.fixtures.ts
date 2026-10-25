// Shells whose git lists the project's files, refuses, or throws.
import { FakeShell } from "../../../../tests/support/doubles/fake-shell.ts";
import { PROJECT_FILES_COMMAND } from "./project-files.ts";

export const LISTED = "src/math.js\nworkbench/calc/CALC-PLAN.md\nsrc/stats.js\n";

/** A shell whose git answers `stdout` with `exitCode`. */
export function listingShell(stdout: string, exitCode = 0): FakeShell {
  const shell = new FakeShell();
  shell.results[PROJECT_FILES_COMMAND] = { stdout, exitCode };
  return shell;
}

/** A shell whose git call the runtime refuses. */
export function refusingShell(): FakeShell {
  const shell = new FakeShell();
  shell.errors[PROJECT_FILES_COMMAND] = new Error("shell refused");
  return shell;
}
