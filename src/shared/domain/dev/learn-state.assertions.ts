// Checks on what parseLearnState returns.
import { strictEqual } from "node:assert";
import type { LearnState, StateRead } from "./learn-state.ts";

/** `r` is a problem naming the file and the parser's first line: one line, in parentheses. */
export function assertNotJsonProblem(r: StateRead<LearnState>): void {
  strictEqual(r.ok, false, "invalid JSON was read as a state");
  if (!r.ok) {
    strictEqual(r.problem.startsWith(".orkeon/dev-learn-state.json is not JSON ("), true, `the problem does not name the file: ${r.problem}`);
    strictEqual(r.problem.endsWith(")"), true, `the problem does not close its parenthesis: ${r.problem}`);
    strictEqual(r.problem.includes("\n"), false, `the problem takes more than a line: ${r.problem}`);
  }
}
